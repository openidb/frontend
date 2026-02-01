"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { SearchConfig, defaultSearchConfig, TranslationDisplayOption } from "@/components/SearchConfigDropdown";

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
          // Clamp similarityCutoff to valid range (0.15-0.8)
          if (typeof parsed.similarityCutoff === "number") {
            parsed.similarityCutoff = Math.max(0.15, Math.min(0.8, parsed.similarityCutoff));
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
export type { SearchConfig, TranslationDisplayOption };
export { defaultSearchConfig };
