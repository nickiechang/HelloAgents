/**
 * 文件處理模組
 *
 * 提供 RAG 管線所需的文件與文件區塊資料結構，以及文件處理器：
 * - Document：原始文件
 * - DocumentChunk：分割後的文件區塊
 * - DocumentProcessor：負責分割、合併、過濾區塊
 */

import { createHash } from 'crypto';

/**
 * 文件類別
 */
export class Document {
  /**
   * @param {Object} opts
   * @param {string} opts.content - 文件內容
   * @param {Object} opts.metadata - 中繼資料
   * @param {string|null} opts.docId - 文件ID（未提供則基於內容雜湊產生）
   */
  constructor({ content, metadata = {}, docId = null }) {
    this.content = content;
    this.metadata = metadata;
    this.docId = docId || createHash('md5').update(content).digest('hex');
  }
}

/**
 * 文件區塊類別
 */
export class DocumentChunk {
  /**
   * @param {Object} opts
   * @param {string} opts.content - 區塊內容
   * @param {Object} opts.metadata - 中繼資料
   * @param {string|null} opts.chunkId - 區塊ID
   * @param {string|null} opts.docId - 所屬文件ID
   * @param {number} opts.chunkIndex - 區塊索引
   */
  constructor({ content, metadata = {}, chunkId = null, docId = null, chunkIndex = 0 }) {
    this.content = content;
    this.metadata = metadata;
    this.docId = docId;
    this.chunkIndex = chunkIndex;
    this.chunkId = chunkId || createHash('md5')
      .update(`${docId}_${chunkIndex}_${content.slice(0, 50)}`)
      .digest('hex');
  }
}

/**
 * 文件處理器
 *
 * 負責將文件分割成區塊，支援自訂分隔符號和重疊。
 */
export class DocumentProcessor {
  /**
   * @param {Object} opts
   * @param {number} opts.chunkSize - 區塊大小（字元數）
   * @param {number} opts.chunkOverlap - 區塊重疊字元數
   * @param {string[]|null} opts.separators - 分隔符號列表（優先順序由高到低）
   */
  constructor({ chunkSize = 1000, chunkOverlap = 200, separators = null } = {}) {
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
    this.separators = separators || ['\n\n', '\n', '。', '. ', ' '];
  }

  /**
   * 處理單一文件，分割成區塊
   * @param {Document} document - 輸入文件
   * @returns {DocumentChunk[]} 文件區塊列表
   */
  processDocument(document) {
    const chunks = this._splitText(document.content);
    return chunks.map((text, i) => {
      const chunkMeta = { ...document.metadata };
      chunkMeta.doc_id = document.docId;
      chunkMeta.chunk_index = i;
      chunkMeta.total_chunks = chunks.length;
      chunkMeta.processed_at = new Date().toISOString();

      return new DocumentChunk({
        content: text,
        metadata: chunkMeta,
        docId: document.docId,
        chunkIndex: i,
      });
    });
  }

  /**
   * 批次處理多個文件
   * @param {Document[]} documents - 文件列表
   * @returns {DocumentChunk[]} 所有文件區塊列表
   */
  processDocuments(documents) {
    const allChunks = [];
    for (const doc of documents) {
      allChunks.push(...this.processDocument(doc));
    }
    return allChunks;
  }

  /**
   * 合併小的文件區塊
   * @param {DocumentChunk[]} chunks - 文件區塊列表
   * @param {number} maxLength - 合併後的最大長度
   * @returns {DocumentChunk[]}
   */
  mergeChunks(chunks, maxLength = 2000) {
    if (!chunks.length) return [];

    const merged = [];
    let current = chunks[0];

    for (let i = 1; i < chunks.length; i++) {
      const next = chunks[i];
      const combinedLength = current.content.length + next.content.length;

      if (combinedLength <= maxLength && current.docId === next.docId) {
        current = new DocumentChunk({
          content: current.content + '\n' + next.content,
          metadata: {
            ...current.metadata,
            total_chunks: (current.metadata.total_chunks || 1) + 1,
          },
          docId: current.docId,
          chunkIndex: current.chunkIndex,
        });
      } else {
        merged.push(current);
        current = next;
      }
    }
    merged.push(current);
    return merged;
  }

  /**
   * 過濾太短的文件區塊
   * @param {DocumentChunk[]} chunks
   * @param {number} minLength - 最小長度
   * @returns {DocumentChunk[]}
   */
  filterChunks(chunks, minLength = 50) {
    return chunks.filter(ch => ch.content.trim().length >= minLength);
  }

  /**
   * 為文件區塊新增額外中繼資料
   * @param {DocumentChunk[]} chunks
   * @param {Object} metadata
   * @returns {DocumentChunk[]}
   */
  addChunkMetadata(chunks, metadata) {
    for (const ch of chunks) Object.assign(ch.metadata, metadata);
    return chunks;
  }

  // ─── 私有方法 ───

  /**
   * 分割文字為區塊
   * @param {string} text
   * @returns {string[]}
   */
  _splitText(text) {
    if (text.length <= this.chunkSize) return [text];

    const chunks = [];
    let start = 0;

    while (start < text.length) {
      let end = Math.min(start + this.chunkSize, text.length);

      if (end < text.length) {
        // 尋找合適的分割點
        const splitPoint = this._findSplitPoint(text, start, end);
        if (splitPoint !== -1) end = splitPoint;
      }

      chunks.push(text.slice(start, end));

      // 計算下一個區塊的開始位置（考慮重疊）
      start = Math.max(start + 1, end - this.chunkOverlap);
    }

    return chunks;
  }

  /**
   * 在指定範圍內尋找最佳分割點
   * @param {string} text
   * @param {number} start
   * @param {number} end
   * @returns {number} 分割點位置，-1 表示未找到
   */
  _findSplitPoint(text, start, end) {
    const searchStart = Math.max(start, end - 100);

    for (const sep of this.separators) {
      for (let i = end - sep.length; i >= searchStart; i--) {
        if (text.slice(i, i + sep.length) === sep) {
          return i + sep.length;
        }
      }
    }
    return -1;
  }
}

/**
 * 載入文字檔為文件（便捷函式）
 * @param {string} filePath - 檔案路徑
 * @param {string} encoding - 檔案編碼
 * @returns {Document}
 */
export function loadTextFile(filePath, encoding = 'utf-8') {
  const { readFileSync } = await import('fs');
  const content = readFileSync(filePath, encoding);
  return new Document({
    content,
    metadata: {
      source: filePath,
      type: 'text_file',
      loadedAt: new Date().toISOString(),
    },
  });
}

/**
 * 建立文件的便捷函式
 * @param {string} content - 文件內容
 * @param {Object} metadata - 中繼資料
 * @returns {Document}
 */
export function createDocument(content, metadata = {}) {
  return new Document({ content, metadata });
}
