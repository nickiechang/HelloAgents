/**
 * RAG（檢索增強生成）模組
 *
 * 合併了 GraphRAG 能力：
 * - loader：檔案載入 / 分塊（含標題感知、語言標註、去重）
 * - embedding：嵌入（由上層 memory/embedding.js 提供）
 * - vector search：向量召回
 * - rank / merge：融合排序與片段合併
 * - graph signals：同文件密度 + 鄰近度計算
 */

export { Document, DocumentChunk, DocumentProcessor, loadTextFile, createDocument } from './document.js';
export {
  RAGPipeline,
  loadAndChunkTexts,
  buildGraphFromChunks,
  indexChunks,
  embedQuery,
  searchVectors,
  searchVectorsExpanded,
  rank,
  mergeSnippets,
  mergeSnippetsGrouped,
  rerankWithCrossEncoder,
  expandNeighborsFromPool,
  computeGraphSignalsFromPool,
  compressRankedItems,
  tldrSummarize,
  createRagPipeline,
} from './pipeline.js';
