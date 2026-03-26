"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronDown, FileText, Headphones, Play, Pause, SkipBack, SkipForward, User, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "@/lib/i18n";
import { useQuranAudio, RECITERS, DEFAULT_RECITER } from "@/lib/use-quran-audio";

interface TafsirEdition {
  id: string;
  name: string;
  language: string;
  author: string | null;
  direction: string;
}

interface AyahData {
  ayahNumber: number;
  textUthmani: string;
  pageNumber: number;
  surah: { number: number; nameArabic: string; nameEnglish: string };
}

interface Props {
  ayahs: AyahData[];
  targetAyah: number;
  surahNumber: number;
  surahNameEnglish: string;
  surahNameArabic: string;
  totalAyahs: number;
  initialAudioMode?: boolean;
}

const PREFERRED_EDITIONS: Record<string, { id: string; name: string }> = {
  en: { id: "eng-mustafakhattabg", name: "Dr. Mustafa Khattab, The Clear Quran" },
  ar: { id: "ara-kingfahadquranc", name: "King Fahad Quran Complex" },
  fr: { id: "qul-31", name: "Muhammad Hamidullah" },
  id: { id: "qul-33", name: "Indonesian Islamic Affairs Ministry" },
  ur: { id: "qul-158", name: "Dr. Israr Ahmad (Bayan-ul-Quran)" },
  es: { id: "qul-83", name: "Sheikh Isa Garcia" },
  zh: { id: "qul-56", name: "Ma Jian" },
  pt: { id: "qul-103", name: "Helmi Nasr" },
  ru: { id: "qul-79", name: "Abu Adel" },
  ja: { id: "qul-35", name: "Ryoichi Mita" },
  ko: { id: "qul-219", name: "Hamed Choi" },
  it: { id: "qul-153", name: "Hamza Roberto Piccardo" },
  bn: { id: "qul-213", name: "Dr. Abu Bakr Muhammad Zakaria" },
  ha: { id: "qul-32", name: "Abubakar Mahmoud Gumi" },
  sw: { id: "qul-49", name: "Ali Muhsin Al-Barwani" },
  nl: { id: "qul-144", name: "Sofian S. Siregar" },
  de: { id: "qul-27", name: "Frank Bubenheim & Nadeem" },
  tr: { id: "qul-52", name: "Elmalili Hamdi Yazir" },
  fa: { id: "qul-29", name: "Hussein Taji Kal Dari" },
  hi: { id: "qul-122", name: "Maulana Azizul Haque al-Umari" },
  ms: { id: "qul-784", name: "Abdullah Basamia" },
  pa: { id: "pan-drmuhamadhabibb", name: "Dr. Muhamad Habib" },
  ku: { id: "qul-81", name: "Burhan Muhammad-Amin" },
  ps: { id: "qul-118", name: "Zakaria Abulsalam" },
  so: { id: "qul-46", name: "Mahmud Muhammad Abduh" },
  uz: { id: "qul-127", name: "Muhammad Sodik Muhammad Yusuf" },
  yo: { id: "qul-125", name: "Shaykh Abu Rahimah Mikael Aykyuni" },
  ta: { id: "qul-133", name: "Abdul Hameed Baqavi" },
};

// Get display name for a language code using Intl API; returns null if unresolvable
function getLanguageName(code: string): string | null {
  try {
    const name = new Intl.DisplayNames([code, "en"], { type: "language" }).of(code);
    if (name && name !== code) return name;
  } catch {}
  return null;
}

// Preferred tafsir editions per language (Ibn Kathir where available)
const PREFERRED_TAFSIRS: Record<string, string> = {
  en: "en-tafisr-ibn-kathir",     // Ibn Kathir (abridged)
  ar: "ar-tafsir-ibn-kathir",     // Tafsir Ibn Kathir
  bn: "bn-tafseer-ibn-e-kaseer",  // Tafseer ibn Kathir
  ur: "ur-tafseer-ibn-e-kaseer",  // Tafsir Ibn Kathir
  ru: "qul-913",                  // Tafsir Ibne Kathir
  tr: "qul-914",                  // Tafsir Ibne Kathir
};

// Strip Quranic annotation marks that render as odd symbols with text fonts.
// Keeps core diacritics (tashkeel), superscript alef, maddah, alef wasla.
const QURAN_ANNOTATION_RE = /[\u06D6-\u06DC\u06DE\u06DF\u06E0-\u06E4\u06E5\u06E6\u06E7-\u06ED]/g;
function cleanUthmani(text: string): string {
  return text.replace(QURAN_ANNOTATION_RE, "").replace(/\s+/g, " ").trim();
}

// The Bismillah is baked into textUthmani for ayah 1 of every surah except 1 and 9.
// Since we render it as a separate decorative line, strip it from the ayah text.
// Use a diacritics-tolerant regex: match base consonants with optional tashkeel between them.
const D = "[\u064B-\u0652\u0670\u06D6-\u06ED]*"; // optional diacritics
const BISMILLAH_PREFIX = new RegExp(
  `^${D}ب${D}س${D}م${D}\\s+[ٱا]${D}ل${D}ل${D}ه${D}\\s+[ٱا]${D}ل${D}ر${D}ح${D}م${D}ن${D}\\s+[ٱا]${D}ل${D}ر${D}ح${D}ي${D}م${D}\\s*`
);
function stripBismillah(text: string, surah: number, ayah: number): string {
  if (ayah === 1 && surah !== 1 && surah !== 9) {
    return text.replace(BISMILLAH_PREFIX, "");
  }
  return text;
}

// Static surah metadata (number, Arabic name, English name, ayah count)
const SURAHS: { number: number; nameArabic: string; nameEnglish: string; ayahCount: number }[] = [
  { number: 1, nameArabic: "الفاتحة", nameEnglish: "Al-Fatihah", ayahCount: 7 },
  { number: 2, nameArabic: "البقرة", nameEnglish: "Al-Baqarah", ayahCount: 286 },
  { number: 3, nameArabic: "آل عمران", nameEnglish: "Ali 'Imran", ayahCount: 200 },
  { number: 4, nameArabic: "النساء", nameEnglish: "An-Nisa", ayahCount: 176 },
  { number: 5, nameArabic: "المائدة", nameEnglish: "Al-Ma'idah", ayahCount: 120 },
  { number: 6, nameArabic: "الأنعام", nameEnglish: "Al-An'am", ayahCount: 165 },
  { number: 7, nameArabic: "الأعراف", nameEnglish: "Al-A'raf", ayahCount: 206 },
  { number: 8, nameArabic: "الأنفال", nameEnglish: "Al-Anfal", ayahCount: 75 },
  { number: 9, nameArabic: "التوبة", nameEnglish: "At-Tawbah", ayahCount: 129 },
  { number: 10, nameArabic: "يونس", nameEnglish: "Yunus", ayahCount: 109 },
  { number: 11, nameArabic: "هود", nameEnglish: "Hud", ayahCount: 123 },
  { number: 12, nameArabic: "يوسف", nameEnglish: "Yusuf", ayahCount: 111 },
  { number: 13, nameArabic: "الرعد", nameEnglish: "Ar-Ra'd", ayahCount: 43 },
  { number: 14, nameArabic: "إبراهيم", nameEnglish: "Ibrahim", ayahCount: 52 },
  { number: 15, nameArabic: "الحجر", nameEnglish: "Al-Hijr", ayahCount: 99 },
  { number: 16, nameArabic: "النحل", nameEnglish: "An-Nahl", ayahCount: 128 },
  { number: 17, nameArabic: "الإسراء", nameEnglish: "Al-Isra", ayahCount: 111 },
  { number: 18, nameArabic: "الكهف", nameEnglish: "Al-Kahf", ayahCount: 110 },
  { number: 19, nameArabic: "مريم", nameEnglish: "Maryam", ayahCount: 98 },
  { number: 20, nameArabic: "طه", nameEnglish: "Taha", ayahCount: 135 },
  { number: 21, nameArabic: "الأنبياء", nameEnglish: "Al-Anbya", ayahCount: 112 },
  { number: 22, nameArabic: "الحج", nameEnglish: "Al-Hajj", ayahCount: 78 },
  { number: 23, nameArabic: "المؤمنون", nameEnglish: "Al-Mu'minun", ayahCount: 118 },
  { number: 24, nameArabic: "النور", nameEnglish: "An-Nur", ayahCount: 64 },
  { number: 25, nameArabic: "الفرقان", nameEnglish: "Al-Furqan", ayahCount: 77 },
  { number: 26, nameArabic: "الشعراء", nameEnglish: "Ash-Shu'ara", ayahCount: 227 },
  { number: 27, nameArabic: "النمل", nameEnglish: "An-Naml", ayahCount: 93 },
  { number: 28, nameArabic: "القصص", nameEnglish: "Al-Qasas", ayahCount: 88 },
  { number: 29, nameArabic: "العنكبوت", nameEnglish: "Al-'Ankabut", ayahCount: 69 },
  { number: 30, nameArabic: "الروم", nameEnglish: "Ar-Rum", ayahCount: 60 },
  { number: 31, nameArabic: "لقمان", nameEnglish: "Luqman", ayahCount: 34 },
  { number: 32, nameArabic: "السجدة", nameEnglish: "As-Sajdah", ayahCount: 30 },
  { number: 33, nameArabic: "الأحزاب", nameEnglish: "Al-Ahzab", ayahCount: 73 },
  { number: 34, nameArabic: "سبأ", nameEnglish: "Saba", ayahCount: 54 },
  { number: 35, nameArabic: "فاطر", nameEnglish: "Fatir", ayahCount: 45 },
  { number: 36, nameArabic: "يس", nameEnglish: "Ya-Sin", ayahCount: 83 },
  { number: 37, nameArabic: "الصافات", nameEnglish: "As-Saffat", ayahCount: 182 },
  { number: 38, nameArabic: "ص", nameEnglish: "Sad", ayahCount: 88 },
  { number: 39, nameArabic: "الزمر", nameEnglish: "Az-Zumar", ayahCount: 75 },
  { number: 40, nameArabic: "غافر", nameEnglish: "Ghafir", ayahCount: 85 },
  { number: 41, nameArabic: "فصلت", nameEnglish: "Fussilat", ayahCount: 54 },
  { number: 42, nameArabic: "الشورى", nameEnglish: "Ash-Shuraa", ayahCount: 53 },
  { number: 43, nameArabic: "الزخرف", nameEnglish: "Az-Zukhruf", ayahCount: 89 },
  { number: 44, nameArabic: "الدخان", nameEnglish: "Ad-Dukhan", ayahCount: 59 },
  { number: 45, nameArabic: "الجاثية", nameEnglish: "Al-Jathiyah", ayahCount: 37 },
  { number: 46, nameArabic: "الأحقاف", nameEnglish: "Al-Ahqaf", ayahCount: 35 },
  { number: 47, nameArabic: "محمد", nameEnglish: "Muhammad", ayahCount: 38 },
  { number: 48, nameArabic: "الفتح", nameEnglish: "Al-Fath", ayahCount: 29 },
  { number: 49, nameArabic: "الحجرات", nameEnglish: "Al-Hujurat", ayahCount: 18 },
  { number: 50, nameArabic: "ق", nameEnglish: "Qaf", ayahCount: 45 },
  { number: 51, nameArabic: "الذاريات", nameEnglish: "Adh-Dhariyat", ayahCount: 60 },
  { number: 52, nameArabic: "الطور", nameEnglish: "At-Tur", ayahCount: 49 },
  { number: 53, nameArabic: "النجم", nameEnglish: "An-Najm", ayahCount: 62 },
  { number: 54, nameArabic: "القمر", nameEnglish: "Al-Qamar", ayahCount: 55 },
  { number: 55, nameArabic: "الرحمن", nameEnglish: "Ar-Rahman", ayahCount: 78 },
  { number: 56, nameArabic: "الواقعة", nameEnglish: "Al-Waqi'ah", ayahCount: 96 },
  { number: 57, nameArabic: "الحديد", nameEnglish: "Al-Hadid", ayahCount: 29 },
  { number: 58, nameArabic: "المجادلة", nameEnglish: "Al-Mujadila", ayahCount: 22 },
  { number: 59, nameArabic: "الحشر", nameEnglish: "Al-Hashr", ayahCount: 24 },
  { number: 60, nameArabic: "الممتحنة", nameEnglish: "Al-Mumtahanah", ayahCount: 13 },
  { number: 61, nameArabic: "الصف", nameEnglish: "As-Saf", ayahCount: 14 },
  { number: 62, nameArabic: "الجمعة", nameEnglish: "Al-Jumu'ah", ayahCount: 11 },
  { number: 63, nameArabic: "المنافقون", nameEnglish: "Al-Munafiqun", ayahCount: 11 },
  { number: 64, nameArabic: "التغابن", nameEnglish: "At-Taghabun", ayahCount: 18 },
  { number: 65, nameArabic: "الطلاق", nameEnglish: "At-Talaq", ayahCount: 12 },
  { number: 66, nameArabic: "التحريم", nameEnglish: "At-Tahrim", ayahCount: 12 },
  { number: 67, nameArabic: "الملك", nameEnglish: "Al-Mulk", ayahCount: 30 },
  { number: 68, nameArabic: "القلم", nameEnglish: "Al-Qalam", ayahCount: 52 },
  { number: 69, nameArabic: "الحاقة", nameEnglish: "Al-Haqqah", ayahCount: 52 },
  { number: 70, nameArabic: "المعارج", nameEnglish: "Al-Ma'arij", ayahCount: 44 },
  { number: 71, nameArabic: "نوح", nameEnglish: "Nuh", ayahCount: 28 },
  { number: 72, nameArabic: "الجن", nameEnglish: "Al-Jinn", ayahCount: 28 },
  { number: 73, nameArabic: "المزمل", nameEnglish: "Al-Muzzammil", ayahCount: 20 },
  { number: 74, nameArabic: "المدثر", nameEnglish: "Al-Muddaththir", ayahCount: 56 },
  { number: 75, nameArabic: "القيامة", nameEnglish: "Al-Qiyamah", ayahCount: 40 },
  { number: 76, nameArabic: "الإنسان", nameEnglish: "Al-Insan", ayahCount: 31 },
  { number: 77, nameArabic: "المرسلات", nameEnglish: "Al-Mursalat", ayahCount: 50 },
  { number: 78, nameArabic: "النبأ", nameEnglish: "An-Naba", ayahCount: 40 },
  { number: 79, nameArabic: "النازعات", nameEnglish: "An-Nazi'at", ayahCount: 46 },
  { number: 80, nameArabic: "عبس", nameEnglish: "'Abasa", ayahCount: 42 },
  { number: 81, nameArabic: "التكوير", nameEnglish: "At-Takwir", ayahCount: 29 },
  { number: 82, nameArabic: "الانفطار", nameEnglish: "Al-Infitar", ayahCount: 19 },
  { number: 83, nameArabic: "المطففين", nameEnglish: "Al-Mutaffifin", ayahCount: 36 },
  { number: 84, nameArabic: "الانشقاق", nameEnglish: "Al-Inshiqaq", ayahCount: 25 },
  { number: 85, nameArabic: "البروج", nameEnglish: "Al-Buruj", ayahCount: 22 },
  { number: 86, nameArabic: "الطارق", nameEnglish: "At-Tariq", ayahCount: 17 },
  { number: 87, nameArabic: "الأعلى", nameEnglish: "Al-A'la", ayahCount: 19 },
  { number: 88, nameArabic: "الغاشية", nameEnglish: "Al-Ghashiyah", ayahCount: 26 },
  { number: 89, nameArabic: "الفجر", nameEnglish: "Al-Fajr", ayahCount: 30 },
  { number: 90, nameArabic: "البلد", nameEnglish: "Al-Balad", ayahCount: 20 },
  { number: 91, nameArabic: "الشمس", nameEnglish: "Ash-Shams", ayahCount: 15 },
  { number: 92, nameArabic: "الليل", nameEnglish: "Al-Layl", ayahCount: 21 },
  { number: 93, nameArabic: "الضحى", nameEnglish: "Ad-Duhaa", ayahCount: 11 },
  { number: 94, nameArabic: "الشرح", nameEnglish: "Ash-Sharh", ayahCount: 8 },
  { number: 95, nameArabic: "التين", nameEnglish: "At-Tin", ayahCount: 8 },
  { number: 96, nameArabic: "العلق", nameEnglish: "Al-'Alaq", ayahCount: 19 },
  { number: 97, nameArabic: "القدر", nameEnglish: "Al-Qadr", ayahCount: 5 },
  { number: 98, nameArabic: "البينة", nameEnglish: "Al-Bayyinah", ayahCount: 8 },
  { number: 99, nameArabic: "الزلزلة", nameEnglish: "Az-Zalzalah", ayahCount: 8 },
  { number: 100, nameArabic: "العاديات", nameEnglish: "Al-'Adiyat", ayahCount: 11 },
  { number: 101, nameArabic: "القارعة", nameEnglish: "Al-Qari'ah", ayahCount: 11 },
  { number: 102, nameArabic: "التكاثر", nameEnglish: "At-Takathur", ayahCount: 8 },
  { number: 103, nameArabic: "العصر", nameEnglish: "Al-'Asr", ayahCount: 3 },
  { number: 104, nameArabic: "الهمزة", nameEnglish: "Al-Humazah", ayahCount: 9 },
  { number: 105, nameArabic: "الفيل", nameEnglish: "Al-Fil", ayahCount: 5 },
  { number: 106, nameArabic: "قريش", nameEnglish: "Quraysh", ayahCount: 4 },
  { number: 107, nameArabic: "الماعون", nameEnglish: "Al-Ma'un", ayahCount: 7 },
  { number: 108, nameArabic: "الكوثر", nameEnglish: "Al-Kawthar", ayahCount: 3 },
  { number: 109, nameArabic: "الكافرون", nameEnglish: "Al-Kafirun", ayahCount: 6 },
  { number: 110, nameArabic: "النصر", nameEnglish: "An-Nasr", ayahCount: 3 },
  { number: 111, nameArabic: "المسد", nameEnglish: "Al-Masad", ayahCount: 5 },
  { number: 112, nameArabic: "الإخلاص", nameEnglish: "Al-Ikhlas", ayahCount: 4 },
  { number: 113, nameArabic: "الفلق", nameEnglish: "Al-Falaq", ayahCount: 5 },
  { number: 114, nameArabic: "الناس", nameEnglish: "An-Nas", ayahCount: 6 },
];

// Module-level caches (persist across React re-renders and navigations)
const translationCache = new Map<string, string>(); // "surah:ayah:edition" → text
const tafsirCache = new Map<string, string>(); // "surah:ayah:edition" → html
const tafsirFetching = new Set<string>(); // dedup in-flight tafsir fetches
const ayahTextCache = new Map<string, string>(); // "surah:ayah" → textUthmani

// Directional slide variants for per-ayah transitions
const ayahSlideVariants = {
  enter: (dir: number) => ({ opacity: 0, y: dir * 30 }),
  exit: (dir: number) => ({ opacity: 0, y: -dir * 30 }),
};

export function QuranAyahViewer({
  ayahs,
  targetAyah,
  surahNumber,
  surahNameEnglish,
  surahNameArabic,
  totalAyahs,
  initialAudioMode = false,
}: Props) {
  const { t, locale } = useTranslation();
  const router = useRouter();

  // --- Reciter state (persisted in localStorage) ---
  const [reciter, setReciter] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("quran-reciter") || DEFAULT_RECITER;
    }
    return DEFAULT_RECITER;
  });
  const [showReciterMenu, setShowReciterMenu] = useState(false);

  const handleReciterChange = useCallback((slug: string) => {
    setReciter(slug);
    localStorage.setItem("quran-reciter", slug);
    setShowReciterMenu(false);
  }, []);

  // --- Surah/Ayah picker state ---
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSurah, setPickerSurah] = useState(surahNumber);
  const [pickerAyah, setPickerAyah] = useState(targetAyah);
  const surahListRef = useRef<HTMLDivElement>(null);
  const ayahListRef = useRef<HTMLDivElement>(null);
  const sidebarSurahRef = useRef<HTMLDivElement>(null);
  const sidebarAyahRef = useRef<HTMLDivElement>(null);

  // --- Client-side state for instant ayah transitions in audio mode ---
  const [clientAyah, setClientAyah] = useState(targetAyah);
  const [ayahTick, setAyahTick] = useState(0);

  // Seed ayah text cache from server props
  for (const a of ayahs) {
    ayahTextCache.set(`${surahNumber}:${a.ayahNumber}`, a.textUthmani);
  }

  // Sync from server props when they change (real navigation / initial load)
  useEffect(() => { setClientAyah(targetAyah); }, [targetAyah]);

  // Client-side navigation: update state + URL without server round-trip
  const handleAudioNavigate = useCallback((ayah: number) => {
    history.replaceState(null, '', `/quran/${surahNumber}/${ayah}?audio=1`);
    setClientAyah(ayah);
  }, [surahNumber]);

  const {
    isAudioMode,
    isPlaying,
    toggleAudioMode,
    play,
    pause,
    skipForward,
    skipBack,
    highlightedPosition,
    audioRef,
  } = useQuranAudio(surahNumber, clientAyah, totalAyahs, router, initialAudioMode, handleAudioNavigate, surahNameEnglish, surahNameArabic, reciter);

  const [tafsirEditions, setTafsirEditions] = useState<TafsirEdition[]>([]);
  const [tafsirLang, setTafsirLang] = useState<string>("");
  const [tafsirEditionId, setTafsirEditionId] = useState<string>("");
  const [tafsirTick, setTafsirTick] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const canGoPrev = clientAyah > 1 || surahNumber > 1;
  const canGoNext = clientAyah < totalAyahs || surahNumber < 114;

  const goNext = useCallback(() => {
    if (clientAyah < totalAyahs) {
      router.replace(`/quran/${surahNumber}/${clientAyah + 1}`);
    } else if (surahNumber < 114) {
      router.replace(`/quran/${surahNumber + 1}/1`);
    }
  }, [clientAyah, totalAyahs, surahNumber, router]);

  const goPrev = useCallback(() => {
    if (clientAyah > 1) {
      router.replace(`/quran/${surahNumber}/${clientAyah - 1}`);
    } else if (surahNumber > 1) {
      // Fetch the previous surah's total ayahs to navigate to its last ayah
      fetch(`/api/quran/ayahs?surah=${surahNumber - 1}&offset=0&limit=1`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          const lastAyah = d?.total || 1;
          router.replace(`/quran/${surahNumber - 1}/${lastAyah}`);
        })
        .catch(() => router.replace(`/quran/${surahNumber - 1}/1`));
    }
  }, [clientAyah, surahNumber, router]);

  // Compute display range: 1 before, target, 2 after
  const displayAyahNumbers = useMemo(() => {
    const nums: number[] = [];
    for (let i = Math.max(1, clientAyah - 1); i <= Math.min(totalAyahs, clientAyah + 2); i++) {
      nums.push(i);
    }
    return nums;
  }, [clientAyah, totalAyahs]);

  // Read ayah texts from cache (synchronous — zero flicker)
  const displayAyahs = displayAyahNumbers.map(n => ({
    number: n,
    text: ayahTextCache.get(`${surahNumber}:${n}`) || "",
  }));

  // Fetch missing ayah texts
  useEffect(() => {
    const missing = displayAyahNumbers.filter(n => !ayahTextCache.has(`${surahNumber}:${n}`));
    if (missing.length === 0) return;
    const min = Math.min(...missing);
    const max = Math.max(...missing);
    let cancelled = false;
    fetch(`/api/quran/ayahs?surah=${surahNumber}&offset=${min - 1}&limit=${max - min + 1}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.ayahs) for (const a of d.ayahs) ayahTextCache.set(`${surahNumber}:${a.ayahNumber}`, a.textUthmani);
        if (!cancelled) setAyahTick(t => t + 1);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [surahNumber, displayAyahNumbers]);

  // In audio mode, pre-warm upcoming ayah texts
  useEffect(() => {
    if (!isAudioMode) return;
    const toFetch: number[] = [];
    for (let i = 1; i <= 20; i++) {
      const a = clientAyah + i;
      if (a <= totalAyahs && !ayahTextCache.has(`${surahNumber}:${a}`)) toFetch.push(a);
    }
    if (toFetch.length === 0) return;
    const min = Math.min(...toFetch);
    const max = Math.max(...toFetch);
    fetch(`/api/quran/ayahs?surah=${surahNumber}&offset=${min - 1}&limit=${max - min + 1}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.ayahs) for (const a of d.ayahs) ayahTextCache.set(`${surahNumber}:${a.ayahNumber}`, a.textUthmani);
      })
      .catch(() => {});
  }, [isAudioMode, surahNumber, clientAyah, totalAyahs]);

  // Prefetch adjacent ayah routes for non-audio navigation
  useEffect(() => {
    if (isAudioMode) return;
    if (canGoPrev) router.prefetch(`/quran/${surahNumber}/${clientAyah - 1}`);
    if (canGoNext) router.prefetch(`/quran/${surahNumber}/${clientAyah + 1}`);
  }, [surahNumber, clientAyah, canGoPrev, canGoNext, router, isAudioMode]);

  // Translations: read synchronously from module-level cache (zero flicker)
  const ayahNumbers = displayAyahNumbers;
  const translationEdition = PREFERRED_EDITIONS[locale] || PREFERRED_EDITIONS.en;
  const [translationTick, setTranslationTick] = useState(0);

  const translations: Record<number, string> = {};
  if (locale !== "ar") {
    for (const num of ayahNumbers) {
      const val = translationCache.get(`${surahNumber}:${num}:${translationEdition.id}`);
      if (val) translations[num] = val;
    }
  }
  const translatorName = locale !== "ar" ? translationEdition.name : "";

  // Background fetch: populate cache, bump tick to trigger re-render when done
  useEffect(() => {
    if (locale === "ar") return;
    const warmRange = isAudioMode ? 20 : 2;
    const toFetch: number[] = [];
    for (let i = -warmRange; i <= warmRange; i++) {
      const a = clientAyah + i;
      if (a >= 1 && a <= totalAyahs && !translationCache.has(`${surahNumber}:${a}:${translationEdition.id}`)) {
        toFetch.push(a);
      }
    }
    if (toFetch.length === 0) return;
    let cancelled = false;
    Promise.all(
      toFetch.map((num) =>
        fetch(`/api/quran/translations/${surahNumber}/${num}?editionId=${translationEdition.id}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (d?.translations?.[0]?.text) {
              translationCache.set(`${surahNumber}:${num}:${translationEdition.id}`, d.translations[0].text);
            }
          })
          .catch(() => {})
      )
    ).then(() => { if (!cancelled) setTranslationTick((t) => t + 1); });
    return () => { cancelled = true; };
  }, [surahNumber, clientAyah, locale, isAudioMode, totalAyahs]);

  // Fetch available tafsir editions
  useEffect(() => {
    fetch("/api/quran/tafsirs")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.tafsirs) return;
        const editions: TafsirEdition[] = d.tafsirs.filter(
          (t: TafsirEdition) => t.language && t.language !== "unknown"
        );
        setTafsirEditions(editions);
        const hasLang = (l: string) => editions.some((e: TafsirEdition) => e.language === l) && getLanguageName(l);
        const defaultLang = hasLang(locale) ? locale
          : hasLang("ar") ? "ar" : editions.find((e: TafsirEdition) => getLanguageName(e.language))?.language || "";
        setTafsirLang(defaultLang);
        const langEditions = editions.filter((e: TafsirEdition) => e.language === defaultLang);
        const preferred = PREFERRED_TAFSIRS[defaultLang];
        const defaultEdition = (preferred && langEditions.find((e) => e.id === preferred)) || langEditions[0];
        if (defaultEdition) setTafsirEditionId(defaultEdition.id);
      })
      .catch(() => {});
  }, []);

  // Group tafsir editions by language
  const tafsirLangs = useMemo(() => {
    const langMap: Record<string, TafsirEdition[]> = {};
    for (const e of tafsirEditions) {
      if (!langMap[e.language]) langMap[e.language] = [];
      langMap[e.language].push(e);
    }
    return langMap;
  }, [tafsirEditions]);

  // When tafsir language changes, prefer Ibn Kathir or first edition
  useEffect(() => {
    if (!tafsirLang || !tafsirLangs[tafsirLang]) return;
    const editions = tafsirLangs[tafsirLang];
    if (editions.length > 0 && !editions.some((e) => e.id === tafsirEditionId)) {
      const preferred = PREFERRED_TAFSIRS[tafsirLang];
      const pick = (preferred && editions.find((e) => e.id === preferred)) || editions[0];
      setTafsirEditionId(pick.id);
    }
  }, [tafsirLang, tafsirLangs]);

  // Tafsir: read synchronously from cache
  const currentTafsir = tafsirEditionId
    ? (tafsirCache.get(`${surahNumber}:${clientAyah}:${tafsirEditionId}`)
       ?? tafsirCache.get(`${surahNumber}:${clientAyah - 1}:${tafsirEditionId}`)
       ?? null)
    : null;

  // Helper: fetch a single tafsir into cache (deduped)
  const fetchTafsir = useCallback((surah: number, ayah: number, editionId: string, onDone?: () => void) => {
    const key = `${surah}:${ayah}:${editionId}`;
    if (tafsirCache.has(key) || tafsirFetching.has(key)) return;
    tafsirFetching.add(key);
    fetch(`/api/quran/tafsir/${surah}/${ayah}?editionId=${editionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.tafsirs?.[0]?.text) {
          const text = d.tafsirs[0].text;
          tafsirCache.set(key, text);
          const prevKey = `${surah}:${ayah - 1}:${editionId}`;
          const nextKey = `${surah}:${ayah + 1}:${editionId}`;
          if (tafsirCache.get(prevKey) === text && !tafsirCache.has(nextKey)) {
            tafsirCache.set(nextKey, text);
          }
          if (tafsirCache.get(nextKey) === text && !tafsirCache.has(prevKey)) {
            tafsirCache.set(prevKey, text);
          }
        }
        onDone?.();
      })
      .catch(() => {})
      .finally(() => tafsirFetching.delete(key));
  }, []);

  // Fetch current ayah tafsir + bump tick when it arrives
  useEffect(() => {
    if (!tafsirEditionId) return;
    const key = `${surahNumber}:${clientAyah}:${tafsirEditionId}`;
    if (tafsirCache.has(key)) return;
    let cancelled = false;
    fetchTafsir(surahNumber, clientAyah, tafsirEditionId, () => {
      if (!cancelled) setTafsirTick((t) => t + 1);
    });
    return () => { cancelled = true; };
  }, [surahNumber, clientAyah, tafsirEditionId, fetchTafsir]);

  // Pre-warm tafsir: +20 ayahs ahead in audio mode
  useEffect(() => {
    if (!isAudioMode || !tafsirEditionId) return;
    for (let i = 1; i <= 20; i++) {
      const a = clientAyah + i;
      if (a <= totalAyahs) fetchTafsir(surahNumber, a, tafsirEditionId);
    }
  }, [isAudioMode, surahNumber, clientAyah, tafsirEditionId, totalAyahs, fetchTafsir]);

  // Swipe navigation
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (isAudioMode) {
        if (dx > 0 && clientAyah < totalAyahs) handleAudioNavigate(clientAyah + 1);
        else if (dx < 0 && clientAyah > 1) handleAudioNavigate(clientAyah - 1);
      } else {
        if (dx > 0 && canGoNext) goNext();
        else if (dx < 0 && canGoPrev) goPrev();
      }
    }
  }, [clientAyah, surahNumber, canGoPrev, canGoNext, router, isAudioMode, handleAudioNavigate]);

  // Track scroll direction for per-ayah slide transitions
  const prevClientAyahRef = useRef(clientAyah);
  const scrollDir = useRef(1);
  if (clientAyah !== prevClientAyahRef.current) {
    scrollDir.current = clientAyah > prevClientAyahRef.current ? 1 : -1;
    prevClientAyahRef.current = clientAyah;
  }

  // Scroll content to top on navigation
  useEffect(() => {
    containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [clientAyah, surahNumber]);

  // Open picker and auto-scroll to current surah/ayah
  const openPicker = useCallback(() => {
    setPickerSurah(surahNumber);
    setPickerAyah(clientAyah);
    setShowPicker(true);
    requestAnimationFrame(() => {
      // Scroll surah list to center the current surah
      const surahEl = surahListRef.current?.querySelector(`[data-surah="${surahNumber}"]`) as HTMLElement | null;
      surahEl?.scrollIntoView({ block: "center" });
      // Scroll ayah list to center the current ayah
      const ayahEl = ayahListRef.current?.querySelector(`[data-ayah="${clientAyah}"]`) as HTMLElement | null;
      ayahEl?.scrollIntoView({ block: "center" });
    });
  }, [surahNumber, clientAyah]);

  // When picker surah changes, reset ayah to 1 (unless it's the current surah)
  const handlePickerSurahSelect = useCallback((num: number) => {
    setPickerSurah(num);
    if (num === surahNumber) {
      setPickerAyah(clientAyah);
    } else {
      setPickerAyah(1);
    }
    // Scroll ayah list to top (or to current ayah if same surah)
    requestAnimationFrame(() => {
      if (num === surahNumber) {
        const ayahEl = ayahListRef.current?.querySelector(`[data-ayah="${clientAyah}"]`) as HTMLElement | null;
        ayahEl?.scrollIntoView({ block: "center" });
        const sidebarAyahEl = sidebarAyahRef.current?.querySelector(`[data-ayah="${clientAyah}"]`) as HTMLElement | null;
        sidebarAyahEl?.scrollIntoView({ block: "center", behavior: "smooth" });
      } else {
        ayahListRef.current?.scrollTo({ top: 0 });
        sidebarAyahRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }, [surahNumber, clientAyah]);

  const handlePickerGo = useCallback(() => {
    setShowPicker(false);
    // Stop audio to prevent old scheduled sources from overriding navigation
    if (isPlaying) pause();
    const audioParam = isAudioMode ? '?audio=1' : '';
    router.replace(`/quran/${pickerSurah}/${pickerAyah}${audioParam}`);
  }, [pickerSurah, pickerAyah, router, isAudioMode, isPlaying, pause]);

  const pickerAyahCount = SURAHS[pickerSurah - 1]?.ayahCount ?? 1;

  // Desktop sidebar: navigate immediately on click
  const handleSidebarAyahClick = useCallback((ayah: number) => {
    setPickerAyah(ayah);
    if (isPlaying) pause();
    if (isAudioMode && pickerSurah === surahNumber) {
      // In audio mode, same surah: use client-side nav to avoid router state mismatch
      handleAudioNavigate(ayah);
    } else {
      const audioParam = isAudioMode ? '?audio=1' : '';
      router.replace(`/quran/${pickerSurah}/${ayah}${audioParam}`);
    }
  }, [pickerSurah, surahNumber, router, isAudioMode, isPlaying, pause, handleAudioNavigate]);

  const handleSidebarSurahClick = useCallback((num: number) => {
    handlePickerSurahSelect(num);
    if (isPlaying) pause();
    const ayah = num === surahNumber ? clientAyah : 1;
    const audioParam = isAudioMode ? '?audio=1' : '';
    router.replace(`/quran/${num}/${ayah}${audioParam}`);
  }, [handlePickerSurahSelect, surahNumber, clientAyah, router, isAudioMode, isPlaying, pause]);

  // Sync sidebar picker with current navigation state
  const isInitialMount = useRef(true);
  useEffect(() => {
    setPickerSurah(surahNumber);
    setPickerAyah(clientAyah);
    const smooth = !isInitialMount.current;
    isInitialMount.current = false;
    requestAnimationFrame(() => {
      const surahEl = sidebarSurahRef.current?.querySelector(`[data-surah="${surahNumber}"]`) as HTMLElement | null;
      surahEl?.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
      const ayahEl = sidebarAyahRef.current?.querySelector(`[data-ayah="${clientAyah}"]`) as HTMLElement | null;
      ayahEl?.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
    });
  }, [surahNumber, clientAyah]);

  // Suppress unused tick warnings
  void translationTick;
  void tafsirTick;
  void ayahTick;

  return (
    <div className="ayah-view flex flex-col h-full min-h-0">
      {/* Header bar */}
      <div className="ayah-header flex items-center px-3 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] border-b bg-card shrink-0 gap-2">
        <button
          onClick={() => router.back()}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          aria-label={t("common.close")}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          onClick={openPicker}
          className="flex-1 flex items-center gap-1 text-sm font-medium truncate hover:opacity-70 sm:hover:opacity-100 sm:cursor-default transition-opacity"
          aria-label={t("mushaf.goToSurah")}
        >
          <span className="truncate">
            {locale === "ar" ? surahNameArabic : `${t("mushaf.surah")} ${surahNameEnglish}`}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50 sm:hidden" />
        </button>
        {isAudioMode && (
          <button
            onClick={() => setShowReciterMenu((v) => !v)}
            className="flex items-center gap-1 p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            aria-label="Reciter"
          >
            <User className="h-4 w-4" />
            <span className="hidden sm:inline text-xs font-medium max-w-[100px] truncate">
              {RECITERS.find((r) => r.slug === reciter)?.name ?? "Reciter"}
            </span>
          </button>
        )}
        <button
          onClick={toggleAudioMode}
          className={`p-1.5 rounded-lg transition-colors ${
            isAudioMode
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted text-muted-foreground"
          }`}
          aria-label={isAudioMode ? t("mushaf.stopListening") : t("mushaf.listenToAyah")}
        >
          <Headphones className="h-5 w-5" />
        </button>
        <button
          onClick={() => router.push(`/mushaf/pdf?page=${ayahs[0]?.pageNumber ?? 1}`)}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          aria-label="PDF"
        >
          <FileText className="h-5 w-5" />
        </button>
      </div>

      {/* Surah/Ayah Picker Overlay (mobile only — desktop uses sidebar) */}
      <AnimatePresence>
      {showPicker && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center sm:hidden"
          onClick={() => setShowPicker(false)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="absolute inset-0 bg-black/50" />
          <motion.div
            className="picker-panel relative w-full h-full sm:h-auto sm:max-h-[80vh] sm:max-w-md sm:rounded-2xl bg-card flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          >
            {/* Picker header */}
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <h2 className="text-sm font-semibold">{t("mushaf.goToSurah")}</h2>
              <button
                onClick={() => setShowPicker(false)}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                aria-label={t("common.close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Column headers */}
            <div className="flex border-b shrink-0 text-xs text-muted-foreground font-medium">
              <div className="flex-1 px-4 py-1.5">{t("mushaf.surah")}</div>
              <div className="w-24 px-4 py-1.5 border-l text-center">{t("mushaf.ayah")}</div>
            </div>

            {/* Two-column picker body */}
            <div className="flex flex-1 min-h-0">
              {/* Surah column */}
              <div ref={surahListRef} className="flex-1 overflow-y-auto picker-scroll">
                {SURAHS.map((s) => (
                  <button
                    key={s.number}
                    data-surah={s.number}
                    onClick={() => handlePickerSurahSelect(s.number)}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2 ${
                      s.number === pickerSurah
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <span className="text-xs text-muted-foreground w-6 shrink-0 tabular-nums">{s.number}</span>
                    <span className="truncate">{locale === "ar" ? s.nameArabic : s.nameEnglish}</span>
                  </button>
                ))}
              </div>

              {/* Ayah column */}
              <div ref={ayahListRef} className="w-24 border-l overflow-y-auto picker-scroll">
                {Array.from({ length: pickerAyahCount }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    data-ayah={n}
                    onClick={() => setPickerAyah(n)}
                    className={`w-full text-center py-2 text-sm tabular-nums transition-colors ${
                      n === pickerAyah
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Go button */}
            <div className="shrink-0 border-t px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <button
                onClick={handlePickerGo}
                className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 active:bg-primary/80 transition-colors"
              >
                {t("mushaf.goToSurah")} {pickerSurah}:{pickerAyah}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Reciter Menu */}
      <AnimatePresence>
      {showReciterMenu && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-start sm:justify-end"
          onClick={() => setShowReciterMenu(false)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div className="absolute inset-0 bg-black/40" />
          <motion.div
            className="reciter-menu relative w-full sm:w-auto sm:min-w-[260px] sm:mt-12 sm:mr-4 bg-card sm:rounded-xl rounded-t-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          >
            {/* Drag handle (mobile) */}
            <div className="sm:hidden flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
            </div>
            <div className="px-4 py-3 border-b">
              <p className="text-sm font-semibold">Reciter</p>
            </div>
            <div className="py-1 pb-[env(safe-area-inset-bottom)]">
              {RECITERS.map((r) => (
                <button
                  key={r.slug}
                  onClick={() => handleReciterChange(r.slug)}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors flex items-center justify-between ${
                    r.slug === reciter
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted/50 active:bg-muted"
                  }`}
                >
                  <span className={r.slug === reciter ? "font-medium" : ""}>{r.name}</span>
                  {r.slug === reciter && (
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Main area: sidebar + content */}
      <div className="flex flex-1 min-h-0">
        {/* Desktop Sidebar */}
        <div className="quran-sidebar hidden sm:flex sm:flex-col sm:w-64 shrink-0 min-h-0">
          <div className="flex shrink-0 text-xs text-muted-foreground/60 font-medium tracking-wide uppercase">
            <div className="flex-1 px-4 py-2">{t("mushaf.surah")}</div>
            <div className="w-20 px-2 py-2 text-center">{t("mushaf.ayah")}</div>
          </div>
          <div className="flex flex-1 min-h-0">
            <div ref={sidebarSurahRef} className="flex-1 overflow-y-auto overflow-x-hidden picker-scroll">
              {SURAHS.map((s) => (
                <button
                  key={s.number}
                  data-surah={s.number}
                  onClick={() => handleSidebarSurahClick(s.number)}
                  className={`quran-sidebar-item relative w-full text-left px-4 py-2 text-sm flex items-center gap-2.5 ${
                    s.number === pickerSurah
                      ? "quran-sidebar-item-active"
                      : ""
                  }`}
                >
                  {s.number === pickerSurah && (
                    <motion.span
                      layoutId="sidebar-surah-highlight"
                      className="absolute inset-0 rounded-lg quran-sidebar-surah-pill"
                      transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    />
                  )}
                  <span className="relative z-[1] text-xs opacity-40 w-6 shrink-0 tabular-nums">{s.number}</span>
                  <span className="relative z-[1] truncate">{locale === "ar" ? s.nameArabic : s.nameEnglish}</span>
                </button>
              ))}
            </div>
            <div ref={sidebarAyahRef} className="w-20 overflow-y-auto overflow-x-hidden picker-scroll quran-sidebar-ayah-col">
              {Array.from({ length: pickerAyahCount }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  data-ayah={n}
                  onClick={() => handleSidebarAyahClick(n)}
                  className={`quran-sidebar-ayah relative w-full text-center py-2 text-sm tabular-nums ${
                    n === pickerAyah
                      ? "quran-sidebar-ayah-active"
                      : ""
                  }`}
                >
                  {n === pickerAyah && (
                    <motion.span
                      layoutId="sidebar-ayah-highlight"
                      className="absolute inset-0 rounded-md quran-sidebar-ayah-pill"
                      transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    />
                  )}
                  <span className="relative z-[1]">{n}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content + bottom nav */}
        <div className="flex flex-col flex-1 min-h-0">
      {/* Content */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-auto flex justify-center ayah-bg"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div ref={contentRef} className="ayah-content-frame">
          {/* Ayah & page info */}
          <p className="ayah-info-line" dir="ltr">
            {t("mushaf.ayah")} {clientAyah} / {totalAyahs}
            {ayahs[0]?.pageNumber != null && (
              <> · {t("mushaf.page")} {ayahs.find(a => a.ayahNumber === clientAyah)?.pageNumber ?? ayahs[0].pageNumber}</>
            )}
          </p>

          {/* Bismillah + Arabic ayahs — per-ayah slide transitions */}
          <AnimatePresence mode="popLayout" initial={false} custom={scrollDir.current}>
            {surahNumber !== 1 && surahNumber !== 9 && displayAyahNumbers[0] === 1 && (
              <motion.div
                key="bismillah"
                className="arabic-ayah"
                custom={scrollDir.current}
                variants={ayahSlideVariants}
                initial="enter"
                animate={{ opacity: 0.3, y: 0 }}
                exit="exit"
                transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
              >
                <p className="arabic-bismillah" dir="rtl">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</p>
              </motion.div>
            )}
            {displayAyahs.map(({ number, text }) => {
              const isCurrentAyah = number === clientAyah;
              const words = cleanUthmani(stripBismillah(text, surahNumber, number)).split(/\s+/).filter(Boolean);
              return (
                <motion.div
                  key={number}
                  className="arabic-ayah"
                  custom={scrollDir.current}
                  variants={ayahSlideVariants}
                  initial="enter"
                  animate={{ opacity: isCurrentAyah ? 1 : 0.3, y: 0 }}
                  exit="exit"
                  transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  <p className="arabic-ayah-text" dir="rtl">
                    {words.map((word, i) => {
                      const pos = i + 1;
                      const highlighted = isCurrentAyah && isAudioMode && highlightedPosition === pos;
                      return (
                        <span key={i} className={highlighted ? "arabic-word-highlight" : undefined}>
                          {word}{" "}
                        </span>
                      );
                    })}
                    <span className="arabic-ayah-end-marker">
                      {number.toLocaleString("ar-EG")}
                    </span>
                  </p>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Translations — per-ayah slide transitions */}
          {Object.keys(translations).length > 0 && (
            <div dir="ltr" className="ayah-translation-section">
              <p className="ayah-translation-label">[{translatorName}]</p>
              <AnimatePresence mode="popLayout" initial={false} custom={scrollDir.current}>
                {ayahNumbers.map((num) =>
                  translations[num] ? (
                    <motion.p
                      key={num}
                      className="ayah-translation-text"
                      custom={scrollDir.current}
                      variants={ayahSlideVariants}
                      initial="enter"
                      animate={{ opacity: num === clientAyah ? 1 : 0.4, y: 0 }}
                      exit="exit"
                      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                    >
                      <span className="ayah-translation-num">{surahNumber}:{num}</span>{" "}
                      {translations[num]}
                    </motion.p>
                  ) : null
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Tafsir section */}
          {tafsirEditions.length > 0 && (
            <div dir="ltr" className="ayah-tafsir-section">
              <p className="ayah-tafsir-title">{t("mushaf.tafsir")}</p>
              <div className="ayah-tafsir-selectors">
                <select
                  value={tafsirLang}
                  onChange={(e) => setTafsirLang(e.target.value)}
                  className="ayah-tafsir-select"
                >
                  {Object.keys(tafsirLangs).sort().map((lang) => {
                    const name = getLanguageName(lang);
                    if (!name) return null;
                    return (
                      <option key={lang} value={lang}>
                        {name} ({tafsirLangs[lang].length})
                      </option>
                    );
                  })}
                </select>

                <select
                  value={tafsirEditionId}
                  onChange={(e) => setTafsirEditionId(e.target.value)}
                  className="ayah-tafsir-select ayah-tafsir-select-edition"
                >
                  {(tafsirLangs[tafsirLang] || []).map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>

              <AnimatePresence mode="wait" initial={false}>
                {currentTafsir && (
                  <motion.div
                    key={`${surahNumber}:${clientAyah}:${tafsirEditionId}`}
                    className="ayah-tafsir-content"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div
                      className="ayah-tafsir-text"
                      dir={tafsirEditions.find((e) => e.id === tafsirEditionId)?.direction || "ltr"}
                      dangerouslySetInnerHTML={{ __html: currentTafsir }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Bottom nav */}
      <div
        className="shrink-0 border-t border-border/50 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
        style={{ backgroundColor: 'hsl(var(--reader-bg, 40 30% 96%))' }}
        dir="ltr"
      >
        <div className={`flex items-center ${isAudioMode ? "justify-center gap-4" : "justify-between"}`}>
          {isAudioMode ? (
            <>
              <button
                onClick={skipForward}
                disabled={clientAyah >= totalAyahs}
                className="h-11 px-5 rounded-xl bg-foreground/[0.06] hover:bg-foreground/[0.1] active:bg-foreground/[0.15] flex items-center justify-center text-sm font-medium transition-colors disabled:opacity-30"
                aria-label={t("mushaf.skipForward")}
              >
                <SkipBack className="h-5 w-5" />
              </button>

              <button
                onClick={isPlaying ? pause : play}
                className="h-11 w-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 flex items-center justify-center transition-colors"
                aria-label={isPlaying ? t("audio.pause") : t("audio.play")}
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
              </button>

              <button
                onClick={skipBack}
                disabled={clientAyah <= 1}
                className="h-11 px-5 rounded-xl bg-foreground/[0.06] hover:bg-foreground/[0.1] active:bg-foreground/[0.15] flex items-center justify-center text-sm font-medium transition-colors disabled:opacity-30"
                aria-label={t("mushaf.skipBack")}
              >
                <SkipForward className="h-5 w-5" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={goNext}
                disabled={!canGoNext}
                className="h-11 px-5 rounded-xl bg-foreground/[0.06] hover:bg-foreground/[0.1] active:bg-foreground/[0.15] flex items-center justify-center gap-1.5 text-sm font-medium transition-colors disabled:opacity-30"
                aria-label={clientAyah >= totalAyahs ? t("mushaf.nextSurah") : t("mushaf.nextAyah")}
              >
                <ChevronLeft className="h-5 w-5" />
                {clientAyah >= totalAyahs ? t("mushaf.nextSurah") : t("mushaf.nextAyah")}
              </button>

              <span className="text-sm text-muted-foreground tabular-nums">
                {t("mushaf.ayah")} {clientAyah} / {totalAyahs}
              </span>

              <button
                onClick={goPrev}
                disabled={!canGoPrev}
                className="h-11 px-5 rounded-xl bg-foreground/[0.06] hover:bg-foreground/[0.1] active:bg-foreground/[0.15] flex items-center justify-center gap-1.5 text-sm font-medium transition-colors disabled:opacity-30"
                aria-label={clientAyah <= 1 ? t("mushaf.prevSurah") : t("mushaf.prevAyah")}
              >
                {clientAyah <= 1 ? t("mushaf.prevSurah") : t("mushaf.prevAyah")}
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
      </div>
        </div>
      </div>

      {/* Hidden audio element */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} preload="none" playsInline webkit-playsinline="" />

      <style jsx global>{`
        .ayah-bg {
          background-color: hsl(var(--reader-bg, 40 30% 96%));
          color: hsl(var(--reader-fg, 0 0% 10%));
          padding: 1rem 0;
        }
        @media (min-width: 640px) {
          .ayah-bg { padding: 1.5rem 0; }
        }

        .ayah-content-frame {
          width: 100%;
          max-width: 640px;
          margin: 0 auto;
          padding: 0.5rem 1rem;
          display: flex;
          flex-direction: column;
        }
        @media (min-width: 640px) {
          .ayah-content-frame {
            padding: 1.5rem 2rem;
            background: hsl(var(--reader-bg, 40 30% 96%));
          }
        }

        /* Ayah info line */
        .ayah-info-line {
          text-align: center;
          font-size: 0.75rem;
          color: hsl(var(--muted-foreground));
          opacity: 0.6;
          margin-bottom: 0.5rem;
        }

        /* Arabic ayahs — ayah by ayah display */
        .arabic-ayah {
          padding: 0.15rem 0;
        }
        /* opacity controlled by framer-motion animate prop */
        .arabic-ayah-text {
          font-family: "UthmanicHafs", "Noto Naskh Arabic", "Amiri", serif;
          font-size: clamp(1.1rem, 4vw, 1.4rem);
          line-height: 2;
          text-align: right;
          margin: 0;
        }
        .arabic-bismillah {
          font-family: "UthmanicHafs", "Noto Naskh Arabic", "Amiri", serif;
          font-size: clamp(1.1rem, 4vw, 1.4rem);
          line-height: 2;
          text-align: right;
          margin: 0;
          opacity: 0.6;
        }
        .arabic-ayah-end-marker {
          opacity: 0.4;
          white-space: nowrap;
        }
        .arabic-word-highlight {
          color: hsl(160 84% 39%);
          transition: color 0.1s ease;
        }
        :is(.dark) .arabic-word-highlight {
          color: hsl(158 64% 52%);
        }

        /* Translation block */
        .ayah-translation-section {
          margin-top: 1.5rem;
          padding-top: 0.75rem;
          border-top: 1px solid hsl(var(--border));
        }
        .ayah-translation-label {
          font-size: 0.7rem;
          opacity: 0.4;
          margin-bottom: 0.5rem;
          text-align: center;
        }
        .ayah-translation-text {
          font-size: 0.875rem;
          line-height: 1.6;
          margin-bottom: 0.5rem;
        }
        /* translation opacity controlled by framer-motion */
        .ayah-translation-num {
          font-size: 0.75rem;
          font-weight: 600;
          opacity: 0.5;
          margin-right: 0.25rem;
        }

        /* Tafsir section */
        .ayah-tafsir-section {
          margin-top: 1rem;
          border-top: 1px solid hsl(var(--border));
          padding-top: 0.5rem;
        }
        .ayah-tafsir-title {
          font-size: 0.9rem;
          font-weight: 600;
          opacity: 0.5;
          text-align: center;
          margin-bottom: 0.375rem;
        }
        .ayah-tafsir-selectors {
          display: flex;
          gap: 0.5rem;
          margin: 0.25rem 0 0.5rem;
        }
        .ayah-tafsir-select {
          flex-shrink: 0;
          padding: 0.25rem 0.5rem;
          font-size: 0.75rem;
          border-radius: 6px;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          color: inherit;
          cursor: pointer;
          max-width: 11rem;
        }
        .ayah-tafsir-select-edition {
          flex: 1;
          min-width: 0;
          max-width: none;
        }
        .ayah-tafsir-content {
          margin-top: 0.5rem;
        }
        .ayah-tafsir-text {
          font-size: 0.8rem;
          line-height: 1.7;
        }

        /* Picker (mobile full-screen) */
        @media (max-width: 639px) {
          .picker-panel {
            border-radius: 0;
          }
        }
        .picker-scroll {
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
        }

        /* Desktop sidebar */
        .quran-sidebar {
          background: hsl(var(--reader-bg, 40 30% 96%));
          color: hsl(var(--reader-fg, 0 0% 10%));
          border-right: 1px solid hsl(var(--border) / 0.3);
        }
        .quran-sidebar-item {
          border-radius: 0.5rem;
          margin: 1px 0.375rem;
          padding-left: 0.625rem;
          opacity: 0.55;
          transition: opacity 0.2s ease, color 0.2s ease;
        }
        .quran-sidebar-item:hover {
          opacity: 0.85;
          background: hsl(var(--foreground) / 0.04);
        }
        .quran-sidebar-item-active {
          opacity: 1;
          background: none;
          color: hsl(var(--primary));
          font-weight: 500;
        }
        .quran-sidebar-item-active:hover {
          background: none;
        }
        .quran-sidebar-surah-pill {
          background: hsl(var(--primary) / 0.08);
        }
        .quran-sidebar-ayah-col {
          border-left: 1px solid hsl(var(--border) / 0.2);
        }
        .quran-sidebar-ayah {
          opacity: 0.4;
          border-radius: 0.375rem;
          margin: 1px 0.25rem;
          transition: opacity 0.2s ease, color 0.2s ease;
        }
        .quran-sidebar-ayah:hover {
          opacity: 0.7;
          background: hsl(var(--foreground) / 0.04);
        }
        .quran-sidebar-ayah-active {
          opacity: 1;
          background: none;
          color: hsl(var(--primary));
          font-weight: 500;
        }
        .quran-sidebar-ayah-active:hover {
          background: none;
        }
        .quran-sidebar-ayah-pill {
          background: hsl(var(--primary) / 0.08);
        }

        /* Font face */
        @font-face {
          font-family: "UthmanicHafs";
          src: url("/fonts/mushaf/UthmanicHafs_V22.woff2") format("woff2");
          font-weight: normal;
          font-style: normal;
          font-display: swap;
        }
      `}</style>
    </div>
  );
}
