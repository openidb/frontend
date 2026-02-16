"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { QURAN_TRANSLATIONS } from "@/lib/config/search-defaults";

interface RefiningCarouselProps {
  quranTranslation: string;
  visible: boolean;
}

interface FamousAyah {
  surah: number;
  ayah: number;
  ayahEnd?: number;
  surahAr: string;
  surahEn: string;
  text: string;
}

// Canonical Quranic text — these never change, no need to fetch
const FAMOUS_AYAHS: FamousAyah[] = [
  {
    surah: 2, ayah: 255, surahAr: "البقرة", surahEn: "Al-Baqarah",
    text: "ٱللَّهُ لَآ إِلَـٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ ۚ لَا تَأْخُذُهُۥ سِنَةٌ وَلَا نَوْمٌ ۚ لَّهُۥ مَا فِى ٱلسَّمَـٰوَٰتِ وَمَا فِى ٱلْأَرْضِ ۗ مَن ذَا ٱلَّذِى يَشْفَعُ عِندَهُۥٓ إِلَّا بِإِذْنِهِۦ ۚ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ بِشَىْءٍ مِّنْ عِلْمِهِۦٓ إِلَّا بِمَا شَآءَ ۚ وَسِعَ كُرْسِيُّهُ ٱلسَّمَـٰوَٰتِ وَٱلْأَرْضَ ۖ وَلَا يَـُٔودُهُۥ حِفْظُهُمَا ۚ وَهُوَ ٱلْعَلِىُّ ٱلْعَظِيمُ",
  },
  {
    surah: 24, ayah: 35, surahAr: "النور", surahEn: "An-Nur",
    text: "ٱللَّهُ نُورُ ٱلسَّمَـٰوَٰتِ وَٱلْأَرْضِ ۚ مَثَلُ نُورِهِۦ كَمِشْكَوٰةٍ فِيهَا مِصْبَاحٌ ۖ ٱلْمِصْبَاحُ فِى زُجَاجَةٍ ۖ ٱلزُّجَاجَةُ كَأَنَّهَا كَوْكَبٌ دُرِّىٌّ يُوقَدُ مِن شَجَرَةٍ مُّبَـٰرَكَةٍ زَيْتُونَةٍ لَّا شَرْقِيَّةٍ وَلَا غَرْبِيَّةٍ يَكَادُ زَيْتُهَا يُضِىٓءُ وَلَوْ لَمْ تَمْسَسْهُ نَارٌ ۚ نُّورٌ عَلَىٰ نُورٍ ۗ يَهْدِى ٱللَّهُ لِنُورِهِۦ مَن يَشَآءُ ۚ وَيَضْرِبُ ٱللَّهُ ٱلْأَمْثَـٰلَ لِلنَّاسِ ۗ وَٱللَّهُ بِكُلِّ شَىْءٍ عَلِيمٌ",
  },
  {
    surah: 13, ayah: 28, surahAr: "الرعد", surahEn: "Ar-Ra'd",
    text: "ٱلَّذِينَ ءَامَنُوا۟ وَتَطْمَئِنُّ قُلُوبُهُم بِذِكْرِ ٱللَّهِ ۗ أَلَا بِذِكْرِ ٱللَّهِ تَطْمَئِنُّ ٱلْقُلُوبُ",
  },
  {
    surah: 94, ayah: 5, ayahEnd: 6, surahAr: "الشرح", surahEn: "Ash-Sharh",
    text: "فَإِنَّ مَعَ ٱلْعُسْرِ يُسْرًا ﴿٥﴾ إِنَّ مَعَ ٱلْعُسْرِ يُسْرًا ﴿٦﴾",
  },
  {
    surah: 39, ayah: 53, surahAr: "الزمر", surahEn: "Az-Zumar",
    text: "قُلْ يَـٰعِبَادِىَ ٱلَّذِينَ أَسْرَفُوا۟ عَلَىٰٓ أَنفُسِهِمْ لَا تَقْنَطُوا۟ مِن رَّحْمَةِ ٱللَّهِ ۚ إِنَّ ٱللَّهَ يَغْفِرُ ٱلذُّنُوبَ جَمِيعًا ۚ إِنَّهُۥ هُوَ ٱلْغَفُورُ ٱلرَّحِيمُ",
  },
  {
    surah: 2, ayah: 152, surahAr: "البقرة", surahEn: "Al-Baqarah",
    text: "فَٱذْكُرُونِىٓ أَذْكُرْكُمْ وَٱشْكُرُوا۟ لِى وَلَا تَكْفُرُونِ",
  },
  {
    surah: 3, ayah: 173, surahAr: "آل عمران", surahEn: "Ali 'Imran",
    text: "ٱلَّذِينَ قَالَ لَهُمُ ٱلنَّاسُ إِنَّ ٱلنَّاسَ قَدْ جَمَعُوا۟ لَكُمْ فَٱخْشَوْهُمْ فَزَادَهُمْ إِيمَـٰنًا وَقَالُوا۟ حَسْبُنَا ٱللَّهُ وَنِعْمَ ٱلْوَكِيلُ",
  },
  {
    surah: 51, ayah: 56, surahAr: "الذاريات", surahEn: "Adh-Dhariyat",
    text: "وَمَا خَلَقْتُ ٱلْجِنَّ وَٱلْإِنسَ إِلَّا لِيَعْبُدُونِ",
  },
  {
    surah: 7, ayah: 156, surahAr: "الأعراف", surahEn: "Al-A'raf",
    text: "وَرَحْمَتِى وَسِعَتْ كُلَّ شَىْءٍ ۚ فَسَأَكْتُبُهَا لِلَّذِينَ يَتَّقُونَ وَيُؤْتُونَ ٱلزَّكَوٰةَ وَٱلَّذِينَ هُم بِـَٔايَـٰتِنَا يُؤْمِنُونَ",
  },
  {
    surah: 49, ayah: 10, surahAr: "الحجرات", surahEn: "Al-Hujurat",
    text: "إِنَّمَا ٱلْمُؤْمِنُونَ إِخْوَةٌ فَأَصْلِحُوا۟ بَيْنَ أَخَوَيْكُمْ ۚ وَٱتَّقُوا۟ ٱللَّهَ لَعَلَّكُمْ تُرْحَمُونَ",
  },
  {
    surah: 49, ayah: 13, surahAr: "الحجرات", surahEn: "Al-Hujurat",
    text: "يَـٰٓأَيُّهَا ٱلنَّاسُ إِنَّا خَلَقْنَـٰكُم مِّن ذَكَرٍ وَأُنثَىٰ وَجَعَلْنَـٰكُمْ شُعُوبًا وَقَبَآئِلَ لِتَعَارَفُوٓا۟ ۚ إِنَّ أَكْرَمَكُمْ عِندَ ٱللَّهِ أَتْقَىٰكُمْ ۚ إِنَّ ٱللَّهَ عَلِيمٌ خَبِيرٌ",
  },
  {
    surah: 46, ayah: 15, surahAr: "الأحقاف", surahEn: "Al-Ahqaf",
    text: "وَوَصَّيْنَا ٱلْإِنسَـٰنَ بِوَٰلِدَيْهِ إِحْسَـٰنًا ۖ حَمَلَتْهُ أُمُّهُۥ كُرْهًا وَوَضَعَتْهُ كُرْهًا ۖ وَحَمْلُهُۥ وَفِصَـٰلُهُۥ ثَلَـٰثُونَ شَهْرًا",
  },
  {
    surah: 2, ayah: 286, surahAr: "البقرة", surahEn: "Al-Baqarah",
    text: "لَا يُكَلِّفُ ٱللَّهُ نَفْسًا إِلَّا وُسْعَهَا ۚ لَهَا مَا كَسَبَتْ وَعَلَيْهَا مَا ٱكْتَسَبَتْ",
  },
  {
    surah: 2, ayah: 285, surahAr: "البقرة", surahEn: "Al-Baqarah",
    text: "ءَامَنَ ٱلرَّسُولُ بِمَآ أُنزِلَ إِلَيْهِ مِن رَّبِّهِۦ وَٱلْمُؤْمِنُونَ ۚ كُلٌّ ءَامَنَ بِٱللَّهِ وَمَلَـٰٓئِكَتِهِۦ وَكُتُبِهِۦ وَرُسُلِهِۦ لَا نُفَرِّقُ بَيْنَ أَحَدٍ مِّن رُّسُلِهِۦ ۚ وَقَالُوا۟ سَمِعْنَا وَأَطَعْنَا ۖ غُفْرَانَكَ رَبَّنَا وَإِلَيْكَ ٱلْمَصِيرُ",
  },
  {
    surah: 20, ayah: 2, ayahEnd: 3, surahAr: "طه", surahEn: "Ta-Ha",
    text: "مَآ أَنزَلْنَا عَلَيْكَ ٱلْقُرْءَانَ لِتَشْقَىٰٓ ﴿٢﴾ إِلَّا تَذْكِرَةً لِّمَن يَخْشَىٰ ﴿٣﴾",
  },
  {
    surah: 49, ayah: 11, surahAr: "الحجرات", surahEn: "Al-Hujurat",
    text: "يَـٰٓأَيُّهَا ٱلَّذِينَ ءَامَنُوا۟ لَا يَسْخَرْ قَوْمٌ مِّن قَوْمٍ عَسَىٰٓ أَن يَكُونُوا۟ خَيْرًا مِّنْهُمْ وَلَا نِسَآءٌ مِّن نِّسَآءٍ عَسَىٰٓ أَن يَكُنَّ خَيْرًا مِّنْهُنَّ",
  },
];

// Fisher-Yates shuffle
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

interface DisplayAyah extends FamousAyah {
  translation?: string;
  translator?: string;
}

export function RefiningCarousel({ quranTranslation, visible }: RefiningCarouselProps) {
  const { t } = useTranslation();
  const [ayahs, setAyahs] = useState<DisplayAyah[]>(() =>
    shuffleArray(FAMOUS_AYAHS).slice(0, 5)
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const prevVisibleRef = useRef(false);
  // Track which ayahs to fetch translations for (stable ref, no re-render dependency)
  const ayahsRef = useRef(ayahs);

  // Re-shuffle when carousel becomes visible (new refine search), then fetch translations
  const [fetchKey, setFetchKey] = useState(0);
  useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      const selected = shuffleArray(FAMOUS_AYAHS).slice(0, 5);
      ayahsRef.current = selected;
      setAyahs(selected);
      setCurrentIndex(0);
      setFetchKey((k) => k + 1);
    }
    prevVisibleRef.current = visible;
  }, [visible]);

  // Fetch translations when ayahs change or quranTranslation changes
  useEffect(() => {
    if (quranTranslation === "none") {
      setAyahs((prev) => prev.map(({ translation, translator, ...rest }) => rest));
      return;
    }

    const translationConfig = QURAN_TRANSLATIONS.find(
      (t) => t.code === quranTranslation || t.edition === quranTranslation
    );
    if (!translationConfig || !translationConfig.edition) return;

    const editionId = translationConfig.edition;
    const translatorName = translationConfig.translator;

    setAyahs((prev) => prev.map(({ translation, translator, ...rest }) => rest));

    let cancelled = false;
    ayahsRef.current.forEach((ayah, idx) => {
      fetch(`/api/quran/translations/${ayah.surah}/${ayah.ayah}?editionId=${encodeURIComponent(editionId)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled || !data?.translations?.length) return;
          const translationText = data.translations[0].text;
          setAyahs((prev) => {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], translation: translationText, translator: translatorName };
            return updated;
          });
        })
        .catch(() => {});
    });

    return () => { cancelled = true; };
  }, [quranTranslation, fetchKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const goNext = useCallback(() => {
    setCurrentIndex((i) => (i + 1) % ayahs.length);
  }, [ayahs.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => (i - 1 + ayahs.length) % ayahs.length);
  }, [ayahs.length]);

  if (!visible) return null;

  const currentAyah = ayahs[currentIndex];

  return (
    <div className="flex flex-col items-center justify-center py-8 gap-4">
      {/* Refining indicator */}
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">{t("search.refining")}</span>
      </div>

      {/* Carousel */}
      <div className="flex items-center gap-4 w-full max-w-2xl px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={goPrev}
          className="shrink-0 h-10 w-10"
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>

        <div className="flex-1 text-center space-y-3 min-h-[120px] flex flex-col justify-center">
          {/* Arabic text */}
          <p className="text-xl md:text-2xl leading-loose" dir="rtl">
            {currentAyah.text}
          </p>

          {/* Translation */}
          {currentAyah.translation && (
            <div className="space-y-1">
              <p className="text-sm md:text-base text-muted-foreground">
                {currentAyah.translation}
              </p>
              {currentAyah.translator && (
                <p className="text-xs text-muted-foreground/60">
                  — {currentAyah.translator} translation
                </p>
              )}
            </div>
          )}

          {/* Reference */}
          <p className="text-xs text-muted-foreground">
            {currentAyah.surahAr} ({currentAyah.surahEn}) {currentAyah.ayah}{currentAyah.ayahEnd ? `-${currentAyah.ayahEnd}` : ""}
          </p>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={goNext}
          className="shrink-0 h-10 w-10"
        >
          <ChevronRight className="h-6 w-6" />
        </Button>
      </div>

      {/* Dots indicator */}
      <div className="flex gap-1.5">
        {ayahs.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentIndex(i)}
            className={`h-1.5 w-1.5 rounded-full transition-colors ${
              i === currentIndex ? "bg-primary" : "bg-muted"
            }`}
            aria-label={`Go to ayah ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
