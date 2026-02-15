export type RerankerType = "gpt-oss-20b" | "gpt-oss-120b" | "gemini-flash" | "jina" | "qwen4b" | "none";

export type EmbeddingModelType = "gemini" | "jina";

export type QueryExpansionModelType = "gpt-oss-120b" | "gemini-flash";

export type PageTranslationModelType = "gemini-flash" | "gpt-oss-120b";

export type DateCalendarType = "hijri" | "gregorian" | "both";

export type TranslationDisplayOption = "none" | "transliteration" | "translation";

// Quran translation options (12 languages, matching app UI languages except Arabic)
export const QURAN_TRANSLATIONS: { code: string; edition: string; name: string }[] = [
  { code: "none", edition: "", name: "None" },
  { code: "en", edition: "eng-mustafakhattaba", name: "English - Dr. Mustafa Khattab" },
  { code: "fr", edition: "fra-muhammadhameedu", name: "French - Muhammad Hamidullah" },
  { code: "id", edition: "ind-indonesianislam", name: "Indonesian - Islamic Ministry" },
  { code: "ur", edition: "urd-fatehmuhammadja", name: "Urdu - Fateh Muhammad Jalandhry" },
  { code: "es", edition: "spa-muhammadisagarc", name: "Spanish - Isa Garcia" },
  { code: "zh", edition: "zho-majian", name: "Chinese - Ma Jian" },
  { code: "pt", edition: "por-samirelhayek", name: "Portuguese - Samir El-Hayek" },
  { code: "ru", edition: "rus-elmirkuliev", name: "Russian - Elmir Kuliev" },
  { code: "ja", edition: "jpn-ryoichimita", name: "Japanese - Ryoichi Mita" },
  { code: "ko", edition: "kor-hamidchoi", name: "Korean - Hamid Choi" },
  { code: "it", edition: "ita-hamzarobertopic", name: "Italian - Hamza Roberto Piccardo" },
  { code: "bn", edition: "ben-muhiuddinkhan", name: "Bengali - Muhiuddin Khan" },
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
  hadithTranslation: "none" | "en";
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
