export interface DictionarySource {
  id: number;
  slug: string;
  nameArabic: string;
  nameEnglish: string;
  author: string | null;
  bookId: string | null;
}

export interface Definition {
  id: number;
  source: DictionarySource;
  root: string;
  headword: string;
  definition: string;
  definitionHtml: string | null;
  matchType: "exact" | "root";
  precision: "sub_entry" | "excerpt" | "full";
  bookId: string | null;
  startPage: number | null;
  endPage: number | null;
}

export interface RootResolution {
  root: string;
  confidence: "high" | "medium" | "low";
  tier: "direct" | "stripped" | "stemmed" | "verb_stem" | "pattern" | "stem_pattern";
}

export interface LookupResult {
  word: string;
  wordNormalized: string;
  resolvedRoots?: RootResolution[];
  definitions: Definition[];
  matchStrategy: "exact" | "exact_stripped" | "root_resolved" | "none";
}

export interface DerivedForm {
  word: string;
  vocalized: string | null;
  pattern: string | null;
  wordType: string | null;
  definition: string | null;
  partOfSpeech: string | null;
  source: string | null;
}

export interface RootFamilyData {
  root: string;
  rootNormalized: string;
  derivedForms: DerivedForm[];
  dictionaryEntries: Omit<Definition, "matchType">[];
}
