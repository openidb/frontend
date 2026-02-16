"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { HelpCircle } from "lucide-react";
import { motion } from "framer-motion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type TranslationDisplayOption,
  type DateCalendarType,
  QURAN_TRANSLATIONS,
} from "@/lib/config/search-defaults";
import { useAppConfig } from "@/lib/config";
import { useTranslation, LOCALES, RTL_LOCALES, type Locale } from "@/lib/i18n";
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
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5 min-w-0">
        <label className="text-sm truncate">{label}</label>
        {info && <InfoTooltip text={info} />}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
          checked ? "bg-neutral-700 dark:bg-neutral-300" : "bg-stone-300 dark:bg-neutral-600"
        }`}
      >
        <span
          className={`pointer-events-none block h-4 w-4 rounded-full shadow-md ring-0 transition-all duration-200 ${
            checked ? "bg-white dark:bg-neutral-700" : "bg-neutral-100 dark:bg-neutral-300"
          } ${
            checked ? "ltr:translate-x-4 rtl:-translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  getLabel,
}: {
  options: T[];
  value: T;
  onChange: (value: T) => void;
  getLabel: (option: T) => string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  // Derive a string key from labels so we re-measure when translations change
  const labelsKey = options.map(getLabel).join("|");

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const idx = options.indexOf(value);
    const btn = container.children[idx + 1] as HTMLElement | undefined; // +1 for the motion.div
    if (btn) {
      setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth });
    }
  }, [value, options, labelsKey]);

  useEffect(() => {
    // Re-measure after a frame to ensure DOM has updated with new labels
    requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  return (
    <div
      ref={containerRef}
      className="relative flex w-fit rounded-full bg-muted p-0.5"
    >
      <motion.div
        className="absolute top-0.5 bottom-0.5 rounded-full bg-neutral-700 dark:bg-neutral-300 shadow-sm"
        initial={false}
        animate={{ left: indicator.left, width: indicator.width }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      />
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`relative z-10 px-2.5 py-1 text-[11px] font-medium rounded-full whitespace-nowrap transition-colors ${
            value === option
              ? "text-white dark:text-neutral-900"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {getLabel(option)}
        </button>
      ))}
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
          <div className="animate-shimmer bg-muted rounded-lg h-64"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-20 md:pb-24">
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
          <div className="flex items-center justify-between">
            <label className="text-sm">{t("config.appearance.theme")}</label>
            <SegmentedControl
              options={["system", "light", "dark"] as Theme[]}
              value={theme}
              onChange={setTheme}
              getLabel={(o) => t(`config.appearance.themes.${o}`)}
            />
          </div>
        </div>

        <Divider />

        {/* Translations */}
        <div className="space-y-4">
          <SectionHeader>{t("config.sections.translations")}</SectionHeader>
          <ToggleSetting
            label={(() => {
              const base = t("config.translations.quranTranslation");
              if (config.quranTranslation === "none") return base;
              const match = QURAN_TRANSLATIONS.find(tr => tr.code === config.quranTranslation);
              if (!match || !match.translator) return base;
              return `${base} [${match.translator}]`;
            })()}
            checked={config.quranTranslation !== "none"}
            onChange={(checked) => updateConfig({ quranTranslation: checked ? (locale === "ar" ? "en" : locale) : "none" })}
            info={t("config.translations.quranTranslationInfo")}
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <label className="text-sm">{t("config.translations.bookTitleDisplay")}</label>
              <InfoTooltip text={t("config.translations.bookTitleDisplayInfo")} />
            </div>
            <div className="hidden sm:block">
              <SegmentedControl
                options={["none", "transliteration", "translation"] as TranslationDisplayOption[]}
                value={config.bookTitleDisplay}
                onChange={(v) => updateConfig({ bookTitleDisplay: v })}
                getLabel={(o) => t(`config.translationDisplay.options.${o}`)}
              />
            </div>
            <div className="sm:hidden w-36">
              <Select
                value={config.bookTitleDisplay}
                onValueChange={(v) => updateConfig({ bookTitleDisplay: v as TranslationDisplayOption })}
              >
                <SelectTrigger className="w-full h-8 text-xs">
                  <SelectValue>
                    {t(`config.translationDisplay.options.${config.bookTitleDisplay}`)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-background border border-border">
                  {(["none", "transliteration", "translation"] as TranslationDisplayOption[]).map((option) => (
                    <SelectItem key={option} value={option} className="text-xs">
                      {t(`config.translationDisplay.options.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <ToggleSetting
            label={t("config.translations.authorTransliteration")}
            checked={config.showAuthorTransliteration}
            onChange={(checked) => updateConfig({ showAuthorTransliteration: checked })}
            info={t("config.translations.authorTransliterationInfo")}
          />
          <ToggleSetting
            label={(() => {
              const base = t("config.translations.hadithTranslation");
              if (config.hadithTranslation === "none") return base;
              const langCode = config.hadithTranslation;
              const match = LOCALES.find(l => l.code === langCode);
              if (!match) return base;
              return `${base} [${match.nativeName}]`;
            })()}
            checked={config.hadithTranslation !== "none"}
            onChange={(checked) => updateConfig({ hadithTranslation: checked ? (locale === "ar" ? "en" : locale) : "none" })}
            info={t("config.translations.hadithTranslationInfo")}
          />

          {/* Translation sources card */}
          <div className="rounded-lg border border-border/50 bg-muted/30 px-3.5 py-3 space-y-2">
            <span className="text-xs font-medium text-muted-foreground">{t("config.translations.sourcesTitle")}</span>
            <ul className="space-y-1 text-[11px] text-muted-foreground/80 leading-relaxed">
              <li>{t("config.translations.sourcesQuran")}</li>
              <li>{t("config.translations.sourcesHadith")}</li>
              <li>{t("config.translations.sourcesBooks")}</li>
            </ul>
            <p className="text-[11px] text-muted-foreground/60 leading-relaxed italic">
              {t("config.translations.sourcesDisclaimer")}
            </p>
          </div>
        </div>

        <Divider />

        {/* Books Display */}
        <div className="space-y-4">
          <SectionHeader>{t("config.sections.booksDisplay")}</SectionHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <label className="text-sm">{t("config.display.dateCalendar")}</label>
              <InfoTooltip text={t("config.display.dateCalendarInfo")} />
            </div>
            <SegmentedControl
              options={["hijri", "gregorian", "both"] as DateCalendarType[]}
              value={config.dateCalendar}
              onChange={(v) => updateConfig({ dateCalendar: v })}
              getLabel={(o) => t(`config.display.dateCalendarOptions.${o}`)}
            />
          </div>
          <ToggleSetting
            label={t("config.display.showPublicationDates")}
            checked={config.showPublicationDates}
            onChange={(checked) => updateConfig({ showPublicationDates: checked })}
            info={t("config.display.showPublicationDatesInfo")}
          />
        </div>

        <Divider />

        {/* Basmala / About */}
        <div className="space-y-4" dir="rtl">
          <p className="text-base font-semibold text-start" style={{ fontFamily: "var(--font-noto-naskh), serif" }}>
            بسم الله الرحمن الرحيم
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed text-start" style={{ fontFamily: "var(--font-noto-naskh), serif" }}>
            الحمد لله ربّ العالمين، والصلاة والسلام على أشرف الأنبياء والمرسلين، نبيّنا محمّد وعلى آله وصحبه أجمعين.
          </p>
          <div className="space-y-3 text-sm text-muted-foreground/80 leading-relaxed text-start" style={{ fontFamily: "var(--font-noto-naskh), serif" }}>
            <blockquote className="border-s-2 border-border ps-3 italic">
              بَلِّغُوا عَنِّي وَلَوْ آيَةً، وَحَدِّثُوا عَنْ بَنِي إِسْرَائِيلَ وَلاَ حَرَجَ، وَمَنْ كَذَبَ عَلَىَّ مُتَعَمِّدًا فَلْيَتَبَوَّأْ مَقْعَدَهُ مِنَ النَّارِ
              <footer className="text-xs text-muted-foreground/60 mt-1 not-italic">— صحيح البخاري ٣٤٦١</footer>
            </blockquote>
            <blockquote className="border-s-2 border-border ps-3 italic">
              مَنْ دَعَا إِلَى هُدَى كَانَ لَهُ مِنَ الأَجْرِ مِثْلُ أُجُورِ مَنْ تَبِعَهُ لاَ يَنْقُصُ ذَلِكَ مِنْ أُجُورِهِمْ شَيْئًا
              <footer className="text-xs text-muted-foreground/60 mt-1 not-italic">— رياض الصالحين ١٣٨٢</footer>
            </blockquote>
            <blockquote className="border-s-2 border-border ps-3 italic">
              نَضَّرَ اللَّهُ امْرَأً سَمِعَ مِنَّا شَيْئًا فَبَلَّغَهُ كَمَا سَمِعَهُ فَرُبَّ مُبَلِّغٍ أَوْعَى مِنْ سَامِعٍ
              <footer className="text-xs text-muted-foreground/60 mt-1 not-italic">— رياض الصالحين ١٣٨٩</footer>
            </blockquote>
          </div>
          <p className={`text-xs text-muted-foreground/60 leading-relaxed ${RTL_LOCALES.includes(locale) ? "text-right" : "text-left"}`} dir={RTL_LOCALES.includes(locale) ? "rtl" : "ltr"}>
            {t("config.about.description")}{" "}
            <a
              href="https://github.com/openidb"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-muted-foreground transition-colors"
            >
              {t("config.about.github")}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
