"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, X, Check, Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

type VoiceState = "idle" | "recording" | "transcribing";

interface VoiceRecorderProps {
  onRecordingChange: (recording: boolean) => void;
  onTranscription: (text: string) => void;
  onError: (message: string) => void;
  showMic: boolean;
}

export function VoiceRecorder({
  onRecordingChange,
  onTranscription,
  onError,
  showMic,
}: VoiceRecorderProps) {
  const { t } = useTranslation();
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [supported, setSupported] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Feature detection
  useEffect(() => {
    const isSupported =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined";
    setSupported(isSupported);
  }, []);

  const stopStream = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    analyserRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  // Draw waveform when recording starts and canvas is available
  useEffect(() => {
    if (voiceState !== "recording") return;

    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Scale for high-DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      const barCount = 40;
      const barWidth = 2.5;
      const totalWidth = barCount * barWidth + (barCount - 1) * 2;
      const startX = (w - totalWidth) / 2;
      const centerY = h / 2;
      const maxBarH = centerY - 2;

      for (let i = 0; i < barCount; i++) {
        // Map bars to frequency data — center bars get mid frequencies
        const mirrorI = i < barCount / 2 ? barCount / 2 - 1 - i : i - barCount / 2;
        const dataIndex = Math.floor((mirrorI / (barCount / 2)) * bufferLength * 0.4) + 2;
        const value = dataArray[dataIndex] / 255;
        const barH = Math.max(2, value * maxBarH);

        const x = startX + i * (barWidth + 2);
        const radius = barWidth / 2;

        ctx.globalAlpha = 0.5 + value * 0.5;
        ctx.fillStyle = "#31b9c9";

        // Top half — rounded rect
        ctx.beginPath();
        ctx.roundRect(x, centerY - barH, barWidth, barH, [radius, radius, 0, 0]);
        ctx.fill();

        // Bottom half — rounded rect
        ctx.beginPath();
        ctx.roundRect(x, centerY, barWidth, barH, [0, 0, radius, radius]);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    draw();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [voiceState]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up audio analysis for waveform
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Determine supported MIME type
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.start(100);
      setVoiceState("recording");
      onRecordingChange(true);
    } catch (err) {
      const error = err as Error;
      if (
        error.name === "NotAllowedError" ||
        error.name === "PermissionDeniedError"
      ) {
        onError(t("search.voiceError") || "Microphone permission denied");
      } else if (error.name === "NotFoundError") {
        onError(t("search.voiceError") || "No microphone found");
      } else {
        onError(t("search.voiceError") || "Could not access microphone");
      }
      stopStream();
    }
  }, [onRecordingChange, onError, stopStream, t]);

  const cancelRecording = useCallback(() => {
    stopStream();
    setVoiceState("idle");
    onRecordingChange(false);
  }, [stopStream, onRecordingChange]);

  const confirmRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      cancelRecording();
      return;
    }

    // Stop recording and wait for final data
    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        resolve(new Blob(chunksRef.current, { type: mimeType }));
      };
      recorder.stop();
    });

    // Stop animation and stream
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setVoiceState("transcribing");

    try {
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      const formData = new FormData();
      formData.append("audio", blob, `recording.${ext}`);

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Transcription failed");
      }

      const data = await response.json();
      const text = (data.text || "").trim();

      if (!text) {
        onError(t("search.voiceError") || "No speech detected");
      } else {
        onTranscription(text);
      }
    } catch (err) {
      console.error("Transcription error:", err);
      onError(t("search.voiceError") || "Transcription failed");
    } finally {
      stopStream();
      setVoiceState("idle");
      onRecordingChange(false);
    }
  }, [cancelRecording, onTranscription, onError, onRecordingChange, stopStream, t]);

  // Not supported — render nothing
  if (!supported) return null;

  // Idle state — show mic icon button
  if (voiceState === "idle") {
    if (!showMic) return null;
    return (
      <button
        onClick={startRecording}
        className="absolute right-3 md:right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
        aria-label={t("search.voiceRecord")}
        type="button"
      >
        <Mic className="h-4 w-4 md:h-5 md:w-5" />
      </button>
    );
  }

  // Recording / Transcribing mode — full-width container
  return (
    <div className="flex items-center gap-1.5 h-10 md:h-12 border rounded-lg bg-background px-1.5 w-full">
      {/* Cancel button */}
      <button
        onClick={cancelRecording}
        className="shrink-0 h-7 w-7 flex items-center justify-center bg-muted hover:bg-muted/80 rounded-md text-muted-foreground hover:text-foreground transition-colors"
        aria-label={t("common.cancel")}
        type="button"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Waveform or transcribing indicator */}
      <div className="flex-1 flex items-center justify-center min-w-0">
        {voiceState === "transcribing" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{t("search.voiceTranscribing")}</span>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            width={300}
            height={48}
            className="w-full h-8"
          />
        )}
      </div>

      {/* Confirm button */}
      <button
        onClick={confirmRecording}
        disabled={voiceState === "transcribing"}
        className="shrink-0 h-7 w-7 flex items-center justify-center rounded-md transition-colors disabled:opacity-50"
        style={{ backgroundColor: "rgba(49, 185, 201, 0.15)", color: "#31b9c9" }}
        aria-label={t("common.confirm")}
        type="button"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
