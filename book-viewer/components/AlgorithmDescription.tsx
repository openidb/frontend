"use client";

import { useState, useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface AlgorithmStats {
  fusionMethod?: string;
  fusionWeights: { semantic: number; keyword: number };
  keywordEngine: string; // e.g., "elasticsearch"
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
          <div className="mt-3 space-y-4">
            <div>
              <p className="text-[10px] font-medium text-foreground mb-1">Standard Search:</p>
              <pre className="text-[10px] leading-tight bg-muted/50 p-2 rounded overflow-x-auto font-mono">
{`Query → [Semantic + Keyword] → RRF Fusion → Results

USER QUERY
    |
    +------------------+
    |                  |
    v                  v
[Famous Sources    [Normalize
 Dictionary]        Arabic Text]
    |                  |
    v           +------+------+
Direct Match    |             |
(score=1.0)     v             v
    |       KEYWORD       SEMANTIC
    |       SEARCH        SEARCH
    |          |             |
    |          v             v
    |    [Elasticsearch   [Qdrant
    |       BM25]          Cosine]
    |          |             |
    |          +------+------+
    |                 |
    |          [RRF FUSION]
    |          (No Reranking)
    |                 |
    +--------+--------+
             |
       FINAL RESULTS`}
              </pre>
            </div>
            <div>
              <p className="text-[10px] font-medium text-foreground mb-1">Refine Search:</p>
              <pre className="text-[10px] leading-tight bg-muted/50 p-2 rounded overflow-x-auto font-mono">
{`Query → LLM Expand → [Q1..Qn] → Search All
      → Merge → Dedupe → RRF → Unified Reranker

USER QUERY
    |
[LLM Query Expansion]
    |
    v
[Q1, Q2, Q3, Q4, Q5]
    |
    +---> Search Books (x5)
    +---> Search Quran (x5)
    +---> Search Hadith (x5)
    |
[Merge & Deduplicate]
    |
[Weighted RRF Fusion]
    |
[UNIFIED LLM RERANKING]
(Books + Quran + Hadith together)
    |
FINAL RESULTS`}
              </pre>
            </div>
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

      {/* Famous Sources Dictionary */}
      <div className="bg-background rounded p-3 border">
        <button
          onClick={() => toggleSection("famousSources")}
          className="w-full flex items-center justify-between text-left"
        >
          <span className="font-medium">{t("algorithm.famousSources")}</span>
          {expandedSection === "famousSources" ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
        {expandedSection === "famousSources" && (
          <div className="mt-3 space-y-3 text-muted-foreground">
            <p>{t("algorithm.famousSourcesDesc")}</p>

            <div className="space-y-2">
              <p className="font-medium text-foreground">{t("algorithm.famousVerses")}</p>
              <ul className="list-disc list-inside text-[10px] space-y-1 mr-4">
                <li>{t("algorithm.famousVersesExample1")}</li>
                <li>{t("algorithm.famousVersesExample2")}</li>
              </ul>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-foreground">{t("algorithm.surahLookup")}</p>
              <ul className="list-disc list-inside text-[10px] space-y-1 mr-4">
                <li>{t("algorithm.surahLookupDesc")}</li>
                <li>{t("algorithm.surahLookupExample")}</li>
              </ul>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-foreground">{t("algorithm.famousHadiths")}</p>
              <ul className="list-disc list-inside text-[10px] space-y-1 mr-4">
                <li>{t("algorithm.famousHadithsExample1")}</li>
                <li>{t("algorithm.famousHadithsExample2")}</li>
              </ul>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-foreground">{t("algorithm.directMatchScore")}</p>
              <div className="bg-muted/50 p-2 rounded overflow-x-auto">
                <LaTeX
                  math={`S_{\\text{direct}} = 1.0 \\text{ (perfect match)}`}
                  display
                />
              </div>
              <p className="text-[10px]">{t("algorithm.directMatchScoreDesc")}</p>
            </div>
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
              <p className="font-medium text-foreground">Search Engine</p>
              <div className="bg-muted/50 p-2 rounded text-[10px]">
                <p><strong>Engine:</strong> Elasticsearch 8.x with custom Arabic analyzer</p>
                <p><strong>Scoring:</strong> BM25 (Best Matching 25)</p>
              </div>
            </div>

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
              <p className="font-medium text-foreground">Arabic Text Analysis</p>
              <div className="bg-muted/50 p-2 rounded text-[10px] space-y-1">
                <p>Custom Elasticsearch analyzer with:</p>
                <ul className="list-disc list-inside mr-4">
                  <li>Diacritics removal (tashkeel)</li>
                  <li>Alef normalization (آأإٱ → ا)</li>
                  <li>Teh marbuta normalization (ة → ه)</li>
                  <li>Arabic stopwords filtering</li>
                </ul>
              </div>
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
            <p>{t("algorithm.fusionIntro")}</p>

            {/* Scenario 1: Both signals */}
            <div className="space-y-2">
              <p className="font-medium text-foreground">{t("algorithm.scenarioBoth")}</p>
              <p className="text-[10px]">{t("algorithm.scenarioBothDesc")}</p>
              <div className="bg-muted/50 p-2 rounded overflow-x-auto">
                <LaTeX
                  math={`S_{\\text{fused}} = 0.8 \\cdot S_{\\text{semantic}} + 0.3 \\cdot \\hat{S}_{\\text{BM25}}`}
                  display
                />
              </div>
              <p className="text-[10px]">{t("algorithm.weightedCombinationExplain")}</p>
            </div>

            {/* Scenario 2: Semantic only */}
            <div className="space-y-2">
              <p className="font-medium text-foreground">{t("algorithm.scenarioSemanticOnly")}</p>
              <p className="text-[10px]">{t("algorithm.scenarioSemanticOnlyDesc")}</p>
              <div className="bg-muted/50 p-2 rounded overflow-x-auto">
                <LaTeX
                  math={`S_{\\text{fused}} = S_{\\text{semantic}}`}
                  display
                />
              </div>
            </div>

            {/* Scenario 3: Keyword only */}
            <div className="space-y-2">
              <p className="font-medium text-foreground">{t("algorithm.scenarioKeywordOnly")}</p>
              <p className="text-[10px]">{t("algorithm.scenarioKeywordOnlyDesc")}</p>
              <div className="bg-muted/50 p-2 rounded overflow-x-auto">
                <LaTeX
                  math={`S_{\\text{fused}} = \\hat{S}_{\\text{BM25}}`}
                  display
                />
              </div>
            </div>

            {/* BM25 Normalization */}
            <div className="space-y-2">
              <p className="font-medium text-foreground">{t("algorithm.bm25Normalization")}</p>
              <div className="bg-muted/50 p-2 rounded overflow-x-auto">
                <LaTeX
                  math={`\\hat{S}_{\\text{BM25}} = \\frac{S_{\\text{BM25}}}{S_{\\text{BM25}} + ${stats.bm25Params.normK}}`}
                  display
                />
              </div>
              <p className="text-[10px]">{t("algorithm.bm25NormalizationDesc")}</p>
            </div>

            {/* Current settings */}
            <div className="space-y-2">
              <p className="font-medium text-foreground">{t("algorithm.currentSettings")}</p>
              <div className="bg-muted/50 p-2 rounded text-[10px] space-y-1">
                <div><strong>{t("algorithm.fusionMethodLabel")}:</strong> {stats.fusionMethod === 'semantic_only' ? t("algorithm.scenarioSemanticOnly") : t("algorithm.weightedCombinationMethod")}</div>
                <div><strong>{t("algorithm.fusionWeightsLabel")}:</strong> {t("algorithm.semantic")} {stats.fusionWeights.semantic}, {t("algorithm.keyword")} {stats.fusionWeights.keyword}</div>
                <div><strong>Keyword Engine:</strong> {stats.keywordEngine} (BM25 k1={stats.bm25Params.k1}, b={stats.bm25Params.b})</div>
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
          <div className="mt-3 space-y-3 text-muted-foreground">
            <div className="space-y-2">
              <p className="font-medium text-foreground">Standard Search</p>
              <p className="text-[10px]">
                Uses RRF (Reciprocal Rank Fusion) for final ranking. RRF combines semantic and keyword
                search signals into a unified ranking score, providing fast and accurate results without
                additional processing.
              </p>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-foreground">Refine Search (Unified Reranking)</p>
              <p className="text-[10px]">
                After query expansion and multi-query retrieval, all results (books, Quran, hadith) are
                combined into a single list and sent to an LLM reranker. The reranker evaluates relevance
                across all content types simultaneously, enabling it to properly prioritize primary sources
                when the query is looking for a specific verse or hadith.
              </p>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-foreground">Document Formatting for Reranker</p>
              <p className="text-[10px]">Each document is prefixed with its type for context:</p>
              <ul className="list-disc list-inside text-[10px] space-y-1 mr-4">
                <li><strong>[BOOK]</strong> {t("algorithm.rerankBookFormat")}</li>
                <li><strong>[QURAN]</strong> {t("algorithm.rerankQuranFormat")}</li>
                <li><strong>[HADITH]</strong> {t("algorithm.rerankHadithFormat")}</li>
              </ul>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-foreground">Ranking Priority</p>
              <ol className="list-decimal list-inside text-[10px] space-y-1 mr-4">
                <li><strong>Source lookup:</strong> When searching for a named verse or hadith, the actual source ranks highest</li>
                <li><strong>Questions:</strong> Documents that directly answer the question rank highest</li>
                <li><strong>Topic search:</strong> Primary sources and detailed discussions rank by relevance</li>
              </ol>
            </div>

            <div className="space-y-1 bg-muted/50 p-2 rounded text-[10px]">
              <p><strong>{t("algorithm.queryExpansion")}:</strong> {stats.queryExpansionModel || t("algorithm.none")}</p>
              <p><strong>{t("algorithm.currentReranker")}:</strong> {stats.rerankerModel || t("algorithm.none")} (refine mode only)</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
