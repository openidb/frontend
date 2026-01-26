"use client";

import { useState, useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface AlgorithmStats {
  fusionWeights: { semantic: number; keyword: number };
  keywordWeights: { tsRank: number; bm25: number };
  bm25Params: { k1: number; b: number; normK: number };
  rrfK: number;
  embeddingModel: string;
  embeddingDimensions: number;
  rerankerModel: string | null;
  queryExpansionModel: string | null;
}

interface AlgorithmDescriptionProps {
  stats: AlgorithmStats;
}

function LaTeX({ math, display = false }: { math: string; display?: boolean }) {
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      try {
        katex.render(math, containerRef.current, {
          throwOnError: false,
          displayMode: display,
        });
      } catch (e) {
        console.error("KaTeX render error:", e);
        if (containerRef.current) {
          containerRef.current.textContent = math;
        }
      }
    }
  }, [math, display]);

  return <span ref={containerRef} className={display ? "block my-2" : "inline"} />;
}

export default function AlgorithmDescription({ stats }: AlgorithmDescriptionProps) {
  const { t } = useTranslation();
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <div className="space-y-4 text-xs">
      {/* Pipeline Overview */}
      <div className="bg-background rounded p-3 border">
        <button
          onClick={() => toggleSection("overview")}
          className="w-full flex items-center justify-between text-left"
        >
          <span className="font-medium">{t("algorithm.pipelineOverview")}</span>
          {expandedSection === "overview" ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
        {expandedSection === "overview" && (
          <div className="mt-3 space-y-2">
            <pre className="text-[10px] leading-tight bg-muted/50 p-2 rounded overflow-x-auto font-mono">
{`USER QUERY
    |
[Normalize Arabic Text]
    |         |
    v         v
 KEYWORD   SEMANTIC
 SEARCH    SEARCH
    |         |
    v         v
[ts_rank  [Qdrant
 + BM25]   Cosine]
    |         |
    +----+----+
         |
    [SCORE FUSION]
         |
    [Reranking?]
         |
    FINAL RESULTS`}
            </pre>
          </div>
        )}
      </div>

      {/* Step 1: Text Normalization */}
      <div className="bg-background rounded p-3 border">
        <button
          onClick={() => toggleSection("normalization")}
          className="w-full flex items-center justify-between text-left"
        >
          <span className="font-medium">{t("algorithm.step1Normalization")}</span>
          {expandedSection === "normalization" ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
        {expandedSection === "normalization" && (
          <div className="mt-3 space-y-2 text-muted-foreground">
            <p>{t("algorithm.normalizationDesc")}</p>
            <ul className="list-disc list-inside space-y-1 mr-4">
              <li>{t("algorithm.removeDiacritics")}</li>
              <li>{t("algorithm.normalizeAlef")}</li>
              <li>{t("algorithm.normalizeTeh")}</li>
            </ul>
          </div>
        )}
      </div>

      {/* Step 2: Keyword Search */}
      <div className="bg-background rounded p-3 border">
        <button
          onClick={() => toggleSection("keyword")}
          className="w-full flex items-center justify-between text-left"
        >
          <span className="font-medium">{t("algorithm.step2Keyword")}</span>
          {expandedSection === "keyword" ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
        {expandedSection === "keyword" && (
          <div className="mt-3 space-y-3 text-muted-foreground">
            <p>{t("algorithm.keywordDesc")}</p>

            <div className="space-y-2">
              <p className="font-medium text-foreground">{t("algorithm.idfFormula")}</p>
              <div className="bg-muted/50 p-2 rounded overflow-x-auto">
                <LaTeX
                  math={`\\text{IDF}(q) = \\ln\\left(\\frac{N - df + 0.5}{df + 0.5} + 1\\right)`}
                  display
                />
              </div>
              <p className="text-[10px]">
                {t("algorithm.idfParams")}
              </p>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-foreground">{t("algorithm.bm25Formula")}</p>
              <div className="bg-muted/50 p-2 rounded overflow-x-auto">
                <LaTeX
                  math={`\\text{BM25}(D,Q) = \\sum_{i=1}^{n} \\text{IDF}(q_i) \\cdot \\frac{f(q_i,D) \\cdot (k_1+1)}{f(q_i,D) + k_1 \\cdot \\left(1-b+b \\cdot \\frac{|D|}{\\text{avgdl}}\\right)}`}
                  display
                />
              </div>
              <p className="text-[10px]">
                <LaTeX math={`k_1 = ${stats.bm25Params.k1}`} /> (term saturation), {" "}
                <LaTeX math={`b = ${stats.bm25Params.b}`} /> (length norm)
              </p>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-foreground">{t("algorithm.combinedKeyword")}</p>
              <div className="bg-muted/50 p-2 rounded overflow-x-auto">
                <LaTeX
                  math={`S_{\\text{keyword}} = ${stats.keywordWeights.tsRank} \\cdot \\frac{\\text{ts\\_rank}}{\\max(\\text{ts\\_rank})} + ${stats.keywordWeights.bm25} \\cdot \\frac{\\text{BM25}}{\\max(\\text{BM25})}`}
                  display
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-foreground">{t("algorithm.tsRankFormula")}</p>
              <div className="bg-muted/50 p-2 rounded text-[10px] font-mono overflow-x-auto">
                <p>ts_rank(to_tsvector('simple', text), to_tsquery('simple', query))</p>
              </div>
              <p className="text-[10px]">{t("algorithm.tsRankDesc")}</p>
              <ul className="list-disc list-inside text-[10px] space-y-1 mr-4">
                <li>{t("algorithm.tsRankOperatorPhrase")}</li>
                <li>{t("algorithm.tsRankOperatorOr")}</li>
                <li>{t("algorithm.tsRankOperatorAnd")}</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Step 3: Semantic Search */}
      <div className="bg-background rounded p-3 border">
        <button
          onClick={() => toggleSection("semantic")}
          className="w-full flex items-center justify-between text-left"
        >
          <span className="font-medium">{t("algorithm.step3Semantic")}</span>
          {expandedSection === "semantic" ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
        {expandedSection === "semantic" && (
          <div className="mt-3 space-y-3 text-muted-foreground">
            <p>{t("algorithm.semanticDesc")}</p>

            <div className="space-y-1">
              <p><strong>{t("algorithm.embeddingModel")}:</strong> {stats.embeddingModel}</p>
              <p><strong>{t("algorithm.dimensions")}:</strong> {stats.embeddingDimensions}</p>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-foreground">{t("algorithm.cosineFormula")}</p>
              <div className="bg-muted/50 p-2 rounded overflow-x-auto">
                <LaTeX
                  math={`S_{\\text{semantic}} = \\frac{\\vec{q} \\cdot \\vec{d}}{||\\vec{q}|| \\cdot ||\\vec{d}||}`}
                  display
                />
              </div>
            </div>

            <div className="space-y-1">
              <p className="font-medium text-foreground">{t("algorithm.dynamicThresholds")}</p>
              <ul className="list-disc list-inside text-[10px] space-y-1 mr-4">
                <li>{t("algorithm.threshold1to3")}</li>
                <li>{t("algorithm.threshold4to6")}</li>
                <li>{t("algorithm.threshold7to12")}</li>
                <li>{t("algorithm.threshold13plus")}</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Step 4: Score Fusion */}
      <div className="bg-background rounded p-3 border">
        <button
          onClick={() => toggleSection("fusion")}
          className="w-full flex items-center justify-between text-left"
        >
          <span className="font-medium">{t("algorithm.step4Fusion")}</span>
          {expandedSection === "fusion" ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
        {expandedSection === "fusion" && (
          <div className="mt-3 space-y-3 text-muted-foreground">
            <div className="space-y-2">
              <p className="font-medium text-foreground">{t("algorithm.keywordNormalization")}</p>
              <div className="bg-muted/50 p-2 rounded overflow-x-auto">
                <LaTeX
                  math={`\\hat{S}_{\\text{keyword}} = \\frac{S_{\\text{keyword}}}{S_{\\text{keyword}} + ${stats.bm25Params.normK}}`}
                  display
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-foreground">{t("algorithm.finalFusion")}</p>
              <div className="bg-muted/50 p-2 rounded overflow-x-auto">
                <LaTeX
                  math={`S_{\\text{fused}} = w_s \\cdot S_{\\text{semantic}} + w_k \\cdot \\hat{S}_{\\text{keyword}}`}
                  display
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-foreground">{t("algorithm.currentWeights")}</p>
              <div className="bg-muted/50 p-2 rounded text-[10px]">
                <LaTeX math={`w_s = ${stats.fusionWeights.semantic}`} /> (semantic), {" "}
                <LaTeX math={`w_k = ${stats.fusionWeights.keyword}`} /> (keyword)
              </div>
            </div>

            <div className="space-y-1">
              <p className="font-medium text-foreground">{t("algorithm.dynamicWeights")}</p>
              <table className="text-[10px] w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-right py-1 pr-2">{t("algorithm.queryType")}</th>
                    <th className="text-right py-1 px-2">{t("algorithm.semanticWeight")}</th>
                    <th className="text-right py-1 pl-2">{t("algorithm.keywordWeight")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td className="text-right pr-2">{t("algorithm.quotedPhrases")}</td><td className="text-right px-2">0.15</td><td className="text-right pl-2">0.85</td></tr>
                  <tr><td className="text-right pr-2">{t("algorithm.short1to3")}</td><td className="text-right px-2">0.70</td><td className="text-right pl-2">0.30</td></tr>
                  <tr><td className="text-right pr-2">{t("algorithm.long20plus")}</td><td className="text-right px-2">0.45</td><td className="text-right pl-2">0.55</td></tr>
                  <tr><td className="text-right pr-2">{t("algorithm.default")}</td><td className="text-right px-2">0.40</td><td className="text-right pl-2">0.60</td></tr>
                </tbody>
              </table>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-foreground">{t("algorithm.confirmationBoost")}</p>
              <div className="bg-muted/50 p-2 rounded overflow-x-auto">
                <LaTeX
                  math={`\\text{If in both: } S_{\\text{fused}} = S_{\\text{fused}} \\times 1.1`}
                  display
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Step 5: RRF */}
      <div className="bg-background rounded p-3 border">
        <button
          onClick={() => toggleSection("rrf")}
          className="w-full flex items-center justify-between text-left"
        >
          <span className="font-medium">{t("algorithm.step5RRF")}</span>
          {expandedSection === "rrf" ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
        {expandedSection === "rrf" && (
          <div className="mt-3 space-y-3 text-muted-foreground">
            <p>{t("algorithm.rrfDesc")}</p>
            <div className="bg-muted/50 p-2 rounded overflow-x-auto">
              <LaTeX
                math={`\\text{RRF} = \\sum_{r \\in \\{r_{\\text{semantic}}, r_{\\text{keyword}}\\}} \\frac{1}{K + r}`}
                display
              />
            </div>
            <p className="text-[10px]">
              <LaTeX math={`K = ${stats.rrfK}`} /> ({t("algorithm.rrfConstant")})
            </p>
          </div>
        )}
      </div>

      {/* Step 6: Reranking */}
      <div className="bg-background rounded p-3 border">
        <button
          onClick={() => toggleSection("reranking")}
          className="w-full flex items-center justify-between text-left"
        >
          <span className="font-medium">{t("algorithm.step6Reranking")}</span>
          {expandedSection === "reranking" ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
        {expandedSection === "reranking" && (
          <div className="mt-3 space-y-2 text-muted-foreground">
            <p>{t("algorithm.rerankingDesc")}</p>
            <div className="space-y-1">
              <p><strong>{t("algorithm.queryExpansion")}:</strong> {stats.queryExpansionModel || t("algorithm.none")}</p>
              <p><strong>{t("algorithm.currentReranker")}:</strong> {stats.rerankerModel || t("algorithm.none")}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
