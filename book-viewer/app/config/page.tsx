"use client";

import { useState, useEffect } from "react";
import { HelpCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  defaultSearchConfig,
  rerankerOptions,
  type SearchConfig,
  type RerankerType,
} from "@/components/SearchConfigDropdown";
import { useTranslation, LOCALES, type Locale } from "@/lib/i18n";

const STORAGE_KEY = "searchConfig";

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="relative group">
      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help transition-colors" />
      <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 text-xs bg-neutral-800 text-white rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-48 text-center z-50">
        {text}
      </span>
    </span>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
      {children}
    </h2>
  );
}

function Divider() {
  return <hr className="border-border" />;
}

function SliderSetting({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = (v: number) => v.toString(),
  info,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  info?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-1.5">
          <label className="text-sm">{label}</label>
          {info && <InfoTooltip text={info} />}
        </div>
        <span className="text-sm font-mono text-muted-foreground">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
      />
    </div>
  );
}

function ToggleSetting({
  label,
  checked,
  onChange,
  info,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  info?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <label className="text-sm">{label}</label>
        {info && <InfoTooltip text={info} />}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        dir="ltr"
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
          checked ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

function SelectSetting({
  label,
  info,
  children,
}: {
  label: string;
  info?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <label className="text-sm">{label}</label>
        {info && <InfoTooltip text={info} />}
      </div>
      {children}
    </div>
  );
}

export default function ConfigPage() {
  const { t, locale, setLocale } = useTranslation();
  const [config, setConfig] = useState<SearchConfig>(defaultSearchConfig);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setConfig({ ...defaultSearchConfig, ...parsed });
      } catch {
        // Invalid JSON, use defaults
      }
    }
  }, []);

  const updateConfig = (updates: Partial<SearchConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
  };

  if (!mounted) {
    return (
      <div className="p-4 md:p-8">
        <div className="max-w-md mx-auto space-y-8">
          <h1 className="text-2xl md:text-3xl font-bold">{t("config.title")}</h1>
          <div className="animate-pulse bg-muted rounded-lg h-64"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-md mx-auto space-y-8">
        <h1 className="text-2xl md:text-3xl font-bold">{t("config.title")}</h1>

        {/* Language */}
        <div className="space-y-4">
          <SectionHeader>{t("config.sections.language")}</SectionHeader>
          <SelectSetting label={t("language.selector")}>
            <Select
              value={locale}
              onValueChange={(value) => setLocale(value as Locale)}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {LOCALES.find((l) => l.code === locale)?.nativeName}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-background border border-border">
                {LOCALES.map((loc) => (
                  <SelectItem key={loc.code} value={loc.code} className="py-2">
                    <div className="flex flex-col">
                      <span className="font-medium">{loc.nativeName}</span>
                      <span className="text-xs text-muted-foreground">{loc.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SelectSetting>
        </div>

        <Divider />

        {/* Similarity */}
        <div className="space-y-4">
          <SectionHeader>{t("config.sections.similarity")}</SectionHeader>
          <SliderSetting
            label={t("config.similarity.cutoff")}
            value={config.similarityCutoff}
            min={0.05}
            max={0.4}
            step={0.05}
            onChange={(value) => updateConfig({ similarityCutoff: value })}
            format={(v) => v.toFixed(2)}
            info={t("config.similarity.cutoffInfo")}
          />
        </div>

        <Divider />

        {/* Fuzzy Search */}
        <div className="space-y-4">
          <SectionHeader>{t("config.sections.fuzzySearch")}</SectionHeader>
          <ToggleSetting
            label={t("config.fuzzy.enableFallback")}
            checked={config.fuzzyEnabled}
            onChange={(checked) => updateConfig({ fuzzyEnabled: checked })}
            info={t("config.fuzzy.enableFallbackInfo")}
          />
          {config.fuzzyEnabled && (
            <SliderSetting
              label={t("config.fuzzy.threshold")}
              value={config.fuzzyThreshold}
              min={0.1}
              max={0.5}
              step={0.05}
              onChange={(value) => updateConfig({ fuzzyThreshold: value })}
              format={(v) => v.toFixed(2)}
              info={t("config.fuzzy.thresholdInfo")}
            />
          )}
        </div>

        <Divider />

        {/* Reranking */}
        <div className="space-y-4">
          <SectionHeader>{t("config.sections.reranking")}</SectionHeader>
          <SelectSetting
            label={t("config.reranker.model")}
            info={t("config.reranker.modelInfo")}
          >
            <Select
              value={config.reranker}
              onValueChange={(value) => updateConfig({ reranker: value as RerankerType })}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {rerankerOptions.find((o) => o.value === config.reranker)?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-background border border-border">
                {rerankerOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="py-2">
                    <div className="flex flex-col">
                      <span className="font-medium">{option.label}</span>
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SelectSetting>
          <SliderSetting
            label={t("config.reranker.candidates")}
            value={config.preRerankLimit}
            min={20}
            max={150}
            step={10}
            onChange={(value) => updateConfig({ preRerankLimit: value })}
            info={t("config.reranker.candidatesInfo")}
          />
          <SliderSetting
            label={t("config.reranker.results")}
            value={config.postRerankLimit}
            min={5}
            max={30}
            step={5}
            onChange={(value) => updateConfig({ postRerankLimit: value })}
            info={t("config.reranker.resultsInfo")}
          />
        </div>

        <Divider />

        {/* Books Display */}
        <div className="space-y-4">
          <SectionHeader>{t("config.sections.booksDisplay")}</SectionHeader>
          <ToggleSetting
            label={t("config.display.showTransliterations")}
            checked={config.showTransliterations}
            onChange={(checked) => updateConfig({ showTransliterations: checked })}
            info={t("config.display.showTransliterationsInfo")}
          />
          <ToggleSetting
            label={t("config.display.showPublicationDates")}
            checked={config.showPublicationDates}
            onChange={(checked) => updateConfig({ showPublicationDates: checked })}
            info={t("config.display.showPublicationDatesInfo")}
          />
        </div>
      </div>
    </div>
  );
}
