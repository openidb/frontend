"use client";

import { HelpCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  rerankerOptions,
  QURAN_TRANSLATIONS,
  TRANSLATION_DISPLAY_OPTIONS,
  type RerankerType,
  type TranslationDisplayOption,
} from "@/components/SearchConfigDropdown";
import { useAppConfig } from "@/lib/config";
import { useTranslation, LOCALES, type Locale } from "@/lib/i18n";
import { useTheme, type Theme } from "@/lib/theme";

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
  const { theme, setTheme } = useTheme();
  const { config, updateConfig, isLoaded } = useAppConfig();

  if (!isLoaded) {
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

        {/* Appearance */}
        <div className="space-y-4">
          <SectionHeader>{t("config.sections.appearance")}</SectionHeader>
          <SelectSetting label={t("config.appearance.theme")}>
            <Select value={theme} onValueChange={(value) => setTheme(value as Theme)}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {t(`config.appearance.themes.${theme}`)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-background border border-border">
                <SelectItem value="system">{t("config.appearance.themes.system")}</SelectItem>
                <SelectItem value="light">{t("config.appearance.themes.light")}</SelectItem>
                <SelectItem value="dark">{t("config.appearance.themes.dark")}</SelectItem>
              </SelectContent>
            </Select>
          </SelectSetting>
        </div>

        <Divider />

        {/* Translations */}
        <div className="space-y-4">
          <SectionHeader>{t("config.sections.translations")}</SectionHeader>
          <ToggleSetting
            label={t("config.translations.automatic")}
            checked={config.autoTranslation}
            onChange={(checked) => updateConfig({ autoTranslation: checked })}
            info={t("config.translations.automaticInfo")}
          />
          <SelectSetting
            label={t("config.translations.quranTranslation")}
            info={t("config.translations.quranTranslationInfo")}
          >
            <Select
              value={config.autoTranslation ? (locale === "ar" ? "en" : locale) : config.quranTranslation}
              onValueChange={(value) => updateConfig({ quranTranslation: value, autoTranslation: false })}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(() => {
                    const effectiveCode = config.autoTranslation
                      ? (locale === "ar" ? "en" : locale)
                      : config.quranTranslation;
                    return t(`config.translations.options.${effectiveCode}`);
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-background border border-border max-h-64">
                {QURAN_TRANSLATIONS.map((trans) => (
                  <SelectItem key={trans.code} value={trans.code} className="py-2">
                    {t(`config.translations.options.${trans.code}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SelectSetting>
          <SelectSetting
            label={t("config.translations.bookTitleDisplay")}
            info={t("config.translations.bookTitleDisplayInfo")}
          >
            <Select
              value={config.autoTranslation ? (locale === "ar" ? "transliteration" : locale) : config.bookTitleDisplay}
              onValueChange={(value) => updateConfig({ bookTitleDisplay: value as TranslationDisplayOption, autoTranslation: false })}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(() => {
                    const effectiveCode = config.autoTranslation
                      ? (locale === "ar" ? "transliteration" : locale)
                      : config.bookTitleDisplay;
                    return t(`config.translationDisplay.options.${effectiveCode}`);
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-background border border-border max-h-64">
                {TRANSLATION_DISPLAY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.code} value={opt.code} className="py-2">
                    {t(`config.translationDisplay.options.${opt.code}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SelectSetting>
          <SelectSetting
            label={t("config.translations.hadithTranslation")}
            info={t("config.translations.hadithTranslationInfo")}
          >
            <Select
              value={config.autoTranslation ? "en" : config.hadithTranslation}
              onValueChange={(value) => updateConfig({ hadithTranslation: value as "none" | "en", autoTranslation: false })}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {t(`config.translations.hadithOptions.${config.autoTranslation ? "en" : config.hadithTranslation}`)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-background border border-border">
                <SelectItem value="none" className="py-2">
                  {t("config.translations.hadithOptions.none")}
                </SelectItem>
                <SelectItem value="en" className="py-2">
                  {t("config.translations.hadithOptions.en")}
                </SelectItem>
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
            min={0.15}
            max={0.8}
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
                  {(() => {
                    const keyMap: Record<RerankerType, string> = {
                      "gpt-oss-20b": "gptOss20b",
                      "gpt-oss-120b": "gptOss120b",
                      "gemini-flash": "geminiFlash",
                      "qwen4b": "qwen4b",
                      "jina": "jina",
                      "none": "none",
                    };
                    return t(`config.rerankerOptions.${keyMap[config.reranker]}`);
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-background border border-border">
                {rerankerOptions.map((option) => {
                  const keyMap: Record<RerankerType, string> = {
                    "gpt-oss-20b": "gptOss20b",
                    "gpt-oss-120b": "gptOss120b",
                    "gemini-flash": "geminiFlash",
                    "qwen4b": "qwen4b",
                    "jina": "jina",
                    "none": "none",
                  };
                  const key = keyMap[option.value];
                  return (
                    <SelectItem key={option.value} value={option.value} className="py-2">
                      <div className="flex flex-col">
                        <span className="font-medium">{t(`config.rerankerOptions.${key}`)}</span>
                        <span className="text-xs text-muted-foreground">{t(`config.rerankerOptions.${key}Desc`)}</span>
                      </div>
                    </SelectItem>
                  );
                })}
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
