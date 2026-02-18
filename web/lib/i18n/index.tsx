"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";

// Only import English statically (default/fallback)
import en from "./translations/en.json";

// Locale type
export type Locale = "en" | "ar" | "fr" | "id" | "ur" | "es" | "zh" | "pt" | "ru" | "ja" | "ko" | "it" | "bn" | "ha" | "sw" | "nl" | "de" | "tr" | "fa" | "hi" | "ms" | "pa" | "ku" | "ps" | "so" | "uz" | "yo" | "ta";

// RTL locales
export const RTL_LOCALES: Locale[] = ["ar", "ur", "fa", "ps", "ku"];

// All supported locales with native names
export const LOCALES: { code: Locale; name: string; nativeName: string }[] = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "ar", name: "Arabic", nativeName: "العربية" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia" },
  { code: "ur", name: "Urdu", nativeName: "اردو" },
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "zh", name: "Chinese", nativeName: "中文" },
  { code: "pt", name: "Portuguese", nativeName: "Português" },
  { code: "ru", name: "Russian", nativeName: "Русский" },
  { code: "ja", name: "Japanese", nativeName: "日本語" },
  { code: "ko", name: "Korean", nativeName: "한국어" },
  { code: "it", name: "Italian", nativeName: "Italiano" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা" },
  { code: "ha", name: "Hausa", nativeName: "Hausa" },
  { code: "sw", name: "Swahili", nativeName: "Kiswahili" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands" },
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe" },
  { code: "fa", name: "Persian", nativeName: "فارسی" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "ms", name: "Malay", nativeName: "Bahasa Melayu" },
  { code: "pa", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ" },
  { code: "ku", name: "Kurdish", nativeName: "Kurdî" },
  { code: "ps", name: "Pashto", nativeName: "پښتو" },
  { code: "so", name: "Somali", nativeName: "Soomaali" },
  { code: "uz", name: "Uzbek", nativeName: "Oʻzbekcha" },
  { code: "yo", name: "Yoruba", nativeName: "Yorùbá" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்" },
];

// Translation dictionary type
type TranslationDict = typeof en;

// Dynamic locale loaders — only English is bundled, others loaded on demand
const localeLoaders: Record<Locale, () => Promise<TranslationDict>> = {
  en: () => Promise.resolve(en),
  ar: () => import("./translations/ar.json").then(m => m.default),
  fr: () => import("./translations/fr.json").then(m => m.default),
  id: () => import("./translations/id.json").then(m => m.default),
  ur: () => import("./translations/ur.json").then(m => m.default),
  es: () => import("./translations/es.json").then(m => m.default),
  zh: () => import("./translations/zh.json").then(m => m.default),
  pt: () => import("./translations/pt.json").then(m => m.default),
  ru: () => import("./translations/ru.json").then(m => m.default),
  ja: () => import("./translations/ja.json").then(m => m.default),
  ko: () => import("./translations/ko.json").then(m => m.default),
  it: () => import("./translations/it.json").then(m => m.default),
  bn: () => import("./translations/bn.json").then(m => m.default),
  ha: () => import("./translations/ha.json").then(m => m.default),
  sw: () => import("./translations/sw.json").then(m => m.default),
  nl: () => import("./translations/nl.json").then(m => m.default),
  de: () => import("./translations/de.json").then(m => m.default),
  tr: () => import("./translations/tr.json").then(m => m.default),
  fa: () => import("./translations/fa.json").then(m => m.default),
  hi: () => import("./translations/hi.json").then(m => m.default),
  ms: () => import("./translations/ms.json").then(m => m.default),
  pa: () => import("./translations/pa.json").then(m => m.default),
  ku: () => import("./translations/ku.json").then(m => m.default),
  ps: () => import("./translations/ps.json").then(m => m.default),
  so: () => import("./translations/so.json").then(m => m.default),
  uz: () => import("./translations/uz.json").then(m => m.default),
  yo: () => import("./translations/yo.json").then(m => m.default),
  ta: () => import("./translations/ta.json").then(m => m.default),
};

// LocalStorage key
const LOCALE_STORAGE_KEY = "locale";

// Default locale
const DEFAULT_LOCALE: Locale = "en";

// Context type
interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  dir: "ltr" | "rtl";
}

// Create context
const I18nContext = createContext<I18nContextType | null>(null);

// Helper to get nested value from object by dot-notation path
function getNestedValue(obj: unknown, path: string): string | undefined {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === "string" ? current : undefined;
}

// Provider component
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [loadedTranslations, setLoadedTranslations] = useState<Record<string, TranslationDict>>({ en });
  const [mounted, setMounted] = useState(false);
  const loadingRef = useRef<Set<string>>(new Set());

  // Load translations for a locale
  const loadTranslations = useCallback((loc: Locale) => {
    if (loc === "en" || loadedTranslations[loc] || loadingRef.current.has(loc)) return;
    loadingRef.current.add(loc);
    localeLoaders[loc]().then((dict) => {
      setLoadedTranslations(prev => ({ ...prev, [loc]: dict }));
      loadingRef.current.delete(loc);
    }).catch(() => {
      loadingRef.current.delete(loc);
    });
  }, [loadedTranslations]);

  // Load locale from localStorage on mount
  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved && LOCALES.some((l) => l.code === saved)) {
      setLocaleState(saved as Locale);
      loadTranslations(saved as Locale);
    } else {
      const match = document.cookie.match(/(?:^|;\s*)detected-locale=([^;]*)/);
      const detected = match?.[1];
      if (detected && LOCALES.some((l) => l.code === detected)) {
        setLocaleState(detected as Locale);
        loadTranslations(detected as Locale);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update document direction when locale changes
  useEffect(() => {
    if (!mounted) return;

    const dir = RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
    document.documentElement.dir = dir;
    document.documentElement.lang = locale;
  }, [locale, mounted]);

  // Set locale and persist to localStorage
  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
    loadTranslations(newLocale);
  }, [loadTranslations]);

  // Translation function with interpolation and fallback to English
  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const dict = loadedTranslations[locale];

    // Try current locale (falls back to English if not yet loaded)
    let value = dict ? getNestedValue(dict, key) : undefined;

    // Fall back to English if not found
    if (value === undefined) {
      value = getNestedValue(en, key);
    }

    // Return key if still not found
    if (value === undefined) {
      console.warn(`Missing translation: ${key}`);
      return key;
    }

    // Interpolate params
    if (params) {
      for (const [paramKey, paramValue] of Object.entries(params)) {
        value = value.replace(new RegExp(`\\{${paramKey}\\}`, "g"), String(paramValue));
      }
    }

    return value;
  }, [locale, loadedTranslations]);

  // Direction based on locale
  const dir = RTL_LOCALES.includes(locale) ? "rtl" : "ltr";

  // During SSR or before hydration, use default locale
  const contextValue: I18nContextType = {
    locale: mounted ? locale : DEFAULT_LOCALE,
    setLocale,
    t,
    dir: mounted ? dir : "ltr",
  };

  return (
    <I18nContext.Provider value={contextValue}>
      {children}
    </I18nContext.Provider>
  );
}

// Hook to use i18n
export function useTranslation() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useTranslation must be used within an I18nProvider");
  }

  return context;
}
