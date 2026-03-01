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

/**
 * Collect mushaf word positions for the target ayah (charType "word").
 * Includes bismillah lines for surah 1 where bismillah IS ayah 1.
 * Returns ordered positions that map 1:1 with audio segments by index.
 */
function collectRecitedWordPositions(
  mushafPages: MushafPageData[],
  surahNumber: number,
  targetAyah: number,
): number[] {
  const positions: { wordPosition: number; position: number }[] = [];

  for (const page of mushafPages) {
    for (const line of page.lines) {
      // Include text lines and bismillah lines (for surah 1 ayah 1)
      if (line.lineType !== "text" && line.lineType !== "bismillah") continue;
      for (const w of line.words) {
        if (
          w.surahNumber === surahNumber &&
          w.ayahNumber === targetAyah &&
          w.charType === "word"
        ) {
          positions.push({ wordPosition: w.wordPosition, position: w.position });
        }
      }
    }
  }

  positions.sort((a, b) => a.wordPosition - b.wordPosition);
  return positions.map((p) => p.position);
}

export function useQuranAudio(
  surahNumber: number,
  targetAyah: number,
  totalAyahs: number,
  mushafPages: MushafPageData[],
  router: AppRouterInstance,
  initialAudioMode: boolean,
): UseQuranAudioReturn {
  const [isAudioMode, setIsAudioMode] = useState(initialAudioMode);
  const [isPlaying, setIsPlaying] = useState(false);
  const [highlightedPosition, setHighlightedPosition] = useState<number | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafIdRef = useRef<number>(0);
  const segmentCacheRef = useRef<Map<string, Map<number, SegmentData>>>(new Map());
  const fetchingSegmentsRef = useRef<Set<string>>(new Set());
  const prevHighlightRef = useRef<number | null>(null);
  // Preloaded audio elements keyed by URL
  const preloadCacheRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Recited word positions for the current target ayah
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

  // Preload adjacent ayah audio files into browser cache
  useEffect(() => {
    if (!isAudioMode || !surahNumber) return;

    const cache = preloadCacheRef.current;
    const toPreload: string[] = [];

    // Preload ahead
    for (let i = 1; i <= PRELOAD_AHEAD; i++) {
      const a = targetAyah + i;
      if (a <= totalAyahs) toPreload.push(audioUrl(surahNumber, a));
    }
    // Preload behind
    for (let i = 1; i <= PRELOAD_BEHIND; i++) {
      const a = targetAyah - i;
      if (a >= 1) toPreload.push(audioUrl(surahNumber, a));
    }

    for (const url of toPreload) {
      if (cache.has(url)) continue;
      const el = new Audio();
      el.preload = "auto";
      el.src = url;
      cache.set(url, el);
    }

    // Evict entries far from current position (keep cache bounded)
    const keepUrls = new Set(toPreload);
    keepUrls.add(audioUrl(surahNumber, targetAyah));
    for (const [url, el] of cache) {
      if (!keepUrls.has(url)) {
        el.src = "";
        cache.delete(url);
      }
    }
  }, [isAudioMode, surahNumber, targetAyah, totalAyahs]);

  // Navigation helpers
  const navigateToAyah = useCallback(
    (ayah: number) => {
      router.replace(`/quran/${surahNumber}/${ayah}?audio=1`);
    },
    [router, surahNumber],
  );

  const skipForward = useCallback(() => {
    if (targetAyah < totalAyahs) {
      navigateToAyah(targetAyah + 1);
    }
  }, [targetAyah, totalAyahs, navigateToAyah]);

  const skipBack = useCallback(() => {
    if (targetAyah > 1) {
      navigateToAyah(targetAyah - 1);
    }
  }, [targetAyah, navigateToAyah]);

  // Keep refs for callbacks
  const skipForwardRef = useRef(skipForward);
  skipForwardRef.current = skipForward;

  // Set audio source and play when ready
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isAudioMode) return;

    const src = audioUrl(surahNumber, targetAyah);
    audio.src = src;
    audio.load();

    // Wait for enough data buffered before playing (eliminates stutter)
    const onCanPlay = () => {
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    };

    // If already buffered (from preload cache), play immediately
    if (audio.readyState >= 3) {
      onCanPlay();
    } else {
      audio.addEventListener("canplaythrough", onCanPlay, { once: true });
    }

    return () => {
      audio.removeEventListener("canplaythrough", onCanPlay);
      audio.pause();
      setIsPlaying(false);
    };
  }, [isAudioMode, surahNumber, targetAyah]);

  // Handle audio ended — auto-advance
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isAudioMode) return;

    const onEnded = () => {
      setIsPlaying(false);
      setHighlightedPosition(null);
      skipForwardRef.current();
    };

    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, [isAudioMode]);

  // rAF loop for word highlighting
  useEffect(() => {
    if (!isAudioMode || !isPlaying) {
      if (prevHighlightRef.current !== null) {
        prevHighlightRef.current = null;
        setHighlightedPosition(null);
      }
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    const cacheKey = `${DEFAULT_RECITER}:${surahNumber}`;

    const tick = () => {
      const segMap = segmentCacheRef.current.get(cacheKey);
      const segData = segMap?.get(targetAyah);
      const timeMs = audio.currentTime * 1000;
      const positions = recitedPositionsRef.current;

      let newHighlight: number | null = null;

      if (segData?.segments && segData.segments.length > 0 && timeMs > 0) {
        const segs = segData.segments;
        const len = segs.length;

        // Build gap-filled timing ranges
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
      audioRef.current?.pause();
      // Clean up preload cache
      for (const [, el] of preloadCacheRef.current) {
        el.src = "";
      }
      preloadCacheRef.current.clear();
    };
  }, []);

  const toggleAudioMode = useCallback(() => {
    setIsAudioMode((prev) => {
      if (prev) {
        // Exiting audio mode
        audioRef.current?.pause();
        setIsPlaying(false);
        setHighlightedPosition(null);
        router.replace(`/quran/${surahNumber}/${targetAyah}`);
      } else {
        router.replace(`/quran/${surahNumber}/${targetAyah}?audio=1`);
      }
      return !prev;
    });
  }, [router, surahNumber, targetAyah]);

  const play = useCallback(() => {
    audioRef.current?.play().then(() => setIsPlaying(true)).catch(() => {});
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
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
