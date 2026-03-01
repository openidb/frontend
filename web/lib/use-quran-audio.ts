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
const DECODE_TIMEOUT_MS = 10000;
const DECODE_CONCURRENT = 3;
const CACHE_MAX = 96;

function audioUrl(surah: number, ayah: number): string {
  return `/api/quran/audio/${surah}/${ayah}?reciter=${encodeURIComponent(DEFAULT_RECITER)}`;
}

// --- Silent WAV for iOS audio activation (copied from voice app) ---

function generateSilentWavDataUrl(): string {
  const sampleRate = 8000;
  const numSamples = sampleRate;
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

let ACTIVATION_WAV_URL: string | null = null;
function getActivationWavUrl(): string {
  if (!ACTIVATION_WAV_URL) ACTIVATION_WAV_URL = generateSilentWavDataUrl();
  return ACTIVATION_WAV_URL;
}

// --- LRU Buffer Cache (copied from voice app) ---

class LRUBufferCache {
  private map = new Map<string, AudioBuffer>();
  private rawMap = new Map<string, ArrayBuffer>();
  private order: string[] = [];
  private failed = new Set<string>();

  get(url: string): AudioBuffer | undefined {
    const buf = this.map.get(url);
    if (buf) {
      const idx = this.order.indexOf(url);
      if (idx !== -1) {
        this.order.splice(idx, 1);
        this.order.push(url);
      }
    }
    return buf;
  }

  has(url: string): boolean { return this.map.has(url); }

  set(url: string, buffer: AudioBuffer, raw?: ArrayBuffer): void {
    if (this.map.has(url)) {
      const idx = this.order.indexOf(url);
      if (idx !== -1) this.order.splice(idx, 1);
    } else if (this.map.size >= CACHE_MAX) {
      const oldest = this.order.shift();
      if (oldest) { this.map.delete(oldest); this.rawMap.delete(oldest); }
    }
    this.map.set(url, buffer);
    if (raw) this.rawMap.set(url, raw);
    this.order.push(url);
  }

  getRaw(url: string): ArrayBuffer | undefined { return this.rawMap.get(url); }
  markFailed(url: string): void { this.failed.add(url); }
  isFailed(url: string): boolean { return this.failed.has(url); }
  clearFailures(): void { this.failed.clear(); }
}

// Module-level (persists across mounts)
const bufferCache = new LRUBufferCache();
const inflightFetches = new Map<string, Promise<AudioBuffer | null>>();

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

// --- Hook ---

export function useQuranAudio(
  surahNumber: number,
  targetAyah: number,
  totalAyahs: number,
  mushafPages: MushafPageData[],
  router: AppRouterInstance,
  initialAudioMode: boolean,
  onNavigate?: (ayah: number) => void,
  surahNameEnglish?: string,
  surahNameArabic?: string,
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

  // --- Audio graph refs (copied from voice app: useRef, not module-level) ---
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const mediaStreamDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const directOutputEnabledRef = useRef(false);
  const lastBridgePlayAttemptAtRef = useRef(0);
  const decodeInFlightRef = useRef(0);
  const decodeQueueRef = useRef<Array<() => void>>([]);
  const audioActivatedRef = useRef(false);
  const elementObjectUrlRef = useRef<string | null>(null);

  // Active playback state
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const activeStartTimeRef = useRef(0);
  const activeAyahRef = useRef<number | null>(null);
  const activeSurahRef = useRef<number | null>(null);
  const isPlayingRef = useRef(false);
  // Whether we're using <audio> element directly (fallback) vs Web Audio API
  const elementModeRef = useRef(false);

  const recitedPositions = useMemo(
    () => collectRecitedWordPositions(mushafPages, surahNumber, targetAyah),
    [mushafPages, surahNumber, targetAyah],
  );
  const recitedPositionsRef = useRef(recitedPositions);
  recitedPositionsRef.current = recitedPositions;

  // ====================================================================
  // Audio graph management — copied exactly from voice app
  // ====================================================================

  const ensureAudioGraph = useCallback((): AudioContext | null => {
    let ctx = audioCtxRef.current;
    if (!ctx || ctx.state === "closed") {
      try {
        ctx = new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      } catch { return null; }
      audioCtxRef.current = ctx;
      mediaStreamDestRef.current = null;
      gainNodeRef.current = null;
    }
    if (!mediaStreamDestRef.current) {
      const dest = ctx.createMediaStreamDestination();
      const gain = ctx.createGain();
      gain.connect(dest);
      mediaStreamDestRef.current = dest;
      gainNodeRef.current = gain;
    }
    return ctx;
  }, []);

  const hardResetAudioGraph = useCallback((): AudioContext | null => {
    const existing = audioCtxRef.current;
    if (existing) { try { existing.close().catch(() => {}); } catch {} }
    audioCtxRef.current = null;
    mediaStreamDestRef.current = null;
    gainNodeRef.current = null;
    directOutputEnabledRef.current = false;
    return ensureAudioGraph();
  }, [ensureAudioGraph]);

  const ensureRunningAudioGraph = useCallback((): AudioContext | null => {
    let ctx = ensureAudioGraph();
    if (!ctx) return null;
    if ((ctx.state as string) === "interrupted") {
      ctx = hardResetAudioGraph();
      if (!ctx) return null;
    }
    if (ctx.state !== "running") {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }, [ensureAudioGraph, hardResetAudioGraph]);

  const setDirectOutputEnabled = useCallback((enabled: boolean) => {
    const ctx = ensureAudioGraph();
    const gain = gainNodeRef.current;
    if (!ctx || !gain) return;
    if (enabled) {
      if (directOutputEnabledRef.current) return;
      try { gain.connect(ctx.destination); directOutputEnabledRef.current = true; } catch {}
      return;
    }
    if (!directOutputEnabledRef.current) return;
    try { gain.disconnect(ctx.destination); } catch {}
    directOutputEnabledRef.current = false;
  }, [ensureAudioGraph]);

  // ====================================================================
  // Bridge pattern — copied exactly from voice app
  // ====================================================================

  const ensureMediaElementBridge = useCallback((attemptPlay: boolean, force = false) => {
    const el = audioRef.current;
    const dest = mediaStreamDestRef.current;
    if (!el || !dest) return;
    if (el.srcObject !== dest.stream) el.srcObject = dest.stream;
    if (el.volume !== 1) el.volume = 1;
    if (el.muted) el.muted = false;
    if (!attemptPlay || !el.paused) return;
    const now = Date.now();
    if (!force && now - lastBridgePlayAttemptAtRef.current < 1000) return;
    lastBridgePlayAttemptAtRef.current = now;
    el.play().then(() => {
      setDirectOutputEnabled(false);
    }).catch(() => {
      // Bridge failed — ensure direct output as fallback
      setDirectOutputEnabled(true);
    });
  }, [setDirectOutputEnabled]);

  // ====================================================================
  // Activate — copied exactly from voice app
  // ====================================================================

  const activate = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      const hasElementTrack = !el.srcObject && !!el.currentSrc;
      if (hasElementTrack) {
        // Don't disturb existing element playback
      } else if (el.srcObject) {
        if (el.paused) el.play().catch(() => {});
      } else {
        el.volume = 0;
        el.src = getActivationWavUrl();
        el.play().then(() => {
          el.pause();
          el.currentTime = 0;
          el.volume = 1;
        }).catch(() => { el.volume = 1; });
      }
    }
    audioActivatedRef.current = true;
    const ctx = ensureRunningAudioGraph();
    if (ctx && ctx.state !== "running") {
      const recovered = hardResetAudioGraph();
      if (recovered && recovered.state !== "running") {
        recovered.resume().catch(() => {});
      }
    }
  }, [ensureRunningAudioGraph, hardResetAudioGraph]);

  // ====================================================================
  // Decode concurrency limiter — copied from voice app
  // ====================================================================

  const withDecodeSlot = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    if (decodeInFlightRef.current >= DECODE_CONCURRENT) {
      await new Promise<void>((resolve) => { decodeQueueRef.current.push(resolve); });
    }
    decodeInFlightRef.current += 1;
    try { return await fn(); }
    finally {
      decodeInFlightRef.current = Math.max(0, decodeInFlightRef.current - 1);
      const next = decodeQueueRef.current.shift();
      if (next) next();
    }
  }, []);

  // ====================================================================
  // Fetch + decode — copied from voice app
  // ====================================================================

  const fetchBuffer = useCallback(async (url: string, signal?: AbortSignal): Promise<AudioBuffer | null> => {
    if (bufferCache.has(url)) return bufferCache.get(url)!;
    if (bufferCache.isFailed(url)) return null;
    const existing = inflightFetches.get(url);
    if (existing) return existing;

    const promise = (async (): Promise<AudioBuffer | null> => {
      try {
        const ctx = ensureAudioGraph();
        if (!ctx) return null;
        const res = await fetch(url, { signal });
        if (!res.ok) {
          if (res.status === 400 || res.status === 404) bufferCache.markFailed(url);
          return null;
        }
        const ab = await res.arrayBuffer();
        const rawClone = ab.slice(0);
        const buf = await withDecodeSlot(() =>
          Promise.race([
            ctx.decodeAudioData(ab),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("decode timeout")), DECODE_TIMEOUT_MS)),
          ]));
        bufferCache.set(url, buf, rawClone);
        return buf;
      } catch (e) {
        if ((e as Error).name === "AbortError") return null;
        return null;
      } finally { inflightFetches.delete(url); }
    })();

    inflightFetches.set(url, promise);
    return promise;
  }, [withDecodeSlot, ensureAudioGraph]);

  const prefetchBuffer = useCallback((url: string) => {
    if (bufferCache.has(url) || bufferCache.isFailed(url) || inflightFetches.has(url)) return;
    fetchBuffer(url).catch(() => {});
  }, [fetchBuffer]);

  // ====================================================================
  // Source management
  // ====================================================================

  const stopActiveSource = useCallback(() => {
    const source = activeSourceRef.current;
    if (source) {
      try { source.onended = null; source.stop(); } catch {}
      try { source.disconnect(); } catch {}
      activeSourceRef.current = null;
    }
    activeAyahRef.current = null;
    activeSurahRef.current = null;
  }, []);

  const revokeElementObjectUrl = useCallback(() => {
    if (elementObjectUrlRef.current) {
      URL.revokeObjectURL(elementObjectUrlRef.current);
      elementObjectUrlRef.current = null;
    }
  }, []);

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
        for (const [ayahNum, segData] of Object.entries(data.ayahs))
          map.set(Number(ayahNum), segData);
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
  }, [isAudioMode, surahNumber, targetAyah, totalAyahs, prefetchBuffer]);

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
  const navigateRef = useRef(navigateToAyah);
  navigateRef.current = navigateToAyah;
  const targetAyahRef = useRef(targetAyah);
  targetAyahRef.current = targetAyah;
  const totalAyahsRef = useRef(totalAyahs);
  totalAyahsRef.current = totalAyahs;
  const surahRef = useRef(surahNumber);
  surahRef.current = surahNumber;

  useEffect(() => { navigatingRef.current = false; }, [targetAyah]);

  // ====================================================================
  // Play ayah via <audio> element directly (element mode — from voice app)
  // This is the MOST RELIABLE path on all platforms.
  // Web Audio scheduling is used only when element mode is not active.
  // ====================================================================

  const playViaElementRef = useRef<(url: string, ayah: number, surah: number) => void>(() => {});

  const playViaElement = useCallback((url: string, ayah: number, surah: number) => {
    const el = audioRef.current;
    if (!el) return;

    elementModeRef.current = true;
    stopActiveSource(); // stop any Web Audio source

    // 1. Clear old event handlers first (voice app pattern: stopElementMode)
    el.onended = null;
    el.onerror = null;
    el.onplaying = null;

    // 2. Clear bridge stream BEFORE setting src (critical ordering!)
    el.pause();
    el.srcObject = null;

    // 3. Set new source
    el.loop = false;
    revokeElementObjectUrl();
    const raw = bufferCache.getRaw(url);
    if (raw) {
      const objectUrl = URL.createObjectURL(new Blob([raw], { type: "audio/mpeg" }));
      elementObjectUrlRef.current = objectUrl;
      el.src = objectUrl;
    } else {
      el.src = url;
    }
    el.volume = 1;
    if (el.muted) el.muted = false;

    activeAyahRef.current = ayah;
    activeSurahRef.current = surah;
    activeStartTimeRef.current = 0;
    isPlayingRef.current = true;
    setIsPlaying(true);

    // 4. Set event handlers (voice app pattern: use stable ref for callbacks)
    el.onplaying = () => {
      activeStartTimeRef.current = performance.now() / 1000;
    };
    el.onended = () => playViaElementRef.current(
      audioUrl(surahRef.current, targetAyahRef.current + 1),
      targetAyahRef.current + 1,
      surahRef.current,
    );
    el.onerror = () => playViaElementRef.current(
      audioUrl(surahRef.current, targetAyahRef.current + 1),
      targetAyahRef.current + 1,
      surahRef.current,
    );

    // 5. Play
    el.play().catch(() => {
      setTimeout(() => {
        el.play().catch(() => {
          isPlayingRef.current = false;
          setIsPlaying(false);
        });
      }, 100);
    });
  }, [stopActiveSource, revokeElementObjectUrl]);

  // Keep ref in sync (voice app pattern: playNextElementRef.current = playNextElement)
  playViaElementRef.current = (url: string, ayah: number, surah: number) => {
    // Guard: don't advance past end of surah
    const total = totalAyahsRef.current;
    const curAyah = targetAyahRef.current;
    if (curAyah >= total) {
      revokeElementObjectUrl();
      isPlayingRef.current = false;
      setIsPlaying(false);
      setHighlightedPosition(null);
      elementModeRef.current = false;
      return;
    }
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    playViaElement(url, ayah, surah);
    navigateRef.current(ayah);
  };

  // ====================================================================
  // Play ayah via Web Audio API (for word highlighting precision)
  // Falls back to element mode if bridge fails.
  // ====================================================================

  const playViaWebAudio = useCallback((buffer: AudioBuffer, ayah: number, surah: number) => {
    const ctx = audioCtxRef.current;
    const gain = gainNodeRef.current;
    if (!ctx || !gain || ctx.state === "closed") {
      // Fall back to element mode
      playViaElement(audioUrl(surah, ayah), ayah, surah);
      return;
    }

    elementModeRef.current = false;
    stopActiveSource();

    // Reset gain
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(1, ctx.currentTime);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.start(ctx.currentTime);

    activeSourceRef.current = source;
    activeStartTimeRef.current = ctx.currentTime;
    activeAyahRef.current = ayah;
    activeSurahRef.current = surah;
    isPlayingRef.current = true;
    setIsPlaying(true);

    source.onended = () => {
      source.disconnect();
      if (activeSourceRef.current !== source) return;
      activeSourceRef.current = null;
      if (navigatingRef.current) return;
      const curAyah = targetAyahRef.current;
      const total = totalAyahsRef.current;
      if (curAyah < total) {
        navigatingRef.current = true;
        // Gapless: start next immediately if cached
        const nextUrl = audioUrl(surah, curAyah + 1);
        const nextBuf = bufferCache.get(nextUrl);
        if (nextBuf && ctx.state === "running") {
          const nextSource = ctx.createBufferSource();
          nextSource.buffer = nextBuf;
          nextSource.connect(gain);
          nextSource.start(ctx.currentTime);
          activeSourceRef.current = nextSource;
          activeStartTimeRef.current = ctx.currentTime;
          activeAyahRef.current = curAyah + 1;
          activeSurahRef.current = surah;
          nextSource.onended = () => {
            nextSource.disconnect();
            if (activeSourceRef.current !== nextSource) return;
            activeSourceRef.current = null;
          };
        } else {
          // No cached buffer — fall back to element mode for next ayah
          playViaElement(nextUrl, curAyah + 1, surah);
        }
        navigateRef.current(curAyah + 1);
      } else {
        isPlayingRef.current = false;
        setIsPlaying(false);
        setHighlightedPosition(null);
        const el = audioRef.current;
        if (el) { el.srcObject = null; el.pause(); }
      }
    };
  }, [stopActiveSource, playViaElement]);

  // ====================================================================
  // Skip helpers
  // ====================================================================

  const skipForward = useCallback(() => {
    if (targetAyah >= totalAyahs || navigatingRef.current) return;
    navigatingRef.current = true;
    const wasPlaying = isPlayingRef.current;
    if (wasPlaying) {
      playViaElement(audioUrl(surahNumber, targetAyah + 1), targetAyah + 1, surahNumber);
    }
    navigateToAyah(targetAyah + 1);
  }, [targetAyah, totalAyahs, navigateToAyah, surahNumber, playViaElement]);

  const skipBack = useCallback(() => {
    if (targetAyah <= 1 || navigatingRef.current) return;
    navigatingRef.current = true;
    const wasPlaying = isPlayingRef.current;
    if (wasPlaying) {
      playViaElement(audioUrl(surahNumber, targetAyah - 1), targetAyah - 1, surahNumber);
    }
    navigateToAyah(targetAyah - 1);
  }, [targetAyah, navigateToAyah, surahNumber, playViaElement]);

  const skipForwardRef = useRef(skipForward);
  skipForwardRef.current = skipForward;
  const skipBackRef = useRef(skipBack);
  skipBackRef.current = skipBack;

  // ====================================================================
  // Audio lifecycle: reconnect to gapless source or prefetch
  // ====================================================================

  useEffect(() => {
    if (!isAudioMode) return;

    // Check if element mode is already playing this ayah (from skip or auto-advance)
    if (elementModeRef.current && activeAyahRef.current === targetAyah) {
      isPlayingRef.current = true;
      setIsPlaying(true);
      return;
    }

    // Prefetch current ayah's audio
    prefetchBuffer(audioUrl(surahNumber, targetAyah));
  }, [isAudioMode, surahNumber, targetAyah, totalAyahs, prefetchBuffer]);

  // ====================================================================
  // rAF word highlighting
  // ====================================================================

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

      if (elementModeRef.current) {
        // Element mode: use audio element currentTime
        const el = audioRef.current;
        if (el && !el.paused && activeAyahRef.current === targetAyah) {
          timeMs = el.currentTime * 1000;
        }
      } else {
        // Web Audio mode: use AudioContext timing
        const ctx = audioCtxRef.current;
        if (ctx && activeAyahRef.current === targetAyah) {
          timeMs = (ctx.currentTime - activeStartTimeRef.current) * 1000;
        }
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

  // ====================================================================
  // MediaSession: lock screen controls
  // ====================================================================

  useEffect(() => {
    if (!("mediaSession" in navigator) || !isAudioMode) {
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "none";
        navigator.mediaSession.metadata = null;
      }
      return;
    }
    // Voice app pattern: "English (Arabic) — Ayah N"
    const nameEn = surahNameEnglish || `Surah ${surahNumber}`;
    const surahDisplay = surahNameArabic ? `${nameEn} (${surahNameArabic})` : nameEn;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${surahDisplay} — Ayah ${targetAyah}`,
      artist: "Al-Afasy",
      album: "Quran",
    });
    // Clear position state — prevents iOS from showing seek buttons instead of skip
    try { navigator.mediaSession.setPositionState(); } catch {}
  }, [isAudioMode, surahNumber, targetAyah, surahNameEnglish, surahNameArabic]);

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
      const el = audioRef.current;
      // If element is paused with a src, just resume
      if (el && el.paused && el.currentSrc && elementModeRef.current) {
        el.play().catch(() => {});
        isPlayingRef.current = true;
        setIsPlaying(true);
      } else {
        // Start fresh
        const url = audioUrl(surahRef.current, targetAyahRef.current);
        playViaElement(url, targetAyahRef.current, surahRef.current);
      }
    }));
    ms.setActionHandler("pause", debounced(() => {
      const el = audioRef.current;
      if (el) el.pause();
      isPlayingRef.current = false;
      setIsPlaying(false);
    }));
    // iOS fires "stop" on background — treat as pause (voice app pattern)
    ms.setActionHandler("stop", debounced(() => {
      const el = audioRef.current;
      if (el) el.pause();
      isPlayingRef.current = false;
      setIsPlaying(false);
    }));
    ms.setActionHandler("nexttrack", debounced(() => skipForwardRef.current()));
    ms.setActionHandler("previoustrack", debounced(() => skipBackRef.current()));
    ms.setActionHandler("seekforward", null);
    ms.setActionHandler("seekbackward", null);

    // Clear position state — having position/duration makes iOS show seek UI
    try { ms.setPositionState(); } catch {}

    return () => {
      ms.setActionHandler("play", null);
      ms.setActionHandler("pause", null);
      ms.setActionHandler("stop", null);
      ms.setActionHandler("nexttrack", null);
      ms.setActionHandler("previoustrack", null);
      ms.setActionHandler("seekforward", null);
      ms.setActionHandler("seekbackward", null);
    };
  }, [isAudioMode, stopActiveSource, playViaElement]);

  // ====================================================================
  // User actions
  // ====================================================================

  const toggleAudioMode = useCallback(() => {
    setIsAudioMode((prev) => {
      if (prev) {
        stopActiveSource();
        isPlayingRef.current = false;
        setIsPlaying(false);
        setHighlightedPosition(null);
        elementModeRef.current = false;
        const el = audioRef.current;
        if (el) {
          el.onended = null;
          el.srcObject = null;
          el.pause();
          el.removeAttribute("src");
        }
        revokeElementObjectUrl();
        router.replace(`/quran/${surahNumber}/${targetAyah}`);
      } else {
        // Activate in user gesture context (iOS unlock)
        activate();
        router.replace(`/quran/${surahNumber}/${targetAyah}?audio=1`);
      }
      return !prev;
    });
  }, [router, surahNumber, targetAyah, activate, stopActiveSource, revokeElementObjectUrl]);

  const play = useCallback(() => {
    // Use element mode (el.src = url) as the primary playback path.
    // This is what triggers iOS media center / lock screen controls.
    // Word highlighting works via el.currentTime.
    const url = audioUrl(surahNumber, targetAyah);
    playViaElement(url, targetAyah, surahNumber);
  }, [surahNumber, targetAyah, playViaElement]);

  const pause = useCallback(() => {
    const el = audioRef.current;
    if (el) el.pause();
    if (!elementModeRef.current) stopActiveSource();
    isPlayingRef.current = false;
    setIsPlaying(false);
  }, [stopActiveSource]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const source = activeSourceRef.current;
      if (source) { try { source.stop(); } catch {} }
      cancelAnimationFrame(rafIdRef.current);
      const el = audioRef.current;
      if (el) { el.onended = null; el.srcObject = null; el.pause(); }
      if (elementObjectUrlRef.current) URL.revokeObjectURL(elementObjectUrlRef.current);
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
    };
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
