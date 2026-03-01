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

function audioUrl(surah: number, ayah: number): string {
  return `/api/quran/audio/${surah}/${ayah}?reciter=${encodeURIComponent(DEFAULT_RECITER)}`;
}

// --- Module-level audio engine (persists across Next.js navigations) ---

let audioCtx: AudioContext | null = null;
let gainNode: GainNode | null = null;
const bufferCache = new Map<string, AudioBuffer>();
const rawCache = new Map<string, ArrayBuffer>(); // raw audio for deferred decode
const fetchingUrls = new Set<string>();

// Currently playing session — survives component re-mounts on navigation
let activeAyah: number | null = null;
let activeSource: AudioBufferSourceNode | null = null;
let activeStartTime = 0; // ctx.currentTime when source started
let activeSurah: number | null = null;

/**
 * Create/resume AudioContext. MUST be called from a user gesture on iOS/Safari.
 * Safe to call multiple times — only creates once.
 */
function ensureAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new AudioContext();
    gainNode = audioCtx.createGain();
    gainNode.connect(audioCtx.destination);
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function getGainNode(): GainNode {
  ensureAudioContext();
  if (!gainNode) {
    gainNode = audioCtx!.createGain();
    gainNode.connect(audioCtx!.destination);
  }
  return gainNode;
}

/**
 * Fetch raw audio data without requiring AudioContext.
 * Decoding happens lazily when AudioContext is available.
 */
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

/**
 * Get decoded AudioBuffer. Uses cache or decodes from raw data.
 * Requires AudioContext to be initialized (call ensureAudioContext first).
 */
async function getBuffer(url: string): Promise<AudioBuffer | null> {
  if (bufferCache.has(url)) return bufferCache.get(url)!;
  const raw = rawCache.get(url) ?? await fetchRawAudio(url);
  if (!raw || !audioCtx) return null;
  try {
    // decodeAudioData detaches the ArrayBuffer, so clone it
    const buf = await audioCtx.decodeAudioData(raw.slice(0));
    bufferCache.set(url, buf);
    return buf;
  } catch {
    return null;
  }
}

/** Prefetch audio data. Fetches raw data first (safe for useEffect), then decodes if AudioContext exists. */
function prefetchBuffer(url: string): void {
  if (bufferCache.has(url) || fetchingUrls.has(url)) return;
  if (rawCache.has(url)) {
    // Raw data available — decode if AudioContext is ready
    if (audioCtx && audioCtx.state !== "closed") {
      getBuffer(url).catch(() => {});
    }
    return;
  }
  fetchRawAudio(url).then(() => {
    // After fetching, try to decode if AudioContext is ready
    if (audioCtx && audioCtx.state !== "closed") {
      getBuffer(url).catch(() => {});
    }
  }).catch(() => {});
}

function stopActiveSource(): void {
  if (activeSource) {
    try {
      activeSource.onended = null;
      activeSource.stop();
    } catch {}
    try { activeSource.disconnect(); } catch {}
    activeSource = null;
  }
  activeAyah = null;
  activeSurah = null;
}

/**
 * Collect wordPosition values for the target ayah (charType "word").
 * wordPosition is unique within an ayah (unlike position which resets per line).
 * Returns sorted array that maps 1:1 with audio segments by index.
 */
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
        if (
          w.surahNumber === surahNumber &&
          w.ayahNumber === targetAyah &&
          w.charType === "word"
        ) {
          wps.add(w.wordPosition);
        }
      }
    }
  }

  return Array.from(wps).sort((a, b) => a - b);
}

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

  // Dummy ref for the <audio> element (kept for iOS media session if needed later)
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

  // Fetch segments for the surah
  useEffect(() => {
    if (!isAudioMode || !surahNumber) return;
    const cacheKey = `${DEFAULT_RECITER}:${surahNumber}`;
    if (segmentCacheRef.current.has(cacheKey)) return;
    if (fetchingSegmentsRef.current.has(cacheKey)) return;

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

  // Prefetch adjacent ayah audio buffers
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
      if (onNavigateRef.current) {
        onNavigateRef.current(ayah);
      } else {
        router.replace(`/quran/${surahNumber}/${ayah}?audio=1`);
      }
    },
    [router, surahNumber],
  );

  const skipForward = useCallback(() => {
    if (targetAyah < totalAyahs && !navigatingRef.current) {
      navigatingRef.current = true;
      navigateToAyah(targetAyah + 1);
    }
  }, [targetAyah, totalAyahs, navigateToAyah]);

  const skipBack = useCallback(() => {
    if (targetAyah > 1 && !navigatingRef.current) {
      navigatingRef.current = true;
      // Stop current audio when going back (no gapless needed)
      stopActiveSource();
      navigateToAyah(targetAyah - 1);
    }
  }, [targetAyah, navigateToAyah]);

  const skipForwardRef = useRef(skipForward);
  skipForwardRef.current = skipForward;
  const navigateRef = useRef(navigateToAyah);
  navigateRef.current = navigateToAyah;
  const targetAyahRef = useRef(targetAyah);
  targetAyahRef.current = targetAyah;
  const totalAyahsRef = useRef(totalAyahs);
  totalAyahsRef.current = totalAyahs;

  // Reset navigation guard when ayah changes
  useEffect(() => {
    navigatingRef.current = false;
  }, [targetAyah]);

  // Audio lifecycle: fetch buffer, play via Web Audio API, handle ended
  useEffect(() => {
    if (!isAudioMode) return;

    let cancelled = false;

    // Check if this ayah is already playing (started by previous component instance
    // for gapless transition). If so, just reconnect UI state.
    if (activeSurah === surahNumber && activeAyah === targetAyah && activeSource) {
      setIsPlaying(true);

      // Set up onended for the already-playing source
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

      return () => {
        cancelled = true;
        if (activeSource) activeSource.onended = null;
      };
    }

    const startPlayback = async () => {
      const url = audioUrl(surahNumber, targetAyah);
      const buffer = await getBuffer(url);
      if (!buffer || cancelled) return;

      const ctx = ensureAudioContext();
      const gain = getGainNode();

      // Stop any previous source
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

      source.onended = () => {
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
    };

    startPlayback();

    return () => {
      cancelled = true;
      // Don't stop audio here — let it keep playing during navigation
      // Only clear the onended handler to prevent stale callbacks
      if (activeSource) activeSource.onended = null;
    };
  }, [isAudioMode, surahNumber, targetAyah, totalAyahs]);

  // rAF loop for word highlighting — reads from Web Audio context time
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

      // Compute time position from AudioContext
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

        // Fix miscalibrated last segment
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  const toggleAudioMode = useCallback(() => {
    setIsAudioMode((prev) => {
      if (prev) {
        stopActiveSource();
        setIsPlaying(false);
        setHighlightedPosition(null);
        router.replace(`/quran/${surahNumber}/${targetAyah}`);
      } else {
        // Create AudioContext in user gesture (required for iOS/Safari)
        ensureAudioContext();
        router.replace(`/quran/${surahNumber}/${targetAyah}?audio=1`);
      }
      return !prev;
    });
  }, [router, surahNumber, targetAyah]);

  const play = useCallback(async () => {
    // Ensure AudioContext in user gesture (required for iOS/Safari)
    const ctx = ensureAudioContext();
    const gain = getGainNode();

    const url = audioUrl(surahNumber, targetAyah);
    const buffer = await getBuffer(url);
    if (!buffer) return;

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
  }, [surahNumber, targetAyah, totalAyahs]);

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

/**
 * Start the next ayah immediately from buffer cache for gapless transition.
 * Called from onended before navigation — the audio plays while the page transitions.
 */
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
