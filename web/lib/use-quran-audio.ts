"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { MushafPageData } from "@/components/MushafPageClient";

interface SegmentData {
  segments: number[][]; // [word_pos, start_ms, end_ms][]
  duration: number | null;
}

interface SegmentsResponse {
  ayahs: Record<string, SegmentData>;
}

export interface UseQuranAudioReturn {
  isAudioMode: boolean;
  isPlaying: boolean;
  toggleAudioMode: () => void;
  play: () => void;
  pause: () => void;
  skipForward: () => void;
  skipBack: () => void;
  highlightedPosition: number | null;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

const DEFAULT_RECITER = "tarteel/alafasy";
const PRELOAD_AHEAD = 3;
const PRELOAD_BEHIND = 1;
const MEDIA_SESSION_DEBOUNCE_MS = 300;

function audioUrl(surah: number, ayah: number): string {
  return `/api/quran/audio/${surah}/${ayah}?reciter=${encodeURIComponent(DEFAULT_RECITER)}`;
}

// --- Silent WAV for iOS audio activation (from voice app) ---

function generateSilentWavDataUrl(): string {
  const sampleRate = 8000;
  const numSamples = sampleRate; // 1 second
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  view.setUint32(0, 0x52494646, false);
  view.setUint32(4, 36 + dataSize, true);
  view.setUint32(8, 0x57415645, false);
  view.setUint32(12, 0x666d7420, false);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461, false);
  view.setUint32(40, dataSize, true);
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return "data:audio/wav;base64," + btoa(binary);
}

let silentWavUrl: string | null = null;
function getSilentWavUrl(): string {
  if (!silentWavUrl) silentWavUrl = generateSilentWavDataUrl();
  return silentWavUrl;
}

// --- Module-level audio engine ---

let audioCtx: AudioContext | null = null;
let gainNode: GainNode | null = null;
let mediaStreamDest: MediaStreamAudioDestinationNode | null = null;
const bufferCache = new Map<string, AudioBuffer>();
const rawCache = new Map<string, ArrayBuffer>();
const fetchingUrls = new Set<string>();

let activeAyah: number | null = null;
let activeSource: AudioBufferSourceNode | null = null;
let activeStartTime = 0;
let activeSurah: number | null = null;

/**
 * Create AudioContext + MediaStreamDestination (voice app pattern).
 * Sources connect to gainNode → mediaStreamDest.
 * The <audio> element plays mediaStreamDest.stream → triggers iOS media center.
 */
function ensureAudioGraph(): AudioContext {
  if (audioCtx && (audioCtx.state === "suspended" || (audioCtx.state as string) === "interrupted")) {
    try { audioCtx.close().catch(() => {}); } catch {}
    audioCtx = null;
    gainNode = null;
    mediaStreamDest = null;
  }
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    mediaStreamDest = null;
    gainNode = null;
  }
  if (!mediaStreamDest) {
    mediaStreamDest = audioCtx.createMediaStreamDestination();
    gainNode = audioCtx.createGain();
    gainNode.connect(mediaStreamDest);
    // Also connect to destination directly as fallback (desktop browsers)
    gainNode.connect(audioCtx.destination);
  }
  return audioCtx;
}

function getGainNode(): GainNode {
  ensureAudioGraph();
  return gainNode!;
}

/**
 * Bridge: pipe AudioContext output through <audio> element.
 * This is what makes iOS show the media center controls.
 */
function bridgeToAudioElement(el: HTMLAudioElement | null): void {
  if (!el || !mediaStreamDest) return;
  if (el.srcObject !== mediaStreamDest.stream) {
    el.srcObject = mediaStreamDest.stream;
  }
  if (el.paused) {
    el.play().catch(() => {});
  }
}

/**
 * Activate audio on iOS: play silent WAV through <audio> element.
 * Must be called from user gesture.
 */
function activateAudio(el: HTMLAudioElement | null): void {
  if (!el) return;
  if (!el.srcObject && !el.currentSrc) {
    el.volume = 0;
    el.src = getSilentWavUrl();
    el.play().then(() => {
      el.pause();
      el.currentTime = 0;
      el.volume = 1;
    }).catch(() => {
      el.volume = 1;
    });
  } else if (el.srcObject && el.paused) {
    el.play().catch(() => {});
  }
}

async function fetchRawAudio(url: string): Promise<ArrayBuffer | null> {
  if (rawCache.has(url)) return rawCache.get(url)!;
  if (fetchingUrls.has(url)) {
    return new Promise((resolve) => {
      const check = () => {
        if (rawCache.has(url) || bufferCache.has(url)) resolve(rawCache.get(url) ?? null);
        else if (!fetchingUrls.has(url)) resolve(null);
        else setTimeout(check, 50);
      };
      check();
    });
  }
  fetchingUrls.add(url);
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    rawCache.set(url, ab);
    return ab;
  } catch {
    return null;
  } finally {
    fetchingUrls.delete(url);
  }
}

async function getBuffer(url: string): Promise<AudioBuffer | null> {
  if (bufferCache.has(url)) return bufferCache.get(url)!;
  const raw = rawCache.get(url) ?? await fetchRawAudio(url);
  if (!raw || !audioCtx) return null;
  try {
    const buf = await audioCtx.decodeAudioData(raw.slice(0));
    bufferCache.set(url, buf);
    return buf;
  } catch {
    return null;
  }
}

function prefetchBuffer(url: string): void {
  if (bufferCache.has(url) || fetchingUrls.has(url)) return;
  if (rawCache.has(url)) {
    if (audioCtx && audioCtx.state !== "closed") getBuffer(url).catch(() => {});
    return;
  }
  fetchRawAudio(url).then(() => {
    if (audioCtx && audioCtx.state !== "closed") getBuffer(url).catch(() => {});
  }).catch(() => {});
}

function stopActiveSource(): void {
  if (activeSource) {
    try { activeSource.onended = null; activeSource.stop(); } catch {}
    try { activeSource.disconnect(); } catch {}
    activeSource = null;
  }
  activeAyah = null;
  activeSurah = null;
}

function collectRecitedWordPositions(
  mushafPages: MushafPageData[],
  surahNumber: number,
  targetAyah: number,
): number[] {
  const wps = new Set<number>();
  for (const page of mushafPages) {
    for (const line of page.lines) {
      if (line.lineType !== "text" && line.lineType !== "bismillah") continue;
      for (const w of line.words) {
        if (w.surahNumber === surahNumber && w.ayahNumber === targetAyah && w.charType === "word") {
          wps.add(w.wordPosition);
        }
      }
    }
  }
  return Array.from(wps).sort((a, b) => a - b);
}

function startNextAyahGapless(surah: number, nextAyah: number): void {
  const url = audioUrl(surah, nextAyah);
  const buffer = bufferCache.get(url);
  if (!buffer || !audioCtx || !gainNode) return;

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(gainNode);
  source.start(audioCtx.currentTime);

  activeSource = source;
  activeStartTime = audioCtx.currentTime;
  activeAyah = nextAyah;
  activeSurah = surah;
}

// --- Hook ---

export function useQuranAudio(
  surahNumber: number,
  targetAyah: number,
  totalAyahs: number,
  mushafPages: MushafPageData[],
  router: AppRouterInstance,
  initialAudioMode: boolean,
  onNavigate?: (ayah: number) => void,
): UseQuranAudioReturn {
  const [isAudioMode, setIsAudioMode] = useState(initialAudioMode);
  const [isPlaying, setIsPlaying] = useState(false);
  const [highlightedPosition, setHighlightedPosition] = useState<number | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafIdRef = useRef<number>(0);
  const segmentCacheRef = useRef<Map<string, Map<number, SegmentData>>>(new Map());
  const fetchingSegmentsRef = useRef<Set<string>>(new Set());
  const prevHighlightRef = useRef<number | null>(null);
  const navigatingRef = useRef(false);

  const recitedPositions = useMemo(
    () => collectRecitedWordPositions(mushafPages, surahNumber, targetAyah),
    [mushafPages, surahNumber, targetAyah],
  );
  const recitedPositionsRef = useRef(recitedPositions);
  recitedPositionsRef.current = recitedPositions;

  // Fetch segments
  useEffect(() => {
    if (!isAudioMode || !surahNumber) return;
    const cacheKey = `${DEFAULT_RECITER}:${surahNumber}`;
    if (segmentCacheRef.current.has(cacheKey) || fetchingSegmentsRef.current.has(cacheKey)) return;
    fetchingSegmentsRef.current.add(cacheKey);
    const controller = new AbortController();
    fetch(
      `/api/quran/segments?reciter=${encodeURIComponent(DEFAULT_RECITER)}&surah=${surahNumber}`,
      { signal: controller.signal },
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SegmentsResponse | null) => {
        if (!data?.ayahs) return;
        const map = new Map<number, SegmentData>();
        for (const [ayahNum, segData] of Object.entries(data.ayahs)) {
          map.set(Number(ayahNum), segData);
        }
        segmentCacheRef.current.set(cacheKey, map);
      })
      .catch(() => {})
      .finally(() => fetchingSegmentsRef.current.delete(cacheKey));
    return () => controller.abort();
  }, [isAudioMode, surahNumber]);

  // Prefetch adjacent ayah audio
  useEffect(() => {
    if (!isAudioMode || !surahNumber) return;
    for (let i = 1; i <= PRELOAD_AHEAD; i++) {
      const a = targetAyah + i;
      if (a <= totalAyahs) prefetchBuffer(audioUrl(surahNumber, a));
    }
    for (let i = 1; i <= PRELOAD_BEHIND; i++) {
      const a = targetAyah - i;
      if (a >= 1) prefetchBuffer(audioUrl(surahNumber, a));
    }
  }, [isAudioMode, surahNumber, targetAyah, totalAyahs]);

  // Navigation helpers
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;

  const navigateToAyah = useCallback(
    (ayah: number) => {
      if (onNavigateRef.current) onNavigateRef.current(ayah);
      else router.replace(`/quran/${surahNumber}/${ayah}?audio=1`);
    },
    [router, surahNumber],
  );

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const skipForward = useCallback(() => {
    if (targetAyah < totalAyahs && !navigatingRef.current) {
      navigatingRef.current = true;
      if (isPlayingRef.current) {
        ensureAudioGraph();
        startNextAyahGapless(surahNumber, targetAyah + 1);
      }
      navigateToAyah(targetAyah + 1);
    }
  }, [targetAyah, totalAyahs, navigateToAyah, surahNumber]);

  const skipBack = useCallback(() => {
    if (targetAyah > 1 && !navigatingRef.current) {
      navigatingRef.current = true;
      const wasPlaying = isPlayingRef.current;
      stopActiveSource();
      if (wasPlaying) {
        ensureAudioGraph();
        startNextAyahGapless(surahNumber, targetAyah - 1);
      }
      navigateToAyah(targetAyah - 1);
    }
  }, [targetAyah, navigateToAyah, surahNumber]);

  const skipForwardRef = useRef(skipForward);
  skipForwardRef.current = skipForward;
  const navigateRef = useRef(navigateToAyah);
  navigateRef.current = navigateToAyah;
  const targetAyahRef = useRef(targetAyah);
  targetAyahRef.current = targetAyah;
  const totalAyahsRef = useRef(totalAyahs);
  totalAyahsRef.current = totalAyahs;

  useEffect(() => { navigatingRef.current = false; }, [targetAyah]);

  // Audio lifecycle: reconnect to gapless source or prefetch
  useEffect(() => {
    if (!isAudioMode) return;
    let cancelled = false;

    if (activeSurah === surahNumber && activeAyah === targetAyah && activeSource) {
      setIsPlaying(true);
      // Re-bridge audio element for the new component mount
      bridgeToAudioElement(audioRef.current);
      activeSource.onended = () => {
        if (cancelled || navigatingRef.current) return;
        const ayah = targetAyahRef.current;
        const total = totalAyahsRef.current;
        if (ayah < total) {
          navigatingRef.current = true;
          startNextAyahGapless(surahNumber, ayah + 1);
          setIsPlaying(false);
          setHighlightedPosition(null);
          navigateRef.current(ayah + 1);
        } else {
          setIsPlaying(false);
          setHighlightedPosition(null);
        }
      };
      return () => { cancelled = true; if (activeSource) activeSource.onended = null; };
    }

    prefetchBuffer(audioUrl(surahNumber, targetAyah));
    return () => { cancelled = true; if (activeSource) activeSource.onended = null; };
  }, [isAudioMode, surahNumber, targetAyah, totalAyahs]);

  // Keep bridge alive: periodically ensure <audio> element is playing the stream
  useEffect(() => {
    if (!isAudioMode || !isPlaying) return;
    const interval = setInterval(() => {
      bridgeToAudioElement(audioRef.current);
    }, 500);
    return () => clearInterval(interval);
  }, [isAudioMode, isPlaying]);

  // rAF word highlighting
  useEffect(() => {
    if (!isAudioMode || !isPlaying) {
      if (prevHighlightRef.current !== null) {
        prevHighlightRef.current = null;
        setHighlightedPosition(null);
      }
      return;
    }
    const cacheKey = `${DEFAULT_RECITER}:${surahNumber}`;
    const tick = () => {
      const segMap = segmentCacheRef.current.get(cacheKey);
      const segData = segMap?.get(targetAyah);
      const positions = recitedPositionsRef.current;
      let timeMs = 0;
      if (audioCtx && activeAyah === targetAyah) {
        timeMs = (audioCtx.currentTime - activeStartTime) * 1000;
      }
      let newHighlight: number | null = null;
      if (segData?.segments && segData.segments.length > 0 && timeMs > 0) {
        const segs = segData.segments;
        const len = segs.length;
        const starts = new Array(len);
        const ends = new Array(len);
        for (let i = 0; i < len; i++) {
          starts[i] = segs[i][1];
          ends[i] = i + 1 < len ? segs[i + 1][1] : segs[i][2];
        }
        if (len > 1) {
          const lastDur = segs[len - 1][2] - segs[len - 1][1];
          const prevEndMs = segs[len - 2][2];
          const gap = starts[len - 1] - prevEndMs;
          if (lastDur < 200 && gap > 500) {
            const mid = prevEndMs + gap / 2;
            starts[len - 1] = mid;
            ends[len - 2] = mid;
          }
        }
        for (let i = 0; i < len; i++) {
          if (timeMs >= starts[i] && timeMs < ends[i]) {
            newHighlight = i < positions.length ? positions[i] : null;
            break;
          }
        }
      }
      if (newHighlight !== prevHighlightRef.current) {
        prevHighlightRef.current = newHighlight;
        setHighlightedPosition(newHighlight);
      }
      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafIdRef.current);
  }, [isAudioMode, isPlaying, surahNumber, targetAyah]);

  useEffect(() => () => cancelAnimationFrame(rafIdRef.current), []);

  // --- MediaSession: lock screen controls ---
  useEffect(() => {
    if (!("mediaSession" in navigator) || !isAudioMode) {
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "none";
        navigator.mediaSession.metadata = null;
      }
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `Surah ${surahNumber} — Ayah ${targetAyah}`,
      artist: "Al-Afasy",
      album: "Quran",
    });
    try { navigator.mediaSession.setPositionState(); } catch {}
  }, [isAudioMode, surahNumber, targetAyah]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = !isAudioMode ? "none" : isPlaying ? "playing" : "paused";
  }, [isAudioMode, isPlaying]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !isAudioMode) return;
    const ms = navigator.mediaSession;
    let lastActionTime = 0;
    const debounced = (fn: () => void) => () => {
      const now = Date.now();
      if (now - lastActionTime < MEDIA_SESSION_DEBOUNCE_MS) return;
      lastActionTime = now;
      fn();
    };

    ms.setActionHandler("play", debounced(() => {
      ensureAudioGraph();
      bridgeToAudioElement(audioRef.current);
      const url = audioUrl(surahNumber, targetAyah);
      const cached = bufferCache.get(url);
      if (cached) {
        stopActiveSource();
        const source = audioCtx!.createBufferSource();
        source.buffer = cached;
        source.connect(getGainNode());
        source.start(audioCtx!.currentTime);
        activeSource = source;
        activeStartTime = audioCtx!.currentTime;
        activeAyah = targetAyah;
        activeSurah = surahNumber;
        setIsPlaying(true);
        source.onended = () => {
          if (navigatingRef.current) return;
          const ayah = targetAyahRef.current;
          const total = totalAyahsRef.current;
          if (ayah < total) {
            navigatingRef.current = true;
            startNextAyahGapless(surahNumber, ayah + 1);
            setIsPlaying(false);
            setHighlightedPosition(null);
            navigateRef.current(ayah + 1);
          } else {
            setIsPlaying(false);
            setHighlightedPosition(null);
          }
        };
      }
    }));
    ms.setActionHandler("pause", debounced(() => { stopActiveSource(); setIsPlaying(false); }));
    ms.setActionHandler("stop", debounced(() => { stopActiveSource(); setIsPlaying(false); }));
    ms.setActionHandler("nexttrack", debounced(() => skipForwardRef.current()));
    ms.setActionHandler("previoustrack", debounced(() => {
      if (targetAyahRef.current > 1) {
        navigatingRef.current = true;
        stopActiveSource();
        ensureAudioGraph();
        startNextAyahGapless(surahNumber, targetAyahRef.current - 1);
        navigateRef.current(targetAyahRef.current - 1);
      }
    }));
    ms.setActionHandler("seekforward", null);
    ms.setActionHandler("seekbackward", null);

    return () => {
      ms.setActionHandler("play", null);
      ms.setActionHandler("pause", null);
      ms.setActionHandler("stop", null);
      ms.setActionHandler("nexttrack", null);
      ms.setActionHandler("previoustrack", null);
    };
  }, [isAudioMode, surahNumber, targetAyah]);

  // --- User actions ---

  const toggleAudioMode = useCallback(() => {
    setIsAudioMode((prev) => {
      if (prev) {
        stopActiveSource();
        setIsPlaying(false);
        setHighlightedPosition(null);
        // Disconnect bridge
        const el = audioRef.current;
        if (el) { el.srcObject = null; el.pause(); }
        router.replace(`/quran/${surahNumber}/${targetAyah}`);
      } else {
        // Activate audio (iOS unlock) + create AudioContext in user gesture
        activateAudio(audioRef.current);
        ensureAudioGraph();
        router.replace(`/quran/${surahNumber}/${targetAyah}?audio=1`);
      }
      return !prev;
    });
  }, [router, surahNumber, targetAyah]);

  const playFromBuffer = useCallback((buffer: AudioBuffer) => {
    const ctx = ensureAudioGraph();
    const gain = getGainNode();

    stopActiveSource();

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.start(ctx.currentTime);

    activeSource = source;
    activeStartTime = ctx.currentTime;
    activeAyah = targetAyah;
    activeSurah = surahNumber;
    setIsPlaying(true);

    // Bridge to <audio> element for iOS media center
    bridgeToAudioElement(audioRef.current);

    source.onended = () => {
      if (navigatingRef.current) return;
      const ayah = targetAyahRef.current;
      const total = totalAyahsRef.current;
      if (ayah < total) {
        navigatingRef.current = true;
        startNextAyahGapless(surahNumber, ayah + 1);
        setIsPlaying(false);
        setHighlightedPosition(null);
        navigateRef.current(ayah + 1);
      } else {
        setIsPlaying(false);
        setHighlightedPosition(null);
        // Stop bridge when playback ends
        const el = audioRef.current;
        if (el) { el.srcObject = null; el.pause(); }
      }
    };
  }, [surahNumber, targetAyah]);

  const play = useCallback(() => {
    // Re-activate on every play gesture (iOS can revoke after idle)
    activateAudio(audioRef.current);
    ensureAudioGraph();
    // Bridge immediately so iOS associates this gesture with audio element
    bridgeToAudioElement(audioRef.current);

    const url = audioUrl(surahNumber, targetAyah);
    const cached = bufferCache.get(url);
    if (cached) {
      playFromBuffer(cached);
      return;
    }
    getBuffer(url).then((buffer) => {
      if (buffer) playFromBuffer(buffer);
    });
  }, [surahNumber, targetAyah, playFromBuffer]);

  const pause = useCallback(() => {
    stopActiveSource();
    setIsPlaying(false);
  }, []);

  return {
    isAudioMode,
    isPlaying,
    toggleAudioMode,
    play,
    pause,
    skipForward,
    skipBack,
    highlightedPosition,
    audioRef,
  };
}
