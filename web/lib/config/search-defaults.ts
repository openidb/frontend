export type RerankerType = "gpt-oss-20b" | "gpt-oss-120b" | "gemini-flash" | "jina" | "qwen4b" | "none";

export type EmbeddingModelType = "gemini" | "jina";

export type QueryExpansionModelType = "gpt-oss-120b" | "gemini-flash";

export type PageTranslationModelType = "gemini-flash" | "gpt-oss-120b";

export type DateCalendarType = "hijri" | "gregorian" | "both";

export type TranslationDisplayOption = "none" | "transliteration" | "translation";

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
}

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
