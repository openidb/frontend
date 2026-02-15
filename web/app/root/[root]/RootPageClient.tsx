"use client";

import { useState } from "react";
import { PrefetchLink } from "@/components/PrefetchLink";
import type { RootFamilyData, DerivedForm, Definition } from "@/lib/types/dictionary";

type DictionaryEntry = Omit<Definition, "matchType">;

export function RootPageClient({ data }: { data: RootFamilyData }) {
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set());

  const verbs = data.derivedForms.filter((f) => f.partOfSpeech === "verb");
  const nouns = data.derivedForms.filter((f) => f.partOfSpeech !== "verb");

  // Group nouns by pattern
  const nounsByPattern = new Map<string, DerivedForm[]>();
  for (const n of nouns) {
    const key = n.pattern || n.wordType || "other";
    if (!nounsByPattern.has(key)) nounsByPattern.set(key, []);
    nounsByPattern.get(key)!.push(n);
  }

  const toggleEntry = (id: number) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8" dir="rtl">
      {/* Header */}
      <div className="mb-8">
        <PrefetchLink
          href="/"
          className="text-sm text-gray-500 dark:text-gray-400 hover:underline mb-2 inline-block"
        >
          &larr; Home
        </PrefetchLink>
        <h1 className="text-4xl font-bold font-arabic mb-2">{data.root}</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Root: <span className="font-arabic font-semibold">{data.root}</span>
          {" — "}
          {data.derivedForms.length} derived forms, {data.dictionaryEntries.length} dictionary entries
        </p>
      </div>

      {/* Derived Forms */}
      {data.derivedForms.length > 0 && (
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4 border-b pb-2 dark:border-gray-700">
            Derived Forms
          </h2>

          {/* Verbs */}
          {verbs.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-3 text-blue-700 dark:text-blue-400">
                Verbs ({verbs.length})
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {verbs.map((v, i) => (
                  <div
                    key={i}
                    className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center"
                  >
                    <span className="font-arabic text-lg block">
                      {v.vocalized || v.word}
                    </span>
                    {v.pattern && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-arabic">
                        {v.pattern}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Nouns grouped by pattern */}
          {nouns.length > 0 && (
            <div>
              <h3 className="text-lg font-medium mb-3 text-emerald-700 dark:text-emerald-400">
                Nouns &amp; Adjectives ({nouns.length})
              </h3>
              {[...nounsByPattern.entries()].map(([pattern, forms]) => (
                <div key={pattern} className="mb-4">
                  <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 font-arabic">
                    {pattern} ({forms.length})
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {forms.map((f, i) => (
                      <div
                        key={i}
                        className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3"
                      >
                        <span className="font-arabic text-lg block text-center">
                          {f.vocalized || f.word}
                        </span>
                        {f.wordType && (
                          <span className="text-xs text-gray-500 dark:text-gray-400 block text-center">
                            {f.wordType}
                          </span>
                        )}
                        {f.definition && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2 font-arabic">
                            {f.definition.slice(0, 100)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Dictionary Entries */}
      {data.dictionaryEntries.length > 0 && (
        <section>
          <h2 className="text-2xl font-semibold mb-4 border-b pb-2 dark:border-gray-700">
            Dictionary Definitions
          </h2>
          <div className="space-y-4">
            {data.dictionaryEntries.map((entry) => {
              const isExpanded = expandedEntries.has(entry.id);
              return (
                <div
                  key={`${entry.source.id}-${entry.id}`}
                  className="border rounded-lg dark:border-gray-700 overflow-hidden"
                >
                  <button
                    onClick={() => toggleEntry(entry.id)}
                    className="w-full p-4 text-right hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    aria-expanded={isExpanded}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-arabic text-lg font-semibold">
                          {entry.headword}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400 mr-3">
                          {entry.source.nameArabic}
                        </span>
                      </div>
                      <span className="text-gray-400 text-lg">
                        {isExpanded ? "−" : "+"}
                      </span>
                    </div>
                    {!isExpanded && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 font-arabic line-clamp-2">
                        {entry.definition}
                      </p>
                    )}
                  </button>
                  {isExpanded && (
                    <div className="p-4 pt-0 border-t dark:border-gray-700">
                      {entry.definitionHtml ? (
                        <div
                          className="font-arabic text-gray-800 dark:text-gray-200 leading-relaxed prose dark:prose-invert max-w-none"
                          dangerouslySetInnerHTML={{ __html: entry.definitionHtml }}
                        />
                      ) : (
                        <p className="font-arabic text-gray-800 dark:text-gray-200 leading-relaxed">
                          {entry.definition}
                        </p>
                      )}
                      {entry.bookId && entry.startPage && (
                        <div className="mt-3 text-sm text-gray-500">
                          <PrefetchLink
                            href={`/reader/${entry.bookId}?page=${entry.startPage}`}
                            className="hover:underline text-blue-600 dark:text-blue-400"
                          >
                            View in reader (p. {entry.startPage}
                            {entry.endPage && entry.endPage !== entry.startPage
                              ? `–${entry.endPage}`
                              : ""}
                            )
                          </PrefetchLink>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
