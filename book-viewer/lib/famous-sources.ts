/**
 * Famous Sources Dictionary
 *
 * Provides fuzzy and cross-language lookup for well-known Quran verses and hadiths.
 * Used to boost ranking for specific source lookups like "ayat al-kursi" or "آية الكرسي".
 */

// ============================================================================
// Types
// ============================================================================

export interface VerseReference {
  surahNumber: number;
  ayahNumber: number;
  ayahEnd?: number;  // For multi-ayah references
}

export interface HadithReference {
  collectionSlug: string;
  hadithNumber: string;
}

export interface SurahReference {
  surahNumber: number;
  quranComUrl: string;  // e.g., "https://quran.com/112"
  totalAyahs: number;   // Number of ayahs in this surah
}

export interface FamousSource<T> {
  names: string[];  // All name variants for this source
  ref: T;
}

// ============================================================================
// Famous Verses Dictionary
// ============================================================================

export const FAMOUS_VERSES: FamousSource<VerseReference>[] = [
  {
    names: [
      // Arabic variants (with/without diacritics, common misspellings)
      'آية الكرسي', 'اية الكرسي', 'ايه الكرسي', 'آيات الكرسي', 'ايات الكرسي',
      'الكرسي', 'كرسي',
      // Transliterated variants
      'ayat al-kursi', 'ayatul kursi', 'ayat kursi', 'ayat al kursi', 'ayatul-kursi',
      'ayat alkursi', 'ayah al kursi', 'ayah kursi', 'aya al kursi',
      // French
      'verset du trone', 'verset du trône',
      // Other references
      'البقرة 255', 'baqarah 255', 'al-baqarah 255',
    ],
    ref: { surahNumber: 2, ayahNumber: 255 },
  },
  {
    names: [
      // Arabic
      'الفاتحة', 'سورة الفاتحة', 'ام الكتاب', 'فاتحة الكتاب', 'سورة الحمد',
      'السبع المثاني', 'فاتحه',
      // Transliterated
      'al-fatiha', 'al fatiha', 'fatiha', 'surah fatiha', 'alfatiha',
      'fateha', 'fatihah', 'al-fatihah',
    ],
    ref: { surahNumber: 1, ayahNumber: 1, ayahEnd: 7 },
  },
  {
    names: [
      // Arabic
      'آية النور', 'اية النور', 'ايه النور',
      // Transliterated
      'ayat al-nur', 'ayat al nur', 'ayat alnur',
      // Reference
      'النور 35', 'nur 35', 'al-nur 35',
    ],
    ref: { surahNumber: 24, ayahNumber: 35 },
  },
  {
    names: [
      // Arabic
      'خواتيم البقرة', 'خاتمة البقرة', 'آخر آيتين من البقرة', 'آخر البقرة',
      'خواتيم سورة البقرة',
      // Transliterated
      'last verses of baqarah', 'end of baqarah', 'last ayat baqarah',
      'khawatim al baqarah',
    ],
    ref: { surahNumber: 2, ayahNumber: 285, ayahEnd: 286 },
  },
  {
    names: [
      // Arabic
      'آية الدين', 'اية الدين', 'أطول آية',
      // Transliterated
      'ayat al-dayn', 'ayat aldayn',
      // Reference
      'البقرة 282', 'baqarah 282',
    ],
    ref: { surahNumber: 2, ayahNumber: 282 },
  },
  {
    names: [
      // Arabic
      'سورة الإخلاص', 'الإخلاص', 'قل هو الله أحد', 'قل هو الله احد',
      'الاخلاص', 'سورة الاخلاص',
      // Transliterated
      'al-ikhlas', 'surah ikhlas', 'ikhlas', 'al ikhlas',
    ],
    ref: { surahNumber: 112, ayahNumber: 1, ayahEnd: 4 },
  },
  {
    names: [
      // Arabic
      'سورة الفلق', 'الفلق', 'قل أعوذ برب الفلق',
      // Transliterated
      'al-falaq', 'surah falaq', 'falaq', 'al falaq',
    ],
    ref: { surahNumber: 113, ayahNumber: 1, ayahEnd: 5 },
  },
  {
    names: [
      // Arabic
      'سورة الناس', 'الناس', 'قل أعوذ برب الناس',
      // Transliterated
      'al-nas', 'surah nas', 'nas', 'al nas', 'surah an-nas',
    ],
    ref: { surahNumber: 114, ayahNumber: 1, ayahEnd: 6 },
  },
  {
    names: [
      // Arabic
      'المعوذتين', 'المعوذات', 'المعوذتان',
      // Transliterated
      'al-muawwidhat', 'muawwidhatain', 'mu\'awwidhatayn',
    ],
    ref: { surahNumber: 113, ayahNumber: 1, ayahEnd: 5 }, // Returns Falaq, but search will also show Nas
  },
  {
    names: [
      // Arabic
      'سورة يس', 'يس', 'يٰسٓ', 'قلب القرآن',
      // Transliterated
      'yasin', 'ya-sin', 'ya sin', 'surah yasin', 'yaseen',
    ],
    ref: { surahNumber: 36, ayahNumber: 1, ayahEnd: 83 },
  },
  {
    names: [
      // Arabic
      'سورة الملك', 'الملك', 'تبارك', 'المانعة', 'المنجية',
      // Transliterated
      'al-mulk', 'surah mulk', 'mulk', 'tabarak',
    ],
    ref: { surahNumber: 67, ayahNumber: 1, ayahEnd: 30 },
  },
  {
    names: [
      // Arabic
      'سورة الكهف', 'الكهف', 'اصحاب الكهف',
      // Transliterated
      'al-kahf', 'surah kahf', 'kahf',
    ],
    ref: { surahNumber: 18, ayahNumber: 1, ayahEnd: 110 },
  },
  {
    names: [
      // Arabic
      'آيات العشر من الكهف', 'أول عشر آيات من الكهف', 'عشر آيات الكهف',
      // Transliterated
      'first ten kahf', 'ten verses kahf',
    ],
    ref: { surahNumber: 18, ayahNumber: 1, ayahEnd: 10 },
  },
];

// ============================================================================
// Famous Hadiths Dictionary
// ============================================================================

export const FAMOUS_HADITHS: FamousSource<HadithReference[]>[] = [
  {
    names: [
      // Arabic
      'إنما الأعمال بالنيات', 'انما الاعمال بالنيات', 'حديث النية', 'حديث النيات',
      'الأعمال بالنيات', 'الاعمال بالنيات',
      // Transliterated
      'innamal amal binniyat', 'hadith of intentions', 'actions by intentions',
      'hadith niyyah', 'niyyah hadith',
    ],
    ref: [{ collectionSlug: 'bukhari', hadithNumber: '1' }],
  },
  {
    names: [
      // Arabic
      'حديث جبريل', 'حديث جبرائيل', 'حديث الإسلام والإيمان والإحسان',
      // Transliterated
      'hadith jibreel', 'hadith jibril', 'hadith of gabriel', 'jibreel hadith',
      'gabriel hadith',
    ],
    ref: [{ collectionSlug: 'muslim', hadithNumber: '8' }],
  },
  {
    names: [
      // Arabic
      'من حسن إسلام المرء', 'حسن الإسلام', 'ترك ما لا يعني',
      // Transliterated
      'min husn islam', 'husn al-islam',
    ],
    ref: [{ collectionSlug: 'tirmidhi', hadithNumber: '2317' }],
  },
  {
    names: [
      // Arabic
      'لا يؤمن أحدكم', 'حب لأخيك', 'حب لاخيك ما تحب لنفسك',
      // Transliterated
      'la yuminu ahadukum', 'hubb li akhik',
    ],
    ref: [{ collectionSlug: 'bukhari', hadithNumber: '13' }],
  },
  {
    names: [
      // Arabic
      'حديث الولي', 'من عادى لي وليا', 'اولياء الله',
      // Transliterated
      'hadith of the wali', 'hadith qudsi wali', 'hadith al-wali',
    ],
    ref: [{ collectionSlug: 'bukhari', hadithNumber: '6502' }],
  },
  {
    names: [
      // Arabic
      'الحلال بين والحرام بين', 'حديث الشبهات', 'المشتبهات',
      // Transliterated
      'hadith al-shubuhat', 'hadith of doubtful matters',
    ],
    ref: [{ collectionSlug: 'bukhari', hadithNumber: '52' }],
  },
  {
    names: [
      // Arabic
      'الدين النصيحة', 'حديث النصيحة',
      // Transliterated
      'ad-din an-nasiha', 'deen nasiha', 'hadith nasiha',
    ],
    ref: [{ collectionSlug: 'muslim', hadithNumber: '55' }],
  },
  {
    names: [
      // Arabic
      'بني الإسلام على خمس', 'بني الاسلام علي خمس', 'أركان الإسلام',
      // Transliterated
      'buniya al-islam', 'arkan al-islam',
    ],
    ref: [{ collectionSlug: 'bukhari', hadithNumber: '8' }],
  },
  {
    names: [
      // Arabic
      'اتق الله حيثما كنت', 'اتبع السيئة الحسنة', 'خالق الناس بخلق حسن',
      // Transliterated
      'ittaq allah', 'taqwa hadith',
    ],
    ref: [{ collectionSlug: 'tirmidhi', hadithNumber: '1987' }],
  },
  {
    names: [
      // Arabic
      'لا ضرر ولا ضرار', 'حديث الضرر',
      // Transliterated
      'la darar wa la dirar', 'la darar', 'hadith darar',
    ],
    ref: [{ collectionSlug: 'ibnmajah', hadithNumber: '2341' }],
  },
];

// ============================================================================
// All 114 Surahs Dictionary
// ============================================================================

export const SURAHS: FamousSource<SurahReference>[] = [
  {
    names: [
      'الفاتحة', 'سورة الفاتحة', 'فاتحه',
      'فاتحة الكتاب', 'ام الكتاب', 'السبع المثاني', 'سورة الحمد',
      'al-fatiha', 'al fatiha', 'fatiha', 'alfatiha', 'fatihah', 'fateha', 'al-fatihah',
    ],
    ref: { surahNumber: 1, quranComUrl: 'https://quran.com/1', totalAyahs: 7 },
  },
  {
    names: [
      'البقرة', 'سورة البقرة', 'بقره',
      'al-baqarah', 'al baqarah', 'baqarah', 'baqara', 'albaqarah', 'baqra',
    ],
    ref: { surahNumber: 2, quranComUrl: 'https://quran.com/2', totalAyahs: 286 },
  },
  {
    names: [
      'آل عمران', 'سورة آل عمران', 'ال عمران',
      'ali imran', 'al imran', 'aal imran', 'ali-imran', 'imran',
    ],
    ref: { surahNumber: 3, quranComUrl: 'https://quran.com/3', totalAyahs: 200 },
  },
  {
    names: [
      'النساء', 'سورة النساء', 'نساء',
      'an-nisa', 'al-nisa', 'an nisa', 'al nisa', 'nisa', 'nisaa',
    ],
    ref: { surahNumber: 4, quranComUrl: 'https://quran.com/4', totalAyahs: 176 },
  },
  {
    names: [
      'المائدة', 'سورة المائدة', 'مائده',
      'al-maidah', 'al maidah', 'maidah', 'maida', 'maaida',
    ],
    ref: { surahNumber: 5, quranComUrl: 'https://quran.com/5', totalAyahs: 120 },
  },
  {
    names: [
      'الأنعام', 'سورة الأنعام', 'انعام', 'الانعام',
      'al-anam', 'al anam', 'anam', 'anaam',
    ],
    ref: { surahNumber: 6, quranComUrl: 'https://quran.com/6', totalAyahs: 165 },
  },
  {
    names: [
      'الأعراف', 'سورة الأعراف', 'اعراف', 'الاعراف',
      'al-araf', 'al araf', 'araf', 'araaf',
    ],
    ref: { surahNumber: 7, quranComUrl: 'https://quran.com/7', totalAyahs: 206 },
  },
  {
    names: [
      'الأنفال', 'سورة الأنفال', 'انفال', 'الانفال',
      'al-anfal', 'al anfal', 'anfal',
    ],
    ref: { surahNumber: 8, quranComUrl: 'https://quran.com/8', totalAyahs: 75 },
  },
  {
    names: [
      'التوبة', 'سورة التوبة', 'توبه', 'براءة',
      'at-tawbah', 'al-tawbah', 'tawbah', 'tawba', 'taubah',
    ],
    ref: { surahNumber: 9, quranComUrl: 'https://quran.com/9', totalAyahs: 129 },
  },
  {
    names: [
      'يونس', 'سورة يونس',
      'yunus', 'younus', 'jonah',
    ],
    ref: { surahNumber: 10, quranComUrl: 'https://quran.com/10', totalAyahs: 109 },
  },
  {
    names: [
      'هود', 'سورة هود',
      'hud', 'hood',
    ],
    ref: { surahNumber: 11, quranComUrl: 'https://quran.com/11', totalAyahs: 123 },
  },
  {
    names: [
      'يوسف', 'سورة يوسف',
      'yusuf', 'yousuf', 'joseph',
    ],
    ref: { surahNumber: 12, quranComUrl: 'https://quran.com/12', totalAyahs: 111 },
  },
  {
    names: [
      'الرعد', 'سورة الرعد', 'رعد',
      'ar-rad', 'al-rad', 'ar rad', 'rad', 'raad',
    ],
    ref: { surahNumber: 13, quranComUrl: 'https://quran.com/13', totalAyahs: 43 },
  },
  {
    names: [
      'إبراهيم', 'سورة إبراهيم', 'ابراهيم',
      'ibrahim', 'ibraheem', 'abraham',
    ],
    ref: { surahNumber: 14, quranComUrl: 'https://quran.com/14', totalAyahs: 52 },
  },
  {
    names: [
      'الحجر', 'سورة الحجر', 'حجر',
      'al-hijr', 'al hijr', 'hijr',
    ],
    ref: { surahNumber: 15, quranComUrl: 'https://quran.com/15', totalAyahs: 99 },
  },
  {
    names: [
      'النحل', 'سورة النحل', 'نحل',
      'an-nahl', 'al-nahl', 'an nahl', 'nahl',
    ],
    ref: { surahNumber: 16, quranComUrl: 'https://quran.com/16', totalAyahs: 128 },
  },
  {
    names: [
      'الإسراء', 'سورة الإسراء', 'اسراء', 'الاسراء', 'بني إسرائيل',
      'al-isra', 'al isra', 'isra', 'israa', 'bani israel',
    ],
    ref: { surahNumber: 17, quranComUrl: 'https://quran.com/17', totalAyahs: 111 },
  },
  {
    names: [
      'الكهف', 'سورة الكهف', 'كهف',
      'al-kahf', 'al kahf', 'kahf',
    ],
    ref: { surahNumber: 18, quranComUrl: 'https://quran.com/18', totalAyahs: 110 },
  },
  {
    names: [
      'مريم', 'سورة مريم',
      'maryam', 'mariam', 'mary',
    ],
    ref: { surahNumber: 19, quranComUrl: 'https://quran.com/19', totalAyahs: 98 },
  },
  {
    names: [
      'طه', 'سورة طه',
      'taha', 'ta-ha', 'ta ha',
    ],
    ref: { surahNumber: 20, quranComUrl: 'https://quran.com/20', totalAyahs: 135 },
  },
  {
    names: [
      'الأنبياء', 'سورة الأنبياء', 'انبياء', 'الانبياء',
      'al-anbiya', 'al anbiya', 'anbiya', 'anbiyaa',
    ],
    ref: { surahNumber: 21, quranComUrl: 'https://quran.com/21', totalAyahs: 112 },
  },
  {
    names: [
      'الحج', 'سورة الحج', 'حج',
      'al-hajj', 'al hajj', 'hajj',
    ],
    ref: { surahNumber: 22, quranComUrl: 'https://quran.com/22', totalAyahs: 78 },
  },
  {
    names: [
      'المؤمنون', 'سورة المؤمنون', 'مؤمنون', 'المومنون',
      'al-muminun', 'al muminun', 'muminun', 'muminoon',
    ],
    ref: { surahNumber: 23, quranComUrl: 'https://quran.com/23', totalAyahs: 118 },
  },
  {
    names: [
      'النور', 'سورة النور', 'نور',
      'an-nur', 'al-nur', 'an nur', 'nur', 'noor',
    ],
    ref: { surahNumber: 24, quranComUrl: 'https://quran.com/24', totalAyahs: 64 },
  },
  {
    names: [
      'الفرقان', 'سورة الفرقان', 'فرقان',
      'al-furqan', 'al furqan', 'furqan',
    ],
    ref: { surahNumber: 25, quranComUrl: 'https://quran.com/25', totalAyahs: 77 },
  },
  {
    names: [
      'الشعراء', 'سورة الشعراء', 'شعراء',
      'ash-shuara', 'al-shuara', 'ash shuara', 'shuara', 'shuaraa',
    ],
    ref: { surahNumber: 26, quranComUrl: 'https://quran.com/26', totalAyahs: 227 },
  },
  {
    names: [
      'النمل', 'سورة النمل', 'نمل',
      'an-naml', 'al-naml', 'an naml', 'naml',
    ],
    ref: { surahNumber: 27, quranComUrl: 'https://quran.com/27', totalAyahs: 93 },
  },
  {
    names: [
      'القصص', 'سورة القصص', 'قصص',
      'al-qasas', 'al qasas', 'qasas',
    ],
    ref: { surahNumber: 28, quranComUrl: 'https://quran.com/28', totalAyahs: 88 },
  },
  {
    names: [
      'العنكبوت', 'سورة العنكبوت', 'عنكبوت',
      'al-ankabut', 'al ankabut', 'ankabut', 'ankaboot',
    ],
    ref: { surahNumber: 29, quranComUrl: 'https://quran.com/29', totalAyahs: 69 },
  },
  {
    names: [
      'الروم', 'سورة الروم', 'روم',
      'ar-rum', 'al-rum', 'ar rum', 'rum', 'room',
    ],
    ref: { surahNumber: 30, quranComUrl: 'https://quran.com/30', totalAyahs: 60 },
  },
  {
    names: [
      'لقمان', 'سورة لقمان',
      'luqman', 'lukman',
    ],
    ref: { surahNumber: 31, quranComUrl: 'https://quran.com/31', totalAyahs: 34 },
  },
  {
    names: [
      'السجدة', 'سورة السجدة', 'سجده',
      'as-sajdah', 'al-sajdah', 'as sajdah', 'sajdah', 'sajda',
    ],
    ref: { surahNumber: 32, quranComUrl: 'https://quran.com/32', totalAyahs: 30 },
  },
  {
    names: [
      'الأحزاب', 'سورة الأحزاب', 'احزاب', 'الاحزاب',
      'al-ahzab', 'al ahzab', 'ahzab',
      'the combined forces',
    ],
    ref: { surahNumber: 33, quranComUrl: 'https://quran.com/33', totalAyahs: 73 },
  },
  {
    names: [
      'سبأ', 'سورة سبأ', 'سبا',
      'saba', 'sabaa',
    ],
    ref: { surahNumber: 34, quranComUrl: 'https://quran.com/34', totalAyahs: 54 },
  },
  {
    names: [
      'فاطر', 'سورة فاطر',
      'fatir', 'faatir',
    ],
    ref: { surahNumber: 35, quranComUrl: 'https://quran.com/35', totalAyahs: 45 },
  },
  {
    names: [
      'يس', 'سورة يس', 'يٰسٓ', 'قلب القرآن',
      'yasin', 'ya-sin', 'ya sin', 'yaseen',
    ],
    ref: { surahNumber: 36, quranComUrl: 'https://quran.com/36', totalAyahs: 83 },
  },
  {
    names: [
      'الصافات', 'سورة الصافات', 'صافات',
      'as-saffat', 'al-saffat', 'as saffat', 'saffat',
    ],
    ref: { surahNumber: 37, quranComUrl: 'https://quran.com/37', totalAyahs: 182 },
  },
  {
    names: [
      'ص', 'سورة ص', 'صاد',
      'sad', 'saad',
    ],
    ref: { surahNumber: 38, quranComUrl: 'https://quran.com/38', totalAyahs: 88 },
  },
  {
    names: [
      'الزمر', 'سورة الزمر', 'زمر',
      'az-zumar', 'al-zumar', 'az zumar', 'zumar',
    ],
    ref: { surahNumber: 39, quranComUrl: 'https://quran.com/39', totalAyahs: 75 },
  },
  {
    names: [
      'غافر', 'سورة غافر', 'المؤمن',
      'ghafir', 'al-mumin', 'mumin',
    ],
    ref: { surahNumber: 40, quranComUrl: 'https://quran.com/40', totalAyahs: 85 },
  },
  {
    names: [
      'فصلت', 'سورة فصلت',
      'fussilat', 'fussilaat', 'ha mim sajdah',
    ],
    ref: { surahNumber: 41, quranComUrl: 'https://quran.com/41', totalAyahs: 54 },
  },
  {
    names: [
      'الشورى', 'سورة الشورى', 'شورى',
      'ash-shura', 'al-shura', 'ash shura', 'shura', 'shuraa',
    ],
    ref: { surahNumber: 42, quranComUrl: 'https://quran.com/42', totalAyahs: 53 },
  },
  {
    names: [
      'الزخرف', 'سورة الزخرف', 'زخرف',
      'az-zukhruf', 'al-zukhruf', 'az zukhruf', 'zukhruf',
    ],
    ref: { surahNumber: 43, quranComUrl: 'https://quran.com/43', totalAyahs: 89 },
  },
  {
    names: [
      'الدخان', 'سورة الدخان', 'دخان',
      'ad-dukhan', 'al-dukhan', 'ad dukhan', 'dukhan',
    ],
    ref: { surahNumber: 44, quranComUrl: 'https://quran.com/44', totalAyahs: 59 },
  },
  {
    names: [
      'الجاثية', 'سورة الجاثية', 'جاثيه',
      'al-jathiyah', 'al jathiyah', 'jathiyah', 'jathiya',
    ],
    ref: { surahNumber: 45, quranComUrl: 'https://quran.com/45', totalAyahs: 37 },
  },
  {
    names: [
      'الأحقاف', 'سورة الأحقاف', 'احقاف', 'الاحقاف',
      'al-ahqaf', 'al ahqaf', 'ahqaf',
    ],
    ref: { surahNumber: 46, quranComUrl: 'https://quran.com/46', totalAyahs: 35 },
  },
  {
    names: [
      'محمد', 'سورة محمد',
      'muhammad', 'mohammed', 'mohammad',
    ],
    ref: { surahNumber: 47, quranComUrl: 'https://quran.com/47', totalAyahs: 38 },
  },
  {
    names: [
      'الفتح', 'سورة الفتح', 'فتح',
      'al-fath', 'al fath', 'fath',
    ],
    ref: { surahNumber: 48, quranComUrl: 'https://quran.com/48', totalAyahs: 29 },
  },
  {
    names: [
      'الحجرات', 'سورة الحجرات', 'حجرات',
      'al-hujurat', 'al hujurat', 'hujurat', 'hujuraat',
    ],
    ref: { surahNumber: 49, quranComUrl: 'https://quran.com/49', totalAyahs: 18 },
  },
  {
    names: [
      'ق', 'سورة ق', 'قاف',
      'qaf', 'qaaf',
    ],
    ref: { surahNumber: 50, quranComUrl: 'https://quran.com/50', totalAyahs: 45 },
  },
  {
    names: [
      'الذاريات', 'سورة الذاريات', 'ذاريات',
      'adh-dhariyat', 'al-dhariyat', 'adh dhariyat', 'dhariyat',
    ],
    ref: { surahNumber: 51, quranComUrl: 'https://quran.com/51', totalAyahs: 60 },
  },
  {
    names: [
      'الطور', 'سورة الطور', 'طور',
      'at-tur', 'al-tur', 'at tur', 'tur', 'toor',
    ],
    ref: { surahNumber: 52, quranComUrl: 'https://quran.com/52', totalAyahs: 49 },
  },
  {
    names: [
      'النجم', 'سورة النجم', 'نجم',
      'an-najm', 'al-najm', 'an najm', 'najm',
    ],
    ref: { surahNumber: 53, quranComUrl: 'https://quran.com/53', totalAyahs: 62 },
  },
  {
    names: [
      'القمر', 'سورة القمر', 'قمر',
      'al-qamar', 'al qamar', 'qamar',
    ],
    ref: { surahNumber: 54, quranComUrl: 'https://quran.com/54', totalAyahs: 55 },
  },
  {
    names: [
      'الرحمن', 'سورة الرحمن', 'رحمن',
      'ar-rahman', 'al-rahman', 'ar rahman', 'rahman',
    ],
    ref: { surahNumber: 55, quranComUrl: 'https://quran.com/55', totalAyahs: 78 },
  },
  {
    names: [
      'الواقعة', 'سورة الواقعة', 'واقعه',
      'al-waqiah', 'al waqiah', 'waqiah', 'waqia', 'waaqi\'a',
    ],
    ref: { surahNumber: 56, quranComUrl: 'https://quran.com/56', totalAyahs: 96 },
  },
  {
    names: [
      'الحديد', 'سورة الحديد', 'حديد',
      'al-hadid', 'al hadid', 'hadid', 'hadeed',
    ],
    ref: { surahNumber: 57, quranComUrl: 'https://quran.com/57', totalAyahs: 29 },
  },
  {
    names: [
      'المجادلة', 'سورة المجادلة', 'مجادله',
      'al-mujadila', 'al mujadila', 'mujadila', 'mujadilah',
    ],
    ref: { surahNumber: 58, quranComUrl: 'https://quran.com/58', totalAyahs: 22 },
  },
  {
    names: [
      'الحشر', 'سورة الحشر', 'حشر',
      'al-hashr', 'al hashr', 'hashr',
    ],
    ref: { surahNumber: 59, quranComUrl: 'https://quran.com/59', totalAyahs: 24 },
  },
  {
    names: [
      'الممتحنة', 'سورة الممتحنة', 'ممتحنه',
      'al-mumtahanah', 'al mumtahanah', 'mumtahanah', 'mumtahina',
    ],
    ref: { surahNumber: 60, quranComUrl: 'https://quran.com/60', totalAyahs: 13 },
  },
  {
    names: [
      'الصف', 'سورة الصف', 'صف',
      'as-saf', 'al-saf', 'as saf', 'saf', 'saff',
    ],
    ref: { surahNumber: 61, quranComUrl: 'https://quran.com/61', totalAyahs: 14 },
  },
  {
    names: [
      'الجمعة', 'سورة الجمعة', 'جمعه',
      'al-jumuah', 'al jumuah', 'jumuah', 'juma', 'jumua',
    ],
    ref: { surahNumber: 62, quranComUrl: 'https://quran.com/62', totalAyahs: 11 },
  },
  {
    names: [
      'المنافقون', 'سورة المنافقون', 'منافقون',
      'al-munafiqun', 'al munafiqun', 'munafiqun', 'munafiqoon',
    ],
    ref: { surahNumber: 63, quranComUrl: 'https://quran.com/63', totalAyahs: 11 },
  },
  {
    names: [
      'التغابن', 'سورة التغابن', 'تغابن',
      'at-taghabun', 'al-taghabun', 'at taghabun', 'taghabun',
    ],
    ref: { surahNumber: 64, quranComUrl: 'https://quran.com/64', totalAyahs: 18 },
  },
  {
    names: [
      'الطلاق', 'سورة الطلاق', 'طلاق',
      'at-talaq', 'al-talaq', 'at talaq', 'talaq', 'talaaq',
    ],
    ref: { surahNumber: 65, quranComUrl: 'https://quran.com/65', totalAyahs: 12 },
  },
  {
    names: [
      'التحريم', 'سورة التحريم', 'تحريم',
      'at-tahrim', 'al-tahrim', 'at tahrim', 'tahrim', 'tahreem',
    ],
    ref: { surahNumber: 66, quranComUrl: 'https://quran.com/66', totalAyahs: 12 },
  },
  {
    names: [
      'الملك', 'سورة الملك', 'ملك', 'تبارك', 'المانعة', 'المنجية',
      'al-mulk', 'al mulk', 'mulk', 'tabarak',
    ],
    ref: { surahNumber: 67, quranComUrl: 'https://quran.com/67', totalAyahs: 30 },
  },
  {
    names: [
      'القلم', 'سورة القلم', 'قلم', 'نون',
      'al-qalam', 'al qalam', 'qalam', 'nun',
    ],
    ref: { surahNumber: 68, quranComUrl: 'https://quran.com/68', totalAyahs: 52 },
  },
  {
    names: [
      'الحاقة', 'سورة الحاقة', 'حاقه',
      'al-haqqah', 'al haqqah', 'haqqah', 'haaqqah',
    ],
    ref: { surahNumber: 69, quranComUrl: 'https://quran.com/69', totalAyahs: 52 },
  },
  {
    names: [
      'المعارج', 'سورة المعارج', 'معارج',
      'al-maarij', 'al maarij', 'maarij', 'maarej',
    ],
    ref: { surahNumber: 70, quranComUrl: 'https://quran.com/70', totalAyahs: 44 },
  },
  {
    names: [
      'نوح', 'سورة نوح',
      'nuh', 'nooh', 'noah',
    ],
    ref: { surahNumber: 71, quranComUrl: 'https://quran.com/71', totalAyahs: 28 },
  },
  {
    names: [
      'الجن', 'سورة الجن', 'جن',
      'al-jinn', 'al jinn', 'jinn', 'djinn',
    ],
    ref: { surahNumber: 72, quranComUrl: 'https://quran.com/72', totalAyahs: 28 },
  },
  {
    names: [
      'المزمل', 'سورة المزمل', 'مزمل',
      'al-muzzammil', 'al muzzammil', 'muzzammil', 'muzammil',
    ],
    ref: { surahNumber: 73, quranComUrl: 'https://quran.com/73', totalAyahs: 20 },
  },
  {
    names: [
      'المدثر', 'سورة المدثر', 'مدثر',
      'al-muddaththir', 'al muddaththir', 'muddaththir', 'mudaththir',
    ],
    ref: { surahNumber: 74, quranComUrl: 'https://quran.com/74', totalAyahs: 56 },
  },
  {
    names: [
      'القيامة', 'سورة القيامة', 'قيامه',
      'al-qiyamah', 'al qiyamah', 'qiyamah', 'qiyama',
    ],
    ref: { surahNumber: 75, quranComUrl: 'https://quran.com/75', totalAyahs: 40 },
  },
  {
    names: [
      'الإنسان', 'سورة الإنسان', 'انسان', 'الانسان', 'الدهر',
      'al-insan', 'al insan', 'insan', 'ad-dahr', 'dahr',
    ],
    ref: { surahNumber: 76, quranComUrl: 'https://quran.com/76', totalAyahs: 31 },
  },
  {
    names: [
      'المرسلات', 'سورة المرسلات', 'مرسلات',
      'al-mursalat', 'al mursalat', 'mursalat',
    ],
    ref: { surahNumber: 77, quranComUrl: 'https://quran.com/77', totalAyahs: 50 },
  },
  {
    names: [
      'النبأ', 'سورة النبأ', 'نبا', 'عم',
      'an-naba', 'al-naba', 'an naba', 'naba', 'amma',
    ],
    ref: { surahNumber: 78, quranComUrl: 'https://quran.com/78', totalAyahs: 40 },
  },
  {
    names: [
      'النازعات', 'سورة النازعات', 'نازعات',
      'an-naziat', 'al-naziat', 'an naziat', 'naziat', 'naziaat',
    ],
    ref: { surahNumber: 79, quranComUrl: 'https://quran.com/79', totalAyahs: 46 },
  },
  {
    names: [
      'عبس', 'سورة عبس',
      'abasa', 'abas',
    ],
    ref: { surahNumber: 80, quranComUrl: 'https://quran.com/80', totalAyahs: 42 },
  },
  {
    names: [
      'التكوير', 'سورة التكوير', 'تكوير',
      'at-takwir', 'al-takwir', 'at takwir', 'takwir', 'takweer',
    ],
    ref: { surahNumber: 81, quranComUrl: 'https://quran.com/81', totalAyahs: 29 },
  },
  {
    names: [
      'الانفطار', 'سورة الانفطار', 'انفطار',
      'al-infitar', 'al infitar', 'infitar', 'infitaar',
    ],
    ref: { surahNumber: 82, quranComUrl: 'https://quran.com/82', totalAyahs: 19 },
  },
  {
    names: [
      'المطففين', 'سورة المطففين', 'مطففين',
      'al-mutaffifin', 'al mutaffifin', 'mutaffifin', 'mutaffifeen',
    ],
    ref: { surahNumber: 83, quranComUrl: 'https://quran.com/83', totalAyahs: 36 },
  },
  {
    names: [
      'الانشقاق', 'سورة الانشقاق', 'انشقاق',
      'al-inshiqaq', 'al inshiqaq', 'inshiqaq', 'inshiqaaq',
    ],
    ref: { surahNumber: 84, quranComUrl: 'https://quran.com/84', totalAyahs: 25 },
  },
  {
    names: [
      'البروج', 'سورة البروج', 'بروج',
      'al-buruj', 'al buruj', 'buruj', 'burooj',
    ],
    ref: { surahNumber: 85, quranComUrl: 'https://quran.com/85', totalAyahs: 22 },
  },
  {
    names: [
      'الطارق', 'سورة الطارق', 'طارق',
      'at-tariq', 'al-tariq', 'at tariq', 'tariq', 'taariq',
    ],
    ref: { surahNumber: 86, quranComUrl: 'https://quran.com/86', totalAyahs: 17 },
  },
  {
    names: [
      'الأعلى', 'سورة الأعلى', 'اعلى', 'الاعلى',
      'al-ala', 'al ala', 'ala', 'alaa',
    ],
    ref: { surahNumber: 87, quranComUrl: 'https://quran.com/87', totalAyahs: 19 },
  },
  {
    names: [
      'الغاشية', 'سورة الغاشية', 'غاشيه',
      'al-ghashiyah', 'al ghashiyah', 'ghashiyah', 'ghashiya',
    ],
    ref: { surahNumber: 88, quranComUrl: 'https://quran.com/88', totalAyahs: 26 },
  },
  {
    names: [
      'الفجر', 'سورة الفجر', 'فجر',
      'al-fajr', 'al fajr', 'fajr',
    ],
    ref: { surahNumber: 89, quranComUrl: 'https://quran.com/89', totalAyahs: 30 },
  },
  {
    names: [
      'البلد', 'سورة البلد', 'بلد',
      'al-balad', 'al balad', 'balad',
    ],
    ref: { surahNumber: 90, quranComUrl: 'https://quran.com/90', totalAyahs: 20 },
  },
  {
    names: [
      'الشمس', 'سورة الشمس', 'شمس',
      'ash-shams', 'al-shams', 'ash shams', 'shams',
    ],
    ref: { surahNumber: 91, quranComUrl: 'https://quran.com/91', totalAyahs: 15 },
  },
  {
    names: [
      'الليل', 'سورة الليل', 'ليل',
      'al-layl', 'al layl', 'layl', 'lail',
    ],
    ref: { surahNumber: 92, quranComUrl: 'https://quran.com/92', totalAyahs: 21 },
  },
  {
    names: [
      'الضحى', 'سورة الضحى', 'ضحى',
      'ad-dhuha', 'al-dhuha', 'ad dhuha', 'dhuha', 'duha',
    ],
    ref: { surahNumber: 93, quranComUrl: 'https://quran.com/93', totalAyahs: 11 },
  },
  {
    names: [
      'الشرح', 'سورة الشرح', 'شرح', 'الانشراح', 'ألم نشرح',
      'ash-sharh', 'al-sharh', 'ash sharh', 'sharh', 'al-inshirah', 'inshirah',
    ],
    ref: { surahNumber: 94, quranComUrl: 'https://quran.com/94', totalAyahs: 8 },
  },
  {
    names: [
      'التين', 'سورة التين', 'تين',
      'at-tin', 'al-tin', 'at tin', 'tin', 'teen',
    ],
    ref: { surahNumber: 95, quranComUrl: 'https://quran.com/95', totalAyahs: 8 },
  },
  {
    names: [
      'العلق', 'سورة العلق', 'علق', 'اقرأ',
      'al-alaq', 'al alaq', 'alaq', 'iqra',
    ],
    ref: { surahNumber: 96, quranComUrl: 'https://quran.com/96', totalAyahs: 19 },
  },
  {
    names: [
      'القدر', 'سورة القدر', 'قدر', 'ليلة القدر',
      'al-qadr', 'al qadr', 'qadr', 'laylat al-qadr',
    ],
    ref: { surahNumber: 97, quranComUrl: 'https://quran.com/97', totalAyahs: 5 },
  },
  {
    names: [
      'البينة', 'سورة البينة', 'بينه',
      'al-bayyinah', 'al bayyinah', 'bayyinah', 'bayyina',
    ],
    ref: { surahNumber: 98, quranComUrl: 'https://quran.com/98', totalAyahs: 8 },
  },
  {
    names: [
      'الزلزلة', 'سورة الزلزلة', 'زلزله',
      'az-zalzalah', 'al-zalzalah', 'az zalzalah', 'zalzalah', 'zalzala',
    ],
    ref: { surahNumber: 99, quranComUrl: 'https://quran.com/99', totalAyahs: 8 },
  },
  {
    names: [
      'العاديات', 'سورة العاديات', 'عاديات',
      'al-adiyat', 'al adiyat', 'adiyat', 'aadiyat',
    ],
    ref: { surahNumber: 100, quranComUrl: 'https://quran.com/100', totalAyahs: 11 },
  },
  {
    names: [
      'القارعة', 'سورة القارعة', 'قارعه',
      'al-qariah', 'al qariah', 'qariah', 'qaaria',
    ],
    ref: { surahNumber: 101, quranComUrl: 'https://quran.com/101', totalAyahs: 11 },
  },
  {
    names: [
      'التكاثر', 'سورة التكاثر', 'تكاثر',
      'at-takathur', 'al-takathur', 'at takathur', 'takathur', 'takaathur',
    ],
    ref: { surahNumber: 102, quranComUrl: 'https://quran.com/102', totalAyahs: 8 },
  },
  {
    names: [
      'العصر', 'سورة العصر', 'عصر',
      'al-asr', 'al asr', 'asr',
    ],
    ref: { surahNumber: 103, quranComUrl: 'https://quran.com/103', totalAyahs: 3 },
  },
  {
    names: [
      'الهمزة', 'سورة الهمزة', 'همزه',
      'al-humazah', 'al humazah', 'humazah', 'humaza',
    ],
    ref: { surahNumber: 104, quranComUrl: 'https://quran.com/104', totalAyahs: 9 },
  },
  {
    names: [
      'الفيل', 'سورة الفيل', 'فيل',
      'al-fil', 'al fil', 'fil', 'feel',
    ],
    ref: { surahNumber: 105, quranComUrl: 'https://quran.com/105', totalAyahs: 5 },
  },
  {
    names: [
      'قريش', 'سورة قريش',
      'quraysh', 'quraish', 'quresh',
    ],
    ref: { surahNumber: 106, quranComUrl: 'https://quran.com/106', totalAyahs: 4 },
  },
  {
    names: [
      'الماعون', 'سورة الماعون', 'ماعون',
      'al-maun', 'al maun', 'maun', 'maaoon',
    ],
    ref: { surahNumber: 107, quranComUrl: 'https://quran.com/107', totalAyahs: 7 },
  },
  {
    names: [
      'الكوثر', 'سورة الكوثر', 'كوثر',
      'al-kawthar', 'al kawthar', 'kawthar', 'kauthar', 'kausar',
    ],
    ref: { surahNumber: 108, quranComUrl: 'https://quran.com/108', totalAyahs: 3 },
  },
  {
    names: [
      'الكافرون', 'سورة الكافرون', 'كافرون', 'قل يا أيها الكافرون',
      'al-kafirun', 'al kafirun', 'kafirun', 'kafiroon', 'kaafiroon',
    ],
    ref: { surahNumber: 109, quranComUrl: 'https://quran.com/109', totalAyahs: 6 },
  },
  {
    names: [
      'النصر', 'سورة النصر', 'نصر',
      'an-nasr', 'al-nasr', 'an nasr', 'nasr',
    ],
    ref: { surahNumber: 110, quranComUrl: 'https://quran.com/110', totalAyahs: 3 },
  },
  {
    names: [
      'المسد', 'سورة المسد', 'مسد', 'اللهب', 'تبت', 'أبو لهب',
      'al-masad', 'al masad', 'masad', 'al-lahab', 'lahab', 'tabbat',
    ],
    ref: { surahNumber: 111, quranComUrl: 'https://quran.com/111', totalAyahs: 5 },
  },
  {
    names: [
      'الإخلاص', 'سورة الإخلاص', 'اخلاص', 'الاخلاص', 'قل هو الله أحد', 'قل هو الله احد', 'التوحيد',
      'al-ikhlas', 'al ikhlas', 'ikhlas', 'ikhlaas',
    ],
    ref: { surahNumber: 112, quranComUrl: 'https://quran.com/112', totalAyahs: 4 },
  },
  {
    names: [
      'الفلق', 'سورة الفلق', 'فلق', 'قل أعوذ برب الفلق',
      'al-falaq', 'al falaq', 'falaq',
    ],
    ref: { surahNumber: 113, quranComUrl: 'https://quran.com/113', totalAyahs: 5 },
  },
  {
    names: [
      'الناس', 'سورة الناس', 'ناس', 'قل أعوذ برب الناس',
      'an-nas', 'al-nas', 'an nas', 'al nas', 'nas', 'naas',
    ],
    ref: { surahNumber: 114, quranComUrl: 'https://quran.com/114', totalAyahs: 6 },
  },
];

// ============================================================================
// Normalization Functions
// ============================================================================

/**
 * Normalize text for fuzzy matching
 * Removes diacritics, normalizes Arabic letters, and handles separators
 */
function normalize(text: string): string {
  return text.toLowerCase().trim()
    // Remove Arabic diacritics (tashkeel)
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // Normalize alef variants (آأإٱ → ا)
    .replace(/[آأإٱ]/g, 'ا')
    // Normalize teh marbuta (ة → ه)
    .replace(/ة/g, 'ه')
    // Normalize alef maksura (ى → ي)
    .replace(/ى/g, 'ي')
    // Normalize separators
    .replace(/[-_']/g, ' ')
    // Collapse whitespace
    .replace(/\s+/g, ' ');
}

/**
 * Levenshtein distance for fuzzy matching
 */
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// Fuzzy match threshold (0-1, lower = stricter)
const FUZZY_THRESHOLD = 0.3;

// ============================================================================
// Lookup Functions
// ============================================================================

/**
 * Look up a famous Quran verse by name (fuzzy + cross-language)
 * Returns the verse reference if found, undefined otherwise
 */
export function lookupFamousVerse(query: string): VerseReference | undefined {
  const normalized = normalize(query);

  // Strip common prefixes for better matching
  const stripped = normalized
    .replace(/^(آيه?|ايه?|سوره?|surah|ayat?|ayah|verse|chapter)\s*/i, '');

  for (const source of FAMOUS_VERSES) {
    for (const name of source.names) {
      const normName = normalize(name);

      // Exact match (full query or stripped)
      if (normName === normalized || normName === stripped) {
        return source.ref;
      }

      // Contains match (query contains the name or vice versa)
      if (normalized.includes(normName) || normName.includes(normalized)) {
        // Require minimum length to avoid false positives
        if (normName.length >= 4 && normalized.length >= 4) {
          return source.ref;
        }
      }

      // Fuzzy match (for typos) - only for longer strings
      if (stripped.length >= 5 && normName.length >= 5) {
        const distance = levenshtein(stripped, normName);
        const maxLen = Math.max(stripped.length, normName.length);
        if (distance / maxLen <= FUZZY_THRESHOLD) {
          return source.ref;
        }
      }
    }
  }

  return undefined;
}

/**
 * Look up famous hadiths by name (fuzzy + cross-language)
 * Returns array of hadith references if found, empty array otherwise
 */
export function lookupFamousHadith(query: string): HadithReference[] {
  const normalized = normalize(query);

  // Strip common prefixes
  const stripped = normalized
    .replace(/^(حديث|hadith|hadis)\s*/i, '');

  for (const source of FAMOUS_HADITHS) {
    for (const name of source.names) {
      const normName = normalize(name);

      // Exact match
      if (normName === normalized || normName === stripped) {
        return source.ref;
      }

      // Contains match
      if (normalized.includes(normName) || normName.includes(normalized)) {
        if (normName.length >= 6 && normalized.length >= 6) {
          return source.ref;
        }
      }

      // Fuzzy match
      if (stripped.length >= 6 && normName.length >= 6) {
        const distance = levenshtein(stripped, normName);
        const maxLen = Math.max(stripped.length, normName.length);
        if (distance / maxLen <= FUZZY_THRESHOLD) {
          return source.ref;
        }
      }
    }
  }

  return [];
}

/**
 * Look up a Quran surah by name (fuzzy + cross-language)
 * Returns the surah reference if found, undefined otherwise
 *
 * Uses a three-pass approach to prioritize exact matches:
 * 1. Exact matches (highest priority)
 * 2. Contains matches
 * 3. Fuzzy matches (for typos)
 */
export function lookupSurah(query: string): SurahReference | undefined {
  const normalized = normalize(query);

  // Strip "surah" / "سورة" prefix
  const stripped = normalized
    .replace(/^(سوره?|surah|sura|sourate?)\s*/i, '');

  // Pass 1: Exact matches only
  for (const surah of SURAHS) {
    for (const name of surah.names) {
      const normName = normalize(name);
      if (normName === normalized || normName === stripped) {
        return surah.ref;
      }
    }
  }

  // Pass 2: Word-boundary matches (NOT substring)
  if (stripped.length >= 3) {
    const queryWords = stripped.split(/\s+/);

    for (const surah of SURAHS) {
      for (const name of surah.names) {
        const normName = normalize(name);
        const nameWords = normName.split(/\s+/);

        // Skip very short single-word names (need exact match from Pass 1)
        if (nameWords.length === 1 && normName.length < 4) {
          continue;
        }

        // Single-word name: must match a query word exactly or with high prefix overlap
        if (nameWords.length === 1) {
          for (const qw of queryWords) {
            if (qw === normName) {
              return surah.ref;
            }
            // Prefix match for partial typing (e.g., "fati" -> "fatiha")
            if (qw.length >= 4 && normName.length >= 4) {
              if (qw.startsWith(normName) || normName.startsWith(qw)) {
                const overlap = Math.min(qw.length, normName.length) / Math.max(qw.length, normName.length);
                if (overlap >= 0.6) {
                  return surah.ref;
                }
              }
            }
          }
        }
        // Multi-word name: check for consecutive word match
        else {
          const nameJoined = nameWords.join(' ');
          const queryJoined = queryWords.join(' ');
          const pattern = new RegExp(`(^|\\s)${nameJoined.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\s)`);
          if (pattern.test(queryJoined)) {
            return surah.ref;
          }
        }
      }
    }
  }

  // Pass 3: Fuzzy matches (for typos)
  if (stripped.length >= 4) {
    for (const surah of SURAHS) {
      for (const name of surah.names) {
        const normName = normalize(name);
        if (normName.length >= 4) {
          const distance = levenshtein(stripped, normName);
          if (distance / Math.max(stripped.length, normName.length) <= FUZZY_THRESHOLD) {
            return surah.ref;
          }
        }
      }
    }
  }

  return undefined;
}
