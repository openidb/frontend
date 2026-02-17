export type RerankerType = "gpt-oss-20b" | "gpt-oss-120b" | "gemini-flash" | "jina" | "qwen4b" | "none";

export type EmbeddingModelType = "gemini" | "jina";

export type QueryExpansionModelType = "gpt-oss-120b" | "gemini-flash";

export type PageTranslationModelType = "gemini-flash" | "gpt-oss-120b";

export type DateCalendarType = "hijri" | "gregorian" | "both";

export type TranslationDisplayOption = "none" | "transliteration" | "translation";

export type HadithCollectionGroup = "primary" | "other";

export interface HadithCollectionInfo {
  slug: string;
  nameEnglish: string;
  nameArabic: string;
  group: HadithCollectionGroup;
}

export const HADITH_COLLECTIONS: HadithCollectionInfo[] = [
  // Primary (Kutub al-Sittah)
  { slug: "bukhari", nameEnglish: "Sahih al-Bukhari", nameArabic: "صحيح البخاري", group: "primary" },
  { slug: "muslim", nameEnglish: "Sahih Muslim", nameArabic: "صحيح مسلم", group: "primary" },
  { slug: "abudawud", nameEnglish: "Sunan Abu Dawud", nameArabic: "سنن أبي داود", group: "primary" },
  { slug: "tirmidhi", nameEnglish: "Jami al-Tirmidhi", nameArabic: "جامع الترمذي", group: "primary" },
  { slug: "nasai", nameEnglish: "Sunan al-Nasa'i", nameArabic: "سنن النسائي", group: "primary" },
  { slug: "ibnmajah", nameEnglish: "Sunan Ibn Majah", nameArabic: "سنن ابن ماجه", group: "primary" },
  // Other collections
  { slug: "ahmad", nameEnglish: "Musnad Ahmad", nameArabic: "مسند أحمد", group: "other" },
  { slug: "malik", nameEnglish: "Muwatta Malik", nameArabic: "موطأ مالك", group: "other" },
  { slug: "darimi", nameEnglish: "Sunan al-Darimi", nameArabic: "سنن الدارمي", group: "other" },
  { slug: "mustadrak", nameEnglish: "Al-Mustadrak", nameArabic: "المستدرك", group: "other" },
  { slug: "ibn-hibban", nameEnglish: "Sahih Ibn Hibban", nameArabic: "صحيح ابن حبان", group: "other" },
  { slug: "mujam-kabir", nameEnglish: "Al-Mu'jam al-Kabir", nameArabic: "المعجم الكبير", group: "other" },
  { slug: "sunan-kubra-bayhaqi", nameEnglish: "Sunan al-Kubra (Bayhaqi)", nameArabic: "السنن الكبرى للبيهقي", group: "other" },
  { slug: "sunan-kubra-nasai", nameEnglish: "Sunan al-Kubra (Nasa'i)", nameArabic: "السنن الكبرى للنسائي", group: "other" },
  { slug: "suyuti", nameEnglish: "Al-Jami' al-Saghir (Suyuti)", nameArabic: "الجامع الصغير للسيوطي", group: "other" },
  { slug: "ahmad-zuhd", nameEnglish: "Al-Zuhd (Ahmad)", nameArabic: "الزهد لأحمد", group: "other" },
  { slug: "riyadussalihin", nameEnglish: "Riyad al-Salihin", nameArabic: "رياض الصالحين", group: "other" },
  { slug: "adab", nameEnglish: "Al-Adab al-Mufrad", nameArabic: "الأدب المفرد", group: "other" },
  { slug: "shamail", nameEnglish: "Shama'il Muhammadiyyah", nameArabic: "الشمائل المحمدية", group: "other" },
  { slug: "mishkat", nameEnglish: "Mishkat al-Masabih", nameArabic: "مشكاة المصابيح", group: "other" },
  { slug: "bulugh", nameEnglish: "Bulugh al-Maram", nameArabic: "بلوغ المرام", group: "other" },
  { slug: "nawawi40", nameEnglish: "40 Hadith Nawawi", nameArabic: "الأربعون النووية", group: "other" },
  { slug: "qudsi40", nameEnglish: "40 Hadith Qudsi", nameArabic: "الأحاديث القدسية", group: "other" },
  { slug: "hisn", nameEnglish: "Hisn al-Muslim", nameArabic: "حصن المسلم", group: "other" },
];

// Quran translation options (27 languages, matching app UI languages except Arabic)
export const QURAN_TRANSLATIONS: { code: string; edition: string; name: string; translator: string }[] = [
  { code: "none", edition: "", name: "None", translator: "" },
  { code: "en", edition: "eng-mustafakhattaba", name: "English - Dr. Mustafa Khattab", translator: "Mustafa Khattab" },
  { code: "fr", edition: "fra-muhammadhameedu", name: "French - Muhammad Hamidullah", translator: "Hamidullah" },
  { code: "id", edition: "ind-indonesianislam", name: "Indonesian - Islamic Ministry", translator: "Islamic Ministry" },
  { code: "ur", edition: "urd-fatehmuhammadja", name: "Urdu - Fateh Muhammad Jalandhry", translator: "Jalandhry" },
  { code: "es", edition: "spa-muhammadisagarc", name: "Spanish - Isa Garcia", translator: "Isa Garcia" },
  { code: "zh", edition: "zho-majian", name: "Chinese - Ma Jian", translator: "Ma Jian" },
  { code: "pt", edition: "por-samirelhayek", name: "Portuguese - Samir El-Hayek", translator: "El-Hayek" },
  { code: "ru", edition: "rus-elmirkuliev", name: "Russian - Elmir Kuliev", translator: "Kuliev" },
  { code: "ja", edition: "jpn-ryoichimita", name: "Japanese - Ryoichi Mita", translator: "Ryoichi Mita" },
  { code: "ko", edition: "kor-hamidchoi", name: "Korean - Hamid Choi", translator: "Hamid Choi" },
  { code: "it", edition: "ita-hamzarobertopic", name: "Italian - Hamza Roberto Piccardo", translator: "Piccardo" },
  { code: "bn", edition: "ben-muhiuddinkhan", name: "Bengali - Muhiuddin Khan", translator: "Muhiuddin Khan" },
  { code: "de", edition: "deu-asfbubenheimand", name: "German - Bubenheim & Elyas", translator: "Bubenheim" },
  { code: "fa", edition: "fas-mohammadmahdifo", name: "Persian - Fooladvand", translator: "Fooladvand" },
  { code: "ha", edition: "hau-abubakarmahmood", name: "Hausa - Abubakar Mahmood Jummi", translator: "Mahmood Jummi" },
  { code: "hi", edition: "hin-suhelfarooqkhan", name: "Hindi - Suhel Farooq Khan", translator: "Farooq Khan" },
  { code: "ku", edition: "kur-muhammadsalehba", name: "Kurdish - Muhammad Saleh Bamoki", translator: "Bamoki" },
  { code: "ms", edition: "msa-abdullahmuhamma", name: "Malay - Abdullah Muhammad Basmeih", translator: "Basmeih" },
  { code: "nl", edition: "nld-sofianssiregar", name: "Dutch - Sofian S. Siregar", translator: "Siregar" },
  { code: "pa", edition: "pan-drmuhamadhabibb", name: "Punjabi - Dr. Muhamad Habib", translator: "Dr. Habib" },
  { code: "ps", edition: "qul-118", name: "Pashto - Zakaria Abulsalam", translator: "Abulsalam" },
  { code: "so", edition: "som-mahmudmuhammada", name: "Somali - Mahmud Muhammad Abduh", translator: "M. Abduh" },
  { code: "sw", edition: "swa-alimuhsinalbarw", name: "Swahili - Ali Muhsin Al Barwani", translator: "Al Barwani" },
  { code: "ta", edition: "tam-abdulhameedbaqa", name: "Tamil - Abdulhameed Baqavi", translator: "Baqavi" },
  { code: "tr", edition: "tur-diyanetisleri", name: "Turkish - Diyanet Isleri", translator: "Diyanet" },
  { code: "uz", edition: "uzb-muhammadsodikmu", name: "Uzbek - Muhammad Sodik Muhammad Yusuf", translator: "M. Yusuf" },
  { code: "yo", edition: "yor-shaykhaburahima", name: "Yoruba - Shaykh Abu Rahimah", translator: "Abu Rahimah" },
];


export interface SearchConfig {
  includeQuran: boolean;
  includeHadith: boolean;
  includeBooks: boolean;
  reranker: RerankerType;
  similarityCutoff: number;
  refineSimilarityCutoff: number;
  preRerankLimit: number;
  postRerankLimit: number;
  fuzzyEnabled: boolean;
  dateCalendar: DateCalendarType;
  bookTitleDisplay: TranslationDisplayOption;
  showAuthorTransliteration: boolean;
  showPublicationDates: boolean;
  autoTranslation: boolean;
  quranTranslation: string;
  hadithTranslation: string;
  embeddingModel: EmbeddingModelType;
  queryExpansionModel: QueryExpansionModelType;
  pageTranslationModel: PageTranslationModelType;
  bookContentTranslation: string;
  refineOriginalWeight: number;
  refineExpandedWeight: number;
  refineBookPerQuery: number;
  refineAyahPerQuery: number;
  refineHadithPerQuery: number;
  refineBookRerank: number;
  refineAyahRerank: number;
  refineHadithRerank: number;
  hadithCollections: string[];
}

/** Collections excluded from search by default (still selectable by users) */
const DEFAULT_EXCLUDED_COLLECTIONS = new Set(["mustadrak", "mujam-kabir", "suyuti", "sunan-kubra-bayhaqi"]);

export const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  includeQuran: true,
  includeHadith: true,
  includeBooks: false,
  reranker: "gpt-oss-120b",
  similarityCutoff: 0.6,
  refineSimilarityCutoff: 0.25,
  preRerankLimit: 70,
  postRerankLimit: 10,
  fuzzyEnabled: true,
  dateCalendar: "gregorian",
  bookTitleDisplay: "none",
  showAuthorTransliteration: true,
  showPublicationDates: true,
  autoTranslation: true,
  quranTranslation: "en",
  hadithTranslation: "en",
  embeddingModel: "gemini",
  queryExpansionModel: "gpt-oss-120b",
  pageTranslationModel: "gemini-flash",
  bookContentTranslation: "auto",
  refineOriginalWeight: 1.0,
  refineExpandedWeight: 1.0,
  refineBookPerQuery: 30,
  refineAyahPerQuery: 30,
  refineHadithPerQuery: 30,
  refineBookRerank: 20,
  refineAyahRerank: 12,
  refineHadithRerank: 15,
  hadithCollections: HADITH_COLLECTIONS
    .filter(c => !DEFAULT_EXCLUDED_COLLECTIONS.has(c.slug))
    .map(c => c.slug),
};

// Internal config keys that are NOT user-configurable via the config page.
// These always use the centralized defaults above.
export const INTERNAL_CONFIG_KEYS: (keyof SearchConfig)[] = [
  "similarityCutoff",
  "refineSimilarityCutoff",
  "fuzzyEnabled",
  "preRerankLimit",
  "postRerankLimit",
  "includeBooks",
  "queryExpansionModel",
  "autoTranslation",
  "bookContentTranslation",
  "pageTranslationModel",
  "refineOriginalWeight",
  "refineExpandedWeight",
  "refineBookPerQuery",
  "refineAyahPerQuery",
  "refineHadithPerQuery",
  "refineBookRerank",
  "refineAyahRerank",
  "refineHadithRerank",
];

export const embeddingModelOptions: { value: EmbeddingModelType; labelKey: string; descKey: string }[] = [
  { value: "gemini", labelKey: "gemini", descKey: "geminiDesc" },
  { value: "jina", labelKey: "jina", descKey: "jinaDesc" },
];

export const rerankerOptions: { value: RerankerType; label: string; description: string }[] = [
  { value: "none", label: "None", description: "Fast (default)" },
  { value: "gpt-oss-120b", label: "OpenAI/GPT-OSS 120B", description: "Highest quality, slower" },
  { value: "gemini-flash", label: "Gemini Flash", description: "High quality reasoning" },
  { value: "jina", label: "Jina Reranker", description: "Fast neural reranker" },
];
