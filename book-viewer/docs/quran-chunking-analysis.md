# Quran Ayah Chunking Strategy Analysis

## Executive Summary

**Conclusion: Per-ayah embeddings outperform chunked embeddings for most Quran search queries.**

The smart chunking strategy was tested against the original per-ayah approach, and the results showed that chunking actually **decreases** search quality for 85% of test queries. The chunking approach is only beneficial for queries that span multiple consecutive ayahs.

## Test Results

### Collection Statistics
- Per-ayah: 6,236 vectors (one per ayah)
- Chunked: 4,990 vectors (20% reduction)
  - Standalone (1-ayah): 2,080 chunks
  - Pairs (2-ayah): 1,691 chunks
  - Triplets (3-ayah): 1,219 chunks
  - Average words/chunk: 23

### Search Quality Comparison (13 queries tested)

| Metric | Per-Ayah | Chunked | Difference |
|--------|----------|---------|------------|
| Average Top Score | 0.8433 | 0.7891 | -6.4% |
| Queries Won | 11 (85%) | 1 (8%) | - |
| Same Performance | - | 1 (8%) | - |

### By Query Type

| Query Type | Per-Ayah Avg | Chunked Avg | Chunked Improvement |
|------------|--------------|-------------|---------------------|
| Arabic exact phrases | 0.911 | 0.828 | -0.083 (worse) |
| Thematic queries | 0.802 | 0.766 | -0.035 (worse) |
| Cross-lingual (EN→AR) | 0.706 | 0.680 | -0.027 (worse) |

### Why Chunking Performs Worse

1. **Embedding dilution**: When searching for "بسم الله الرحمن الرحيم" (Bismillah), per-ayah returns a 1.0 (perfect) score. Chunked returns 0.785 because the embedding includes additional ayahs that dilute the semantic match.

2. **Arabic text is semantically dense**: Even short Quranic ayahs like "فِى جَنَّٰتِ ٱلنَّعِيمِ" (In gardens of bliss) have complete semantic meaning. Modern embedding models (Gemini) capture this meaning well.

3. **Overlap creates redundancy**: The 1-ayah overlap between chunks creates near-duplicate embeddings that confuse ranking.

### When Chunking Helps

Chunking **only** improves results for queries that span multiple consecutive ayahs:

| Query | Per-Ayah Score | Chunked Score | Winner |
|-------|---------------|---------------|--------|
| "والعصر إن الإنسان لفي خسر" (spans 2 ayahs) | 0.816 | 0.858 | Chunked |
| "إنا أعطيناك الكوثر فصل لربك وانحر" (full surah) | 0.889 | 0.908 | Chunked |

## Hybrid Strategies Tested

| Strategy | Average Score | vs Per-Ayah |
|----------|---------------|-------------|
| per-ayah-boost (5% boost) | 0.8933 | +5.9% |
| max-score (take best) | 0.8502 | +0.8% |
| weighted (average) | 0.8502 | +0.8% |
| per-ayah (baseline) | 0.8433 | - |
| chunked | 0.7891 | -6.4% |

The "per-ayah-boost" strategy artificially inflates scores and doesn't represent real improvement.

## Recommendations

### 1. Keep Per-Ayah as Default (Implemented)
```typescript
// In app/api/search/route.ts
const USE_CHUNKED_QURAN_SEARCH = process.env.USE_CHUNKED_QURAN_SEARCH === "true";
```

### 2. Available for Experimentation
The chunked collection remains available for future experiments:
```bash
# Enable chunked search via environment variable
USE_CHUNKED_QURAN_SEARCH=true
```

### 3. Future Improvements to Consider

If chunking is revisited, consider:

1. **Semantic chunking**: Group ayahs by theme/topic rather than word count
2. **Sentence boundary detection**: Only chunk ayahs that are part of incomplete sentences
3. **Query-aware search**: Detect multi-ayah queries and use chunked collection only for those
4. **No overlap**: Remove overlap to reduce redundancy (tested config showed similar results)

### 4. Alternative Approaches

Instead of chunking, consider:
- **Reranking**: Use Qwen or Jina reranker (already implemented)
- **Hybrid search**: Combine semantic + keyword search with RRF (already implemented)
- **Cross-encoder scoring**: Re-score top results with a cross-encoder model

## Files Modified

| File | Change |
|------|--------|
| `lib/qdrant.ts` | Added `QDRANT_QURAN_CHUNKS_COLLECTION` constant |
| `scripts/generate-embeddings.ts` | Added `--quran-chunks` flag and chunking logic |
| `app/api/search/route.ts` | Added chunk search (disabled by default) |
| `components/SearchResult.tsx` | Added ayah range display support |

## Test Scripts Created

| Script | Purpose |
|--------|---------|
| `scripts/test-quran-chunking.ts` | Compares per-ayah vs chunked search |
| `scripts/test-hybrid-quran-search.ts` | Tests hybrid search strategies |
| `scripts/test-chunking-configs.ts` | Tests different threshold configurations |

## Conclusion

The original hypothesis that short ayahs need more context for meaningful embeddings was **incorrect**. Modern embedding models handle short Arabic text well. The chunking approach dilutes precision for exact matches without providing sufficient benefit for thematic queries.

**Keep per-ayah embeddings as the primary search strategy.**
