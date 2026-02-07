"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, BookOpen, ArrowRight } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface ResolvedSource {
  type: "quran" | "hadith" | "tafsir" | "book";
  ref: string;
  text: string;
  metadata: {
    label: string;
    labelEnglish: string;
  };
}

interface GraphContextEntity {
  id: string;
  type: string;
  nameArabic: string;
  nameEnglish: string;
  descriptionArabic: string;
  descriptionEnglish: string;
  sources: ResolvedSource[];
  relationships: {
    type: string;
    targetNameArabic: string;
    targetNameEnglish: string;
    description: string;
    sources: ResolvedSource[];
  }[];
  mentionedIn: {
    surahNumber: number;
    surahNameArabic: string;
    surahNameEnglish: string;
    ayahStart: number;
    ayahEnd: number;
    textUthmani: string;
    role: string;
    context: string;
  }[];
}

export interface GraphContext {
  entities: GraphContextEntity[];
  coverage: "partial" | "full";
  timingMs: number;
}

const TYPE_COLORS: Record<string, string> = {
  Prophet: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  Person: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  Place: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  AfterlifePlace: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  DivineAttribute: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  Event: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  Concept: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  Nation: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  Angel: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  Ruling: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  Scripture: "bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-300",
  Object: "bg-stone-100 text-stone-800 dark:bg-stone-900/30 dark:text-stone-300",
  TimeReference: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
};

const SOURCE_TYPE_LABELS: Record<string, { icon: string; label: string }> = {
  quran: { icon: "📖", label: "Quran" },
  hadith: { icon: "📜", label: "Hadith" },
  tafsir: { icon: "📝", label: "Tafsir" },
  book: { icon: "📚", label: "Book" },
};

function SourceItem({ source, isRtl }: { source: ResolvedSource; isRtl: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = source.text.length > 150;
  const displayText = !isLong || expanded ? source.text : source.text.slice(0, 150) + "...";

  return (
    <div className="border-s-2 border-muted ps-3 py-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <span>{SOURCE_TYPE_LABELS[source.type]?.icon}</span>
        <span dir={isRtl ? "rtl" : "ltr"}>
          {isRtl ? source.metadata.label : source.metadata.labelEnglish}
        </span>
      </div>
      <p className="text-sm leading-relaxed" dir="rtl">
        {displayText}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-primary hover:underline mt-1 flex items-center gap-0.5"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}

function RelationshipItem({
  rel,
  isRtl,
}: {
  rel: GraphContextEntity["relationships"][0];
  isRtl: boolean;
}) {
  const [showSources, setShowSources] = useState(false);

  return (
    <div className="py-2">
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <span className="text-xs px-1.5 py-0.5 rounded bg-muted font-mono">
          {rel.type.replace(/_/g, " ")}
        </span>
        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="font-medium" dir="rtl">
          {isRtl ? rel.targetNameArabic : rel.targetNameEnglish}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">{rel.description}</p>
      {rel.sources.length > 0 && (
        <div className="mt-1">
          <button
            onClick={() => setShowSources(!showSources)}
            className="text-xs text-primary hover:underline flex items-center gap-0.5"
          >
            {showSources ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {rel.sources.length} source{rel.sources.length > 1 ? "s" : ""}
          </button>
          {showSources && (
            <div className="mt-2 space-y-2">
              {rel.sources.map((s, i) => (
                <SourceItem key={i} source={s} isRtl={isRtl} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function EntityPanel({
  graphContext,
  onEntityClick,
}: {
  graphContext: GraphContext;
  onEntityClick?: (nameArabic: string) => void;
}) {
  const { t, locale } = useTranslation();
  const isRtl = locale === "ar" || locale === "ur";
  const [expandedEntity, setExpandedEntity] = useState<string | null>(
    graphContext.entities[0]?.id || null
  );

  if (graphContext.entities.length === 0) return null;

  return (
    <div className="mb-6 space-y-3">
      {graphContext.entities.map((entity) => {
        const isExpanded = expandedEntity === entity.id;
        const typeColor = TYPE_COLORS[entity.type] || "bg-muted text-muted-foreground";

        // Group sources by type
        const sourcesByType = new Map<string, ResolvedSource[]>();
        for (const s of entity.sources) {
          const group = sourcesByType.get(s.type) || [];
          group.push(s);
          sourcesByType.set(s.type, group);
        }

        return (
          <div
            key={entity.id}
            className="border rounded-lg bg-background overflow-hidden"
          >
            {/* Header */}
            <button
              onClick={() => setExpandedEntity(isExpanded ? null : entity.id)}
              className="w-full px-4 py-3 flex items-start gap-3 hover:bg-muted/30 transition-colors text-start"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColor}`}
                  >
                    {entity.type}
                  </span>
                  {entity.sources.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {entity.sources.length} {t("search.sourceText", { count: entity.sources.length })}
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-semibold mt-1" dir="rtl">
                  {entity.nameArabic}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {entity.nameEnglish}
                </p>
              </div>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
              )}
            </button>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="px-4 pb-4 space-y-4">
                {/* Description */}
                <p className="text-sm text-muted-foreground" dir="rtl">
                  {entity.descriptionArabic}
                </p>

                {/* Sources — grouped by type */}
                {entity.sources.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                      <BookOpen className="h-3.5 w-3.5" />
                      {t("search.sourceText", { count: entity.sources.length })}
                    </h4>
                    <div className="space-y-3">
                      {Array.from(sourcesByType.entries()).map(([type, sources]) => (
                        <div key={type}>
                          <div className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                            <span>{SOURCE_TYPE_LABELS[type]?.icon}</span>
                            <span>{SOURCE_TYPE_LABELS[type]?.label}</span>
                            <span className="text-muted-foreground/50">({sources.length})</span>
                          </div>
                          <div className="space-y-2">
                            {sources.map((s, i) => (
                              <SourceItem key={i} source={s} isRtl={isRtl} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Mentioned In (Quran-specific graph links) */}
                {entity.mentionedIn.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                      {t("search.mentionedInQuran")} ({entity.mentionedIn.length})
                    </h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {entity.mentionedIn.slice(0, 10).map((m, i) => (
                        <div key={i} className="border-s-2 border-emerald-300 dark:border-emerald-700 ps-3 py-1">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
                            <span dir={isRtl ? "rtl" : "ltr"}>
                              {isRtl
                                ? `${m.surahNameArabic} ${m.ayahStart}${m.ayahEnd > m.ayahStart ? `-${m.ayahEnd}` : ""}`
                                : `${m.surahNameEnglish} ${m.ayahStart}${m.ayahEnd > m.ayahStart ? `-${m.ayahEnd}` : ""}`}
                            </span>
                            <span className={`px-1 py-0 rounded text-[10px] ${
                              m.role === "primary"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                : m.role === "secondary"
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                : "bg-muted text-muted-foreground"
                            }`}>
                              {m.role}
                            </span>
                          </div>
                          <p className="text-sm leading-relaxed" dir="rtl">
                            {m.textUthmani.length > 200
                              ? m.textUthmani.slice(0, 200) + "..."
                              : m.textUthmani}
                          </p>
                          {m.context && (
                            <p className="text-xs text-muted-foreground mt-0.5 italic">
                              {m.context}
                            </p>
                          )}
                        </div>
                      ))}
                      {entity.mentionedIn.length > 10 && (
                        <p className="text-xs text-muted-foreground">
                          +{entity.mentionedIn.length - 10} more
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Relationships */}
                {entity.relationships.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                      {t("search.entityRelationships")} ({entity.relationships.length})
                    </h4>
                    <div className="divide-y">
                      {entity.relationships.slice(0, 8).map((rel, i) => (
                        <RelationshipItem key={i} rel={rel} isRtl={isRtl} />
                      ))}
                      {entity.relationships.length > 8 && (
                        <p className="text-xs text-muted-foreground pt-2">
                          +{entity.relationships.length - 8} more
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Related entities — clickable */}
                {entity.relationships.length > 0 && onEntityClick && (
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t">
                    {entity.relationships
                      .slice(0, 6)
                      .map((rel, i) => (
                        <button
                          key={i}
                          onClick={() => onEntityClick(rel.targetNameArabic)}
                          className="text-xs px-2 py-1 rounded-full border hover:bg-muted transition-colors"
                          dir="rtl"
                        >
                          {rel.targetNameArabic}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Coverage indicator */}
      {graphContext.coverage === "partial" && (
        <p className="text-xs text-muted-foreground text-center">
          {t("search.graphCoverage")}
        </p>
      )}
    </div>
  );
}
