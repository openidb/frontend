"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";

// Import translations
import en from "./translations/en.json";
import ar from "./translations/ar.json";
import fr from "./translations/fr.json";
import id from "./translations/id.json";
import ur from "./translations/ur.json";
import es from "./translations/es.json";
import zh from "./translations/zh.json";
import pt from "./translations/pt.json";
import ru from "./translations/ru.json";
import ja from "./translations/ja.json";
import ko from "./translations/ko.json";
import it from "./translations/it.json";
import bn from "./translations/bn.json";
import ha from "./translations/ha.json";
import sw from "./translations/sw.json";
import nl from "./translations/nl.json";
import de from "./translations/de.json";
import tr from "./translations/tr.json";
import fa from "./translations/fa.json";
import hi from "./translations/hi.json";
import ms from "./translations/ms.json";
import pa from "./translations/pa.json";
import ku from "./translations/ku.json";
import ps from "./translations/ps.json";
import so from "./translations/so.json";
import uz from "./translations/uz.json";
import yo from "./translations/yo.json";
import ta from "./translations/ta.json";

// Locale type
export type Locale = "en" | "ar" | "fr" | "id" | "ur" | "es" | "zh" | "pt" | "ru" | "ja" | "ko" | "it" | "bn" | "ha" | "sw" | "nl" | "de" | "tr" | "fa" | "hi" | "ms" | "pa" | "ku" | "ps" | "so" | "uz" | "yo" | "ta";

// RTL locales
export const RTL_LOCALES: Locale[] = ["ar", "ur", "fa", "ps"];

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

// Load all translations
const translations: Record<Locale, TranslationDict> = {
  en,
  ar,
  fr,
  id,
  ur,
  es,
  zh,
  pt,
  ru,
  ja,
  ko,
  it,
  bn,
  ha,
  sw,
  nl,
  de,
  tr,
  fa,
  hi,
  ms,
  pa,
  ku,
  ps,
  so,
  uz,
  yo,
  ta,
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
  const [mounted, setMounted] = useState(false);

  // Load locale from localStorage on mount
  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved && LOCALES.some((l) => l.code === saved)) {
      setLocaleState(saved as Locale);
    } else {
      const match = document.cookie.match(/(?:^|;\s*)detected-locale=([^;]*)/);
      const detected = match?.[1];
      if (detected && LOCALES.some((l) => l.code === detected)) {
        setLocaleState(detected as Locale);
      }
    }
  }, []);

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
  }, []);

  // Translation function with interpolation and fallback
  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    // Try to get translation for current locale
    let value = getNestedValue(translations[locale], key);

    // Fall back to English if not found
    if (value === undefined && locale !== "en") {
      value = getNestedValue(translations.en, key);
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
  }, [locale]);

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
