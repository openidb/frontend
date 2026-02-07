"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";

interface FamousAyah {
  surahNumber: number;
  ayahNumber: number;
  surahNameArabic: string;
  surahNameEnglish: string;
  text: string;
  translation?: string;
}

interface RefiningCarouselProps {
  quranTranslation: string;
}

// Curated list of famous single ayahs
const FAMOUS_AYAH_REFS = [
  // Core spiritual verses
  { surah: 2, ayah: 255 },   // Ayat al-Kursi
  { surah: 24, ayah: 35 },   // Verse of Light (Ayat an-Nur)
  { surah: 59, ayah: 22 },   // Names of Allah - Al-Hashr
  { surah: 59, ayah: 23 },   // Names of Allah - Al-Hashr
  { surah: 59, ayah: 24 },   // Names of Allah - Al-Hashr
  { surah: 112, ayah: 1 },   // Surah Al-Ikhlas - "Say: He is Allah, the One"

  // Trust and reliance on Allah
  { surah: 65, ayah: 3 },    // "Whoever relies on Allah, He is sufficient"
  { surah: 3, ayah: 173 },   // "Sufficient for us is Allah"
  { surah: 9, ayah: 51 },    // "Nothing will happen except what Allah has decreed"
  { surah: 64, ayah: 11 },   // "No disaster strikes except by Allah's permission"

  // Patience and hardship
  { surah: 94, ayah: 5 },    // "With hardship comes ease"
  { surah: 94, ayah: 6 },    // "Indeed, with hardship comes ease"
  { surah: 2, ayah: 286 },   // "Allah does not burden a soul beyond capacity"
  { surah: 2, ayah: 155 },   // "We will test you with fear and hunger..."
  { surah: 3, ayah: 139 },   // "Do not lose heart, nor grieve"
  { surah: 12, ayah: 87 },   // "Do not despair of Allah's mercy"

  // Remembrance and gratitude
  { surah: 2, ayah: 152 },   // "Remember Me, I will remember you"
  { surah: 13, ayah: 28 },   // "Hearts find rest in remembrance of Allah"
  { surah: 33, ayah: 41 },   // "Remember Allah with much remembrance"
  { surah: 14, ayah: 7 },    // "If you are grateful, I will increase you"

  // Mercy and forgiveness
  { surah: 39, ayah: 53 },   // "Despair not of Allah's mercy"
  { surah: 4, ayah: 110 },   // "Whoever does evil then seeks forgiveness..."
  { surah: 25, ayah: 70 },   // "Allah will replace evil deeds with good"
  { surah: 7, ayah: 156 },   // "My mercy encompasses all things"
  { surah: 15, ayah: 49 },   // "I am the Forgiving, the Merciful"

  // Guidance and striving
  { surah: 29, ayah: 69 },   // "Those who strive for Us, We guide them"
  { surah: 2, ayah: 186 },   // "I am near, I respond to the caller"
  { surah: 50, ayah: 16 },   // "We are closer to him than his jugular vein"
  { surah: 8, ayah: 24 },    // "Respond to Allah and the Messenger"

  // Knowledge and wisdom
  { surah: 20, ayah: 114 },  // "My Lord, increase me in knowledge"
  { surah: 39, ayah: 9 },    // "Are those who know equal to those who do not?"
  { surah: 58, ayah: 11 },   // "Allah raises those who believe and have knowledge"

  // Character and conduct
  { surah: 31, ayah: 18 },   // "Do not turn your cheek in contempt"
  { surah: 25, ayah: 63 },   // "Servants of the Most Merciful walk humbly"
  { surah: 49, ayah: 11 },   // "Do not ridicule others..."
  { surah: 49, ayah: 12 },   // "Avoid suspicion and spying..."
  { surah: 49, ayah: 13 },   // "The most noble is the most righteous"
  { surah: 16, ayah: 90 },   // "Allah commands justice and good conduct"

  // Prayer and worship
  { surah: 2, ayah: 45 },    // "Seek help through patience and prayer"
  { surah: 29, ayah: 45 },   // "Prayer prohibits immorality and wrongdoing"
  { surah: 20, ayah: 14 },   // "Establish prayer for My remembrance"

  // Hope and good news
  { surah: 6, ayah: 59 },    // "With Him are the keys of the unseen"

  // Unity and brotherhood
  { surah: 49, ayah: 10 },   // "Believers are but brothers"
  { surah: 3, ayah: 103 },   // "Hold firmly to the rope of Allah"

  // Nature and signs
  { surah: 55, ayah: 13 },   // "Which of your Lord's favors will you deny?"
  { surah: 51, ayah: 56 },   // "I created jinn and mankind to worship Me"
  { surah: 67, ayah: 3 },    // "You will not find any flaw in creation"
];

// Fisher-Yates shuffle for proper randomization
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function RefiningCarousel({ quranTranslation }: RefiningCarouselProps) {
  const { t } = useTranslation();
  const [ayahs, setAyahs] = useState<FamousAyah[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch random famous ayahs on mount
  useEffect(() => {
    const fetchAyahs = async () => {
      // Shuffle and pick 5 random ayahs
      const shuffled = shuffleArray(FAMOUS_AYAH_REFS);
      const selected = shuffled.slice(0, 5);

      // Fetch each ayah with translation
      const results = await Promise.all(
        selected.map(async ({ surah, ayah }) => {
          const params = new URLSearchParams({
            surah: surah.toString(),
            ayah: ayah.toString(),
            ...(quranTranslation !== "none" && { lang: quranTranslation }),
          });
          const res = await fetch(`/api/ayah?${params}`);
          if (res.ok) return res.json();
          return null;
        })
      );

      setAyahs(results.filter(Boolean));
      setIsLoading(false);
    };

    fetchAyahs();
  }, [quranTranslation]);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => (i + 1) % ayahs.length);
  }, [ayahs.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => (i - 1 + ayahs.length) % ayahs.length);
  }, [ayahs.length]);

  if (isLoading || ayahs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{t("search.refining")}</span>
      </div>
    );
  }

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
            <p className="text-sm md:text-base text-muted-foreground">
              {currentAyah.translation}
            </p>
          )}

          {/* Reference */}
          <p className="text-xs text-muted-foreground">
            {currentAyah.surahNameArabic} ({currentAyah.surahNameEnglish}) {currentAyah.ayahNumber}
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
