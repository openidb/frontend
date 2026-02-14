"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { SearchConfig, defaultSearchConfig, TranslationDisplayOption, DateCalendarType } from "@/components/SearchConfigDropdown";

interface AppConfigContextType {
  config: SearchConfig;
  setConfig: (config: SearchConfig) => void;
  updateConfig: (updates: Partial<SearchConfig>) => void;
  isLoaded: boolean;
}

const AppConfigContext = createContext<AppConfigContextType | null>(null);
const STORAGE_KEY = "searchConfig";

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<SearchConfig>(defaultSearchConfig);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadConfig = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          // Handle backward compatibility: migrate showTransliterations to bookTitleDisplay
          if (parsed.showTransliterations !== undefined && !parsed.bookTitleDisplay) {
            parsed.bookTitleDisplay = parsed.showTransliterations ? "transliteration" : "none";
            delete parsed.showTransliterations;
          }
          // Clean up removed tocDisplay field
          delete parsed.tocDisplay;
          // Clamp similarityCutoff to valid range (0.1-0.8)
          if (typeof parsed.similarityCutoff === "number") {
            parsed.similarityCutoff = Math.max(0.1, Math.min(0.8, parsed.similarityCutoff));
          }
          // Clamp refineSimilarityCutoff to valid range (0.15-0.65)
          if (typeof parsed.refineSimilarityCutoff === "number") {
            parsed.refineSimilarityCutoff = Math.max(0.15, Math.min(0.65, parsed.refineSimilarityCutoff));
          }
          // Clamp refine query weights
          if (typeof parsed.refineOriginalWeight === "number") {
            parsed.refineOriginalWeight = Math.max(0.5, Math.min(1.0, parsed.refineOriginalWeight));
          }
          if (typeof parsed.refineExpandedWeight === "number") {
            parsed.refineExpandedWeight = Math.max(0.3, Math.min(1.0, parsed.refineExpandedWeight));
          }
          // Clamp refine per-query limits
          if (typeof parsed.refineBookPerQuery === "number") {
            parsed.refineBookPerQuery = Math.max(10, Math.min(60, parsed.refineBookPerQuery));
          }
          if (typeof parsed.refineAyahPerQuery === "number") {
            parsed.refineAyahPerQuery = Math.max(10, Math.min(60, parsed.refineAyahPerQuery));
          }
          if (typeof parsed.refineHadithPerQuery === "number") {
            parsed.refineHadithPerQuery = Math.max(10, Math.min(60, parsed.refineHadithPerQuery));
          }
          // Clamp refine reranker limits
          if (typeof parsed.refineBookRerank === "number") {
            parsed.refineBookRerank = Math.max(5, Math.min(40, parsed.refineBookRerank));
          }
          if (typeof parsed.refineAyahRerank === "number") {
            parsed.refineAyahRerank = Math.max(5, Math.min(25, parsed.refineAyahRerank));
          }
          if (typeof parsed.refineHadithRerank === "number") {
            parsed.refineHadithRerank = Math.max(5, Math.min(25, parsed.refineHadithRerank));
          }
          // Validate embedding model (default to gemini if invalid)
          if (parsed.embeddingModel !== "gemini" && parsed.embeddingModel !== "jina") {
            parsed.embeddingModel = "gemini";
          }
          setConfigState({ ...defaultSearchConfig, ...parsed });
        }
      } catch {
        // Invalid JSON, use defaults
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
export { defaultSearchConfig };
