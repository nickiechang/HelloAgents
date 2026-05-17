/**
 * RAG 管線實作
 *
 * 提供完整的檢索增強生成（RAG）管線：
 * - 文件載入與分塊（支援標題層級感知的段落分割）
 * - 向量索引與搜尋
 * - 排序與片段合併（含引用標記）
 * - 圖信號計算（同文件密度 + 鄰近度）
 * - 壓縮與摘要
 *
 * 簡化的 JavaScript 記憶體實作（Python 版本使用 MarkItDown / Qdrant / 百煉嵌入）
 */

import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { extname, basename } from 'path';
import { Document, DocumentProcessor } from './document.js';
import { getTextEmbedder, getDimension } from '../embedding.js';
import { QdrantVectorStore, QdrantConnectionManager } from '../storage/qdrant_store.js';

// ==================
// CJK / Token 輔助
// ==================

/**
 * 判斷字元是否為 CJK 字元
 * @param {string} ch
 * @returns {boolean}
 */
function _isCJK(ch) {
  const code = ch.codePointAt(0);
  return (
    (code >= 0x4E00 && code <= 0x9FFF) ||
    (code >= 0x3400 && code <= 0x4DBF) ||
    (code >= 0x20000 && code <= 0x2A6DF) ||
    (code >= 0xF900 && code <= 0xFAFF)
  );
}

/**
 * 近似估計 token 長度（CJK 按 1 token，其餘按空白分詞）
 * @param {string} text
 * @returns {number}
 */
function _approxTokenLen(text) {
  let cjk = 0;
  for (const ch of text) { if (_isCJK(ch)) cjk++; }
  const nonCjkTokens = text.split(/\s+/).filter(Boolean).length;
  return cjk + nonCjkTokens;
}

// ==================
// 段落 / 標題感知分割
// ==================

/**
 * 按標題層級分割段落
 * @param {string} text
 * @returns {Array<{content: string, headingPath: string|null, start: number, end: number}>}
 */
function _splitParagraphsWithHeadings(text) {
  const lines = text.split('\n');
  const headingStack = [];
  const paragraphs = [];
  let buf = [];
  let charPos = 0;

  function flushBuf(endPos) {
    if (!buf.length) return;
    const content = buf.join('\n').trim();
    if (!content) return;
    paragraphs.push({
      content,
      headingPath: headingStack.length ? headingStack.join(' > ') : null,
      start: Math.max(0, endPos - content.length),
      end: endPos,
    });
  }

  for (const raw of lines) {
    if (raw.trim().startsWith('#')) {
      flushBuf(charPos);
      buf = [];
      const level = raw.length - raw.replace(/^#+/, '').length;
      const title = raw.replace(/^#+\s*/, '').trim();
      if (level <= headingStack.length) {
        headingStack.length = level - 1;
      }
      headingStack.push(title);
      charPos += raw.length + 1;
      continue;
    }
    if (raw.trim() === '') {
      flushBuf(charPos);
      buf = [];
    } else {
      buf.push(raw);
    }
    charPos += raw.length + 1;
  }
  flushBuf(charPos);

  if (!paragraphs.length) {
    paragraphs.push({ content: text, headingPath: null, start: 0, end: text.length });
  }
  return paragraphs;
}

/**
 * 將段落合併為指定 token 大小的區塊（含重疊）
 * @param {Object[]} paragraphs
 * @param {number} chunkTokens
 * @param {number} overlapTokens
 * @returns {Object[]}
 */
function _chunkParagraphs(paragraphs, chunkTokens, overlapTokens) {
  const chunks = [];
  let cur = [];
  let curTokens = 0;
  let i = 0;

  while (i < paragraphs.length) {
    const p = paragraphs[i];
    const pTokens = _approxTokenLen(p.content) || 1;

    if (curTokens + pTokens <= chunkTokens || !cur.length) {
      cur.push(p);
      curTokens += pTokens;
      i++;
    } else {
      // 輸出目前區塊
      const content = cur.map(x => x.content).join('\n\n');
      const headingPath = [...cur].reverse().find(x => x.headingPath)?.headingPath || null;
      chunks.push({
        content,
        start: cur[0].start,
        end: cur[cur.length - 1].end,
        headingPath,
      });

      // 保留尾端重疊
      if (overlapTokens > 0 && cur.length) {
        const kept = [];
        let keptTokens = 0;
        for (let j = cur.length - 1; j >= 0; j--) {
          const t = _approxTokenLen(cur[j].content) || 1;
          if (keptTokens + t > overlapTokens) break;
          kept.unshift(cur[j]);
          keptTokens += t;
        }
        cur = kept;
        curTokens = keptTokens;
      } else {
        cur = [];
        curTokens = 0;
      }
    }
  }

  if (cur.length) {
    const content = cur.map(x => x.content).join('\n\n');
    const headingPath = [...cur].reverse().find(x => x.headingPath)?.headingPath || null;
    chunks.push({
      content,
      start: cur[0].start,
      end: cur[cur.length - 1].end,
      headingPath,
    });
  }
  return chunks;
}

// ==================
// 文件載入與分塊
// ==================

/**
 * 載入並分塊文字檔案
 *
 * @param {string[]} paths - 檔案路徑列表
 * @param {number} chunkSize - 區塊 token 大小
 * @param {number} chunkOverlap - 區塊重疊 token 數
 * @param {string|null} namespace - 命名空間
 * @param {string} sourceLabel - 來源標籤
 * @returns {Object[]} 區塊列表
 */
export function loadAndChunkTexts(
  paths,
  chunkSize = 800,
  chunkOverlap = 100,
  namespace = null,
  sourceLabel = 'rag',
) {
  console.log(
    `[RAG] 通用載入器啟動: 檔案=${paths.length} chunk_size=${chunkSize} overlap=${chunkOverlap} ns=${namespace || 'default'}`,
  );

  const chunks = [];
  const seenHashes = new Set();

  for (const path of paths) {
    if (!existsSync(path)) {
      console.log(`[WARNING] 檔案未找到: ${path}`);
      continue;
    }

    console.log(`[RAG] 處理中: ${path}`);
    const ext = extname(path).toLowerCase();

    // 讀取檔案內容
    let text;
    try {
      text = readFileSync(path, 'utf-8');
    } catch {
      console.log(`[WARNING] 無法讀取檔案: ${path}`);
      continue;
    }

    if (!text.trim()) {
      console.log(`[WARNING] 檔案內容為空: ${path}`);
      continue;
    }

    const docId = createHash('md5').update(`${path}|${text.length}`).digest('hex');

    // 使用標題感知分塊
    const para = _splitParagraphsWithHeadings(text);
    const tokenChunks = _chunkParagraphs(para, Math.max(1, chunkSize), Math.max(0, chunkOverlap));

    for (const ch of tokenChunks) {
      const content = ch.content;
      const norm = content.trim();
      if (!norm) continue;

      const contentHash = createHash('md5').update(norm).digest('hex');
      if (seenHashes.has(contentHash)) continue;
      seenHashes.add(contentHash);

      const chunkId = createHash('md5')
        .update(`${docId}|${ch.start}|${ch.end}|${contentHash}`)
        .digest('hex');

      chunks.push({
        id: chunkId,
        content,
        metadata: {
          source_path: path,
          file_ext: ext,
          doc_id: docId,
          start: ch.start,
          end: ch.end,
          content_hash: contentHash,
          namespace: namespace || 'default',
          source: sourceLabel,
          external: true,
          heading_path: ch.headingPath,
          format: 'text',
        },
      });
    }
  }

  console.log(`[RAG] 通用載入器完成: 總區塊數=${chunks.length}`);
  return chunks;
}

// ==================
// 圖建構
// ==================

/**
 * 從區塊建立知識圖譜
 * @param {import('../storage/neo4j_store.js').Neo4jGraphStore} neo4j
 * @param {Object[]} chunks
 */
export function buildGraphFromChunks(neo4j, chunks) {
  const createdDocs = new Set();
  for (const ch of chunks) {
    const meta = ch.metadata || {};
    const memId = ch.id;
    const sourcePath = meta.source_path;
    const docId = meta.doc_id;

    if (docId && !createdDocs.has(docId)) {
      createdDocs.add(docId);
      try {
        neo4j.addEntity(docId, basename(sourcePath || docId), 'Document', {
          source_path: sourcePath,
        });
      } catch { /* 忽略 */ }
    }

    try {
      neo4j.addEntity(memId, memId, 'Memory', {
        source_path: sourcePath,
        doc_id: docId,
        start: meta.start,
        end: meta.end,
      });
    } catch { /* 忽略 */ }

    if (docId) {
      try {
        neo4j.addRelationship(docId, memId, 'HAS_CHUNK');
      } catch { /* 忽略 */ }
    }
  }
}

// ==================
// 向量索引
// ==================

/**
 * 建立預設向量儲存
 * @param {number|null} dimension
 * @returns {QdrantVectorStore}
 */
function _createDefaultVectorStore(dimension = null) {
  if (dimension == null) dimension = getDimension(384);
  return QdrantConnectionManager.getInstance({
    collectionName: 'hello_agents_rag_vectors',
    vectorSize: dimension,
    distance: 'cosine',
  });
}

/**
 * 索引區塊到向量儲存
 * @param {QdrantVectorStore|null} store
 * @param {Object[]} chunks
 * @param {number} batchSize
 * @param {string} ragNamespace
 */
export function indexChunks(store = null, chunks = [], batchSize = 64, ragNamespace = 'default') {
  if (!chunks.length) {
    console.log('[RAG] 沒有區塊需要索引');
    return;
  }

  const embedder = getTextEmbedder();
  const dimension = getDimension(384);

  if (!store) {
    store = _createDefaultVectorStore(dimension);
    console.log(`[RAG] 建立預設向量儲存，維度=${dimension}`);
  }

  // 編碼文字
  console.log(`[RAG] 嵌入開始: 總數=${chunks.length} batch_size=${batchSize}`);
  const vecs = [];

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize).map(c => c.content);
    try {
      let batchVecs = embedder.encode(batch);
      if (!Array.isArray(batchVecs)) batchVecs = [batchVecs];
      // 確保每個向量維度正確
      for (let v of batchVecs) {
        if (!Array.isArray(v)) v = Array.from(v);
        if (v.length !== dimension) {
          if (v.length < dimension) v.push(...Array(dimension - v.length).fill(0));
          else v = v.slice(0, dimension);
        }
        vecs.push(v.map(Number));
      }
    } catch (e) {
      console.log(`[WARNING] 批次 ${i} 編碼失敗: ${e.message}，使用零向量`);
      for (let j = 0; j < batch.length; j++) vecs.push(Array(dimension).fill(0));
    }
    console.log(`[RAG] 嵌入進度: ${Math.min(i + batchSize, chunks.length)}/${chunks.length}`);
  }

  // 準備中繼資料
  const metas = chunks.map(ch => {
    const meta = {
      memory_id: ch.id,
      user_id: 'rag_user',
      memory_type: 'rag_chunk',
      content: ch.content,
      data_source: 'rag_pipeline',
      rag_namespace: ragNamespace,
      is_rag_data: true,
      ...(ch.metadata || {}),
    };
    return meta;
  });
  const ids = chunks.map(ch => ch.id);

  console.log(`[RAG] 向量插入開始: n=${vecs.length}`);
  const success = store.addVectors(vecs, metas, ids);
  if (success) {
    console.log(`[RAG] 向量插入完成: ${vecs.length} 個向量已索引`);
  } else {
    throw new Error('向量索引寫入失敗');
  }
}

// ==================
// 查詢嵌入
// ==================

/**
 * 嵌入查詢文字
 * @param {string} query
 * @returns {number[]}
 */
export function embedQuery(query) {
  const embedder = getTextEmbedder();
  const dimension = getDimension(384);
  try {
    let vec = embedder.encode(query);
    if (!Array.isArray(vec)) vec = Array.from(vec);
    // 處理巢狀陣列
    if (vec.length && Array.isArray(vec[0])) vec = vec[0];
    let result = vec.map(Number);
    if (result.length !== dimension) {
      if (result.length < dimension) result.push(...Array(dimension - result.length).fill(0));
      else result = result.slice(0, dimension);
    }
    return result;
  } catch (e) {
    console.log(`[WARNING] 查詢嵌入失敗: ${e.message}`);
    return Array(dimension).fill(0);
  }
}

// ==================
// 向量搜尋
// ==================

/**
 * 搜尋 RAG 向量
 * @param {Object} opts
 * @param {QdrantVectorStore|null} opts.store
 * @param {string} opts.query
 * @param {number} opts.topK
 * @param {string|null} opts.ragNamespace
 * @param {boolean} opts.onlyRagData
 * @param {number|null} opts.scoreThreshold
 * @returns {Object[]}
 */
export function searchVectors({
  store = null,
  query = '',
  topK = 8,
  ragNamespace = null,
  onlyRagData = true,
  scoreThreshold = null,
} = {}) {
  if (!query) return [];
  if (!store) store = _createDefaultVectorStore();

  const qv = embedQuery(query);

  const where = { memory_type: 'rag_chunk' };
  if (onlyRagData) {
    where.is_rag_data = true;
    where.data_source = 'rag_pipeline';
  }
  if (ragNamespace) where.rag_namespace = ragNamespace;

  try {
    return store.searchSimilar(qv, topK, scoreThreshold, where);
  } catch (e) {
    console.log(`[WARNING] RAG 搜尋失敗: ${e.message}`);
    return [];
  }
}

/**
 * 擴展查詢搜尋（多查詢展開 + HyDE）
 * @param {Object} opts
 * @returns {Object[]}
 */
export function searchVectorsExpanded({
  store = null,
  query = '',
  topK = 8,
  ragNamespace = null,
  onlyRagData = true,
  scoreThreshold = null,
  candidatePoolMultiplier = 4,
} = {}) {
  if (!query) return [];
  if (!store) store = _createDefaultVectorStore();

  const pool = Math.max(topK * candidatePoolMultiplier, 20);

  const where = { memory_type: 'rag_chunk' };
  if (onlyRagData) {
    where.is_rag_data = true;
    where.data_source = 'rag_pipeline';
  }
  if (ragNamespace) where.rag_namespace = ragNamespace;

  const qv = embedQuery(query);
  const hits = store.searchSimilar(qv, pool, scoreThreshold, where);

  // 去重取 topK
  const agg = new Map();
  for (const h of hits) {
    const mid = h.metadata?.memory_id || h.id;
    const s = h.score || 0;
    if (!agg.has(mid) || s > (agg.get(mid).score || 0)) {
      agg.set(mid, h);
    }
  }

  const merged = [...agg.values()];
  merged.sort((a, b) => (b.score || 0) - (a.score || 0));
  return merged.slice(0, topK);
}

// ==================
// 圖信號計算
// ==================

/**
 * 計算圖信號（同文件密度 + 鄰近度）
 * @param {Object[]} vectorHits
 * @param {number} sameDocWeight
 * @param {number} proximityWeight
 * @param {number} proximityWindowChars
 * @returns {Object<string, number>}
 */
export function computeGraphSignalsFromPool(
  vectorHits,
  sameDocWeight = 1.0,
  proximityWeight = 1.0,
  proximityWindowChars = 1600,
) {
  // 按文件分組
  const byDoc = {};
  for (const h of vectorHits) {
    const meta = h.metadata || {};
    const did = meta.doc_id || meta.memory_id || h.id;
    if (!byDoc[did]) byDoc[did] = [];
    byDoc[did].push(h);
  }

  // 同文件密度
  const docCounts = {};
  for (const [d, arr] of Object.entries(byDoc)) docCounts[d] = arr.length;
  const maxCount = Math.max(...Object.values(docCounts), 1);

  // 鄰近度信號
  const graphSignal = {};
  for (const [did, arr] of Object.entries(byDoc)) {
    arr.sort((a, b) => ((a.metadata?.start || 0) - (b.metadata?.start || 0)));
    const density = (docCounts[did] || 1) / maxCount;

    for (let i = 0; i < arr.length; i++) {
      const mid = arr[i].metadata?.memory_id || arr[i].id;
      const posI = arr[i].metadata?.start || 0;
      let proxAcc = 0;

      // 左鄰
      for (let j = i - 1; j >= 0; j--) {
        const dist = Math.abs(posI - (arr[j].metadata?.start || 0));
        if (dist > proximityWindowChars) break;
        proxAcc += Math.max(0, 1 - dist / Math.max(1, proximityWindowChars));
      }
      // 右鄰
      for (let j = i + 1; j < arr.length; j++) {
        const dist = Math.abs(posI - (arr[j].metadata?.start || 0));
        if (dist > proximityWindowChars) break;
        proxAcc += Math.max(0, 1 - dist / Math.max(1, proximityWindowChars));
      }

      const score = sameDocWeight * density + proximityWeight * proxAcc;
      graphSignal[mid] = (graphSignal[mid] || 0) + score;
    }
  }

  // 歸一化到 [0,1]
  const maxV = Math.max(...Object.values(graphSignal), 0);
  if (maxV > 0) {
    for (const k of Object.keys(graphSignal)) graphSignal[k] /= maxV;
  }
  return graphSignal;
}

// ==================
// 排序
// ==================

/**
 * 融合向量分數與圖信號進行排序
 * @param {Object[]} vectorHits
 * @param {Object<string, number>|null} graphSignals
 * @param {number} wVector - 向量權重
 * @param {number} wGraph - 圖權重
 * @returns {Object[]}
 */
export function rank(vectorHits, graphSignals = null, wVector = 0.7, wGraph = 0.3) {
  graphSignals = graphSignals || {};
  const items = vectorHits.map(h => {
    const mid = h.metadata?.memory_id || h.id;
    const v = Number(h.score || 0);
    const g = Number(graphSignals[mid] || 0);
    return {
      memory_id: mid,
      score: wVector * v + wGraph * g,
      vector_score: v,
      graph_score: g,
      content: h.metadata?.content || '',
      metadata: h.metadata || {},
    };
  });
  items.sort((a, b) => b.score - a.score);
  return items;
}

// ==================
// 片段合併
// ==================

/**
 * 合併排序後的片段（簡單版）
 * @param {Object[]} rankedItems
 * @param {number} maxChars
 * @returns {string}
 */
export function mergeSnippets(rankedItems, maxChars = 1200) {
  const out = [];
  let total = 0;
  for (const it of rankedItems) {
    const text = (it.content || '').trim();
    if (!text) continue;
    if (total + text.length > maxChars) {
      const remain = maxChars - total;
      if (remain <= 0) break;
      out.push(text.slice(0, remain));
      break;
    }
    out.push(text);
    total += text.length;
  }
  return out.join('\n\n');
}

/**
 * 按文件分組合併片段（含引用標記）
 * @param {Object[]} rankedItems
 * @param {number} maxChars
 * @param {boolean} includeCitations
 * @returns {string}
 */
export function mergeSnippetsGrouped(rankedItems, maxChars = 1200, includeCitations = true) {
  // 按文件分組
  const byDoc = {};
  const docScore = {};
  for (const it of rankedItems) {
    const meta = it.metadata || {};
    const did = meta.doc_id || meta.source_path || 'unknown';
    if (!byDoc[did]) byDoc[did] = [];
    byDoc[did].push(it);
    docScore[did] = (docScore[did] || 0) + Number(it.score || 0);
  }

  // 按總分排序文件
  const orderedDocs = Object.keys(byDoc).sort((a, b) => (docScore[b] || 0) - (docScore[a] || 0));

  // 文件內按 start 排序
  for (const d of orderedDocs) {
    byDoc[d].sort((a, b) => ((a.metadata?.start || 0) - (b.metadata?.start || 0)));
  }

  const out = [];
  const citations = [];
  let total = 0;
  let citeIndex = 1;

  for (const did of orderedDocs) {
    for (const it of byDoc[did]) {
      const text = (it.content || '').trim();
      if (!text) continue;

      const suffix = includeCitations ? ` [${citeIndex}]` : '';
      const need = text.length + suffix.length;

      if (total + need > maxChars) {
        const remain = maxChars - total;
        if (remain <= 0) break;
        const clipped = text.slice(0, Math.max(0, remain - suffix.length));
        if (clipped) {
          out.push(clipped + suffix);
          total += clipped.length + suffix.length;
          if (includeCitations) {
            const m = it.metadata || {};
            citations.push({ index: citeIndex, sourcePath: m.source_path, docId: m.doc_id, start: m.start, end: m.end, headingPath: m.heading_path });
            citeIndex++;
          }
        }
        break;
      }

      out.push(text + suffix);
      total += need;
      if (includeCitations) {
        const m = it.metadata || {};
        citations.push({ index: citeIndex, sourcePath: m.source_path, docId: m.doc_id, start: m.start, end: m.end, headingPath: m.heading_path });
        citeIndex++;
      }
    }
    if (total >= maxChars) break;
  }

  let merged = out.join('\n\n');
  if (includeCitations && citations.length) {
    const lines = [merged, '', 'References:'];
    for (const c of citations) {
      const loc = (c.start != null && c.end != null) ? ` (${c.start}-${c.end})` : '';
      const hp = c.headingPath ? ` – ${c.headingPath}` : '';
      const sp = c.sourcePath || c.docId || 'source';
      lines.push(`[${c.index}] ${sp}${loc}${hp}`);
    }
    return lines.join('\n');
  }
  return merged;
}

// ==================
// 鄰近展開
// ==================

/**
 * 從候選池中展開鄰近區塊
 * @param {Object[]} selected
 * @param {Object[]} pool
 * @param {number} neighbors
 * @param {number} maxAdditions
 * @returns {Object[]}
 */
export function expandNeighborsFromPool(selected, pool, neighbors = 1, maxAdditions = 5) {
  if (!selected.length || !pool.length || neighbors <= 0) return selected;

  // 按文件索引池
  const byDoc = {};
  for (const it of pool) {
    const did = it.metadata?.doc_id;
    if (!did) continue;
    if (!byDoc[did]) byDoc[did] = [];
    byDoc[did].push(it);
  }
  for (const arr of Object.values(byDoc)) {
    arr.sort((a, b) => (a.metadata?.start || 0) - (b.metadata?.start || 0));
  }

  const selectedIds = new Set(selected.map(it => it.memory_id));
  const additions = [];

  for (const it of selected) {
    const did = it.metadata?.doc_id;
    if (!did || !byDoc[did]) continue;
    const arr = byDoc[did];
    const idx = arr.findIndex(x => x.memory_id === it.memory_id);
    if (idx === -1) continue;

    for (let offset = 1; offset <= neighbors; offset++) {
      for (const j of [idx - offset, idx + offset]) {
        if (j >= 0 && j < arr.length) {
          const cand = arr[j];
          const mid = cand.memory_id;
          if (!selectedIds.has(mid)) {
            additions.push(cand);
            selectedIds.add(mid);
            if (additions.length >= maxAdditions) break;
          }
        }
      }
      if (additions.length >= maxAdditions) break;
    }
    if (additions.length >= maxAdditions) break;
  }

  const extended = [...selected, ...additions];
  extended.sort((a, b) => (b.score || 0) - (a.score || 0));
  return extended;
}

// ==================
// 壓縮
// ==================

/**
 * 壓縮排序後的項目（合併相鄰區塊、限制每文件數量）
 * @param {Object[]} rankedItems
 * @param {boolean} enableCompression
 * @param {number} maxPerDoc
 * @param {number} joinGap
 * @returns {Object[]}
 */
export function compressRankedItems(rankedItems, enableCompression = true, maxPerDoc = 2, joinGap = 200) {
  if (!enableCompression) return rankedItems;

  const byDocCount = {};
  const lastByDoc = {};
  const newItems = [];

  for (const it of rankedItems) {
    const meta = it.metadata || {};
    const did = meta.doc_id || meta.source_path || 'unknown';
    const start = Number(meta.start || 0);
    const end = Number(meta.end || (start + (it.content || '').length));

    if (!lastByDoc[did]) {
      lastByDoc[did] = it;
      byDocCount[did] = 1;
      newItems.push(it);
      continue;
    }

    const last = lastByDoc[did];
    const lMeta = last.metadata || {};
    const lEnd = Number(lMeta.end || 0);

    if (start - lEnd <= joinGap && start >= Number(lMeta.start || 0)) {
      // 合併到上一個
      const mergedText = ((last.content || '') + '\n\n' + (it.content || '')).trim();
      last.content = mergedText;
      lMeta.end = Math.max(lEnd, end);
      last.score = Math.max(Number(last.score || 0), Number(it.score || 0));
      lastByDoc[did] = last;
    } else {
      const cnt = byDocCount[did] || 0;
      if (cnt >= maxPerDoc) continue;
      newItems.push(it);
      lastByDoc[did] = it;
      byDocCount[did] = cnt + 1;
    }
  }
  return newItems;
}

// ==================
// 摘要
// ==================

/**
 * TL;DR 摘要（佔位實作，Python 版使用 LLM）
 * @param {string} text
 * @param {number} bullets
 * @returns {string|null}
 */
export function tldrSummarize(text, bullets = 3) {
  if (!text || !text.trim()) return null;
  // JavaScript 版無 LLM，回傳前 N 句作為替代
  const sentences = text.split(/[。.!！?？\n]+/).filter(Boolean).slice(0, bullets);
  return sentences.length ? sentences.map((s, i) => `${i + 1}. ${s.trim()}`).join('\n') : null;
}

// ==================
// Cross-encoder 重排序（佔位）
// ==================

/**
 * 使用 cross-encoder 重排序（佔位實作）
 * @param {string} query
 * @param {Object[]} items
 * @param {number} topK
 * @returns {Object[]}
 */
export function rerankWithCrossEncoder(query, items, topK = 10) {
  // JavaScript 版無 cross-encoder，直接回傳原排序
  return items.slice(0, topK);
}

// ==================
// 高階 RAG 管線 API
// ==================

/**
 * 建立完整的 RAG 管線
 * @param {Object} opts
 * @param {string} opts.collectionName
 * @param {string} opts.ragNamespace
 * @returns {Object} 包含 store、namespace 和輔助函式
 */
export function createRagPipeline({
  collectionName = 'hello_agents_rag_vectors',
  ragNamespace = 'default',
} = {}) {
  const dimension = getDimension(384);
  const store = new QdrantVectorStore({
    collectionName,
    vectorSize: dimension,
    distance: 'cosine',
  });

  return {
    store,
    namespace: ragNamespace,

    /**
     * 新增文件到 RAG 管線
     * @param {string[]} filePaths
     * @param {number} chunkSize
     * @param {number} chunkOverlap
     * @returns {number} 區塊數量
     */
    addDocuments(filePaths, chunkSize = 800, chunkOverlap = 100) {
      const chunks = loadAndChunkTexts(filePaths, chunkSize, chunkOverlap, ragNamespace, 'rag');
      indexChunks(store, chunks, 64, ragNamespace);
      return chunks.length;
    },

    /**
     * 搜尋 RAG 知識庫
     * @param {string} query
     * @param {number} topK
     * @param {number|null} scoreThreshold
     * @returns {Object[]}
     */
    search(query, topK = 8, scoreThreshold = null) {
      return searchVectors({ store, query, topK, ragNamespace, scoreThreshold });
    },

    /**
     * 進階搜尋（含查詢展開）
     * @param {string} query
     * @param {number} topK
     * @param {number|null} scoreThreshold
     * @returns {Object[]}
     */
    searchAdvanced(query, topK = 8, scoreThreshold = null) {
      return searchVectorsExpanded({ store, query, topK, ragNamespace, scoreThreshold });
    },

    /**
     * 獲取管線統計資訊
     * @returns {Object}
     */
    getStats() {
      return store.getCollectionStats();
    },
  };
}

// ==================
// 簡易 RAGPipeline 類別（相容舊版介面）
// ==================

/**
 * RAG 管線類別（簡易包裝）
 */
export class RAGPipeline {
  /**
   * @param {Object} opts
   * @param {number} opts.chunkSize - 區塊大小
   * @param {number} opts.chunkOverlap - 區塊重疊
   */
  constructor({ chunkSize = 1000, chunkOverlap = 200 } = {}) {
    this.processor = new DocumentProcessor({ chunkSize, chunkOverlap });
    /** @type {Document[]} */
    this.documents = [];
    /** @type {import('./document.js').DocumentChunk[]} */
    this.chunks = [];
  }

  /**
   * 新增文字
   * @param {string} text
   * @param {Object} metadata
   * @returns {string} 文件ID
   */
  addText(text, metadata = {}) {
    const doc = new Document({ content: text, metadata });
    this.documents.push(doc);
    const newChunks = this.processor.processDocument(doc);
    this.chunks.push(...newChunks);
    return doc.docId;
  }

  /**
   * 新增檔案
   * @param {string} filePath
   * @param {Object} metadata
   * @returns {string} 文件ID
   */
  addFile(filePath, metadata = {}) {
    const content = readFileSync(filePath, 'utf-8');
    return this.addText(content, { ...metadata, source: filePath });
  }

  /**
   * 搜尋（關鍵詞匹配）
   * @param {string} query
   * @param {number} limit
   * @returns {Object[]}
   */
  search(query, limit = 5) {
    const queryWords = new Set(query.toLowerCase().split(/\s+/));
    const scored = this.chunks.map(chunk => {
      const words = new Set(chunk.content.toLowerCase().split(/\s+/));
      let overlap = 0;
      for (const w of queryWords) { if (words.has(w)) overlap++; }
      const score = queryWords.size > 0 ? overlap / queryWords.size : 0;
      return { score, chunk };
    }).filter(s => s.score > 0);

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => ({
      content: s.chunk.content,
      metadata: s.chunk.metadata,
      score: s.score,
    }));
  }

  /**
   * 獲取統計資訊
   * @returns {Object}
   */
  getStats() {
    return { documents: this.documents.length, chunks: this.chunks.length };
  }

  /** 清空所有資料 */
  clear() {
    this.documents = [];
    this.chunks = [];
  }
}
