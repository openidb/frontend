"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import {
  type SearchConfig,
  type TranslationDisplayOption,
  type DateCalendarType,
  DEFAULT_SEARCH_CONFIG,
} from "@/lib/config/search-defaults";
import { applyInternalDefaults, syncTranslationsToLocale, migrateStoredConfig } from "@/lib/config/utils";
import { useTranslation } from "@/lib/i18n";

interface AppConfigContextType {
  config: SearchConfig;
  setConfig: (config: SearchConfig) => void;
  updateConfig: (updates: Partial<SearchConfig>) => void;
  isLoaded: boolean;
}

const AppConfigContext = createContext<AppConfigContextType | null>(null);
const STORAGE_KEY = "searchConfig";
const LOCALE_STORAGE_KEY = "locale";

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<SearchConfig>(DEFAULT_SEARCH_CONFIG);
  const [isLoaded, setIsLoaded] = useState(false);
  const { locale } = useTranslation();

  // Sync translations when locale changes AFTER initial load
  useEffect(() => {
    if (!isLoaded) return;
    setConfigState((prev) => {
      const synced = syncTranslationsToLocale(prev, locale);
      if (synced !== prev) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(synced));
      }
      return synced;
    });
  }, [locale, isLoaded]);

  useEffect(() => {
    const loadConfig = () => {
      let loaded = DEFAULT_SEARCH_CONFIG;
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const migrated = migrateStoredConfig(JSON.parse(stored));
          loaded = applyInternalDefaults({ ...DEFAULT_SEARCH_CONFIG, ...migrated } as SearchConfig);
        }
      } catch {
        // Invalid JSON, use defaults
      }

      // Read locale directly from localStorage to avoid race condition
      // (I18nProvider's useEffect hasn't fired yet, so the hook value is still default)
      const currentLocale = localStorage.getItem(LOCALE_STORAGE_KEY) || "en";
      const synced = syncTranslationsToLocale(loaded, currentLocale);
      setConfigState(synced);
      if (synced !== loaded) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(synced));
      }
      setIsLoaded(true);
    };

    loadConfig();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        loadConfig();
      }
    };

    const handleFocus = () => {
      loadConfig();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const setConfig = useCallback((newConfig: SearchConfig) => {
    setConfigState(newConfig);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
  }, []);

  const updateConfig = useCallback((updates: Partial<SearchConfig>) => {
    setConfigState((prev) => {
      const newConfig = { ...prev, ...updates };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
      return newConfig;
    });
  }, []);

  return (
    <AppConfigContext.Provider value={{ config, setConfig, updateConfig, isLoaded }}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig() {
  const context = useContext(AppConfigContext);
  if (!context) {
    throw new Error("useAppConfig must be used within AppConfigProvider");
  }
  return context;
}

// Re-export types for convenience
export type { SearchConfig, TranslationDisplayOption, DateCalendarType };
export { DEFAULT_SEARCH_CONFIG };
