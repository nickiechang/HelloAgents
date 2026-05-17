/**
 * Qdrant 向量資料庫儲存實作
 *
 * 提供向量的新增、相似搜尋、刪除等操作，支援：
 * - 向量新增與批次插入
 * - 基於餘弦 / 點積 / 歐氏距離的相似搜尋
 * - 中繼資料過濾
 * - 集合管理與健康檢查
 *
 * 簡化的記憶體實作（Python 版本使用 qdrant-client 連接真實 Qdrant 服務）
 */

import { randomUUID } from 'crypto';

/**
 * Qdrant 向量資料庫儲存
 *
 * 記憶體模擬實作：使用陣列儲存向量，暴力搜尋計算餘弦相似度。
 * 介面對齊 Python 版 QdrantVectorStore。
 */
export class QdrantVectorStore {
  /**
   * 初始化 Qdrant 向量儲存
   *
   * @param {Object} opts
   * @param {string|null} opts.url - Qdrant 雲端服務 URL（null 則使用記憶體模擬）
   * @param {string|null} opts.apiKey - Qdrant 雲端服務 API 金鑰
   * @param {string} opts.collectionName - 集合名稱
   * @param {number} opts.vectorSize - 向量維度
   * @param {string} opts.distance - 距離度量方式（cosine / dot / euclidean）
   * @param {number} opts.timeout - 連線逾時時間（秒）
   */
  constructor({
    url = null,
    apiKey = null,
    collectionName = 'hello_agents_vectors',
    vectorSize = 384,
    distance = 'cosine',
    timeout = 30,
  } = {}) {
    this.url = url;
    this.apiKey = apiKey;
    this.collectionName = collectionName;
    this.vectorSize = vectorSize;
    this.distance = distance;
    this.timeout = timeout;

    /** @type {Array<{id: string, vector: number[], payload: Object}>} 向量點儲存 */
    this._points = [];

    console.log(
      `✅ QdrantVectorStore 記憶體模擬已初始化: 集合=${collectionName}, 維度=${vectorSize}, 距離=${distance}`
    );
  }

  /**
   * 新增向量到集合
   * @param {number[][]} vectors - 向量列表
   * @param {Object[]} metadata - 中繼資料列表
   * @param {string[]|null} ids - 可選的 ID 列表
   * @returns {boolean} 是否成功
   */
  addVectors(vectors, metadata, ids = null) {
    if (!vectors || !vectors.length) {
      console.warn('⚠️ 向量列表為空');
      return false;
    }

    const generatedIds = ids || vectors.map((_, i) => randomUUID());
    let addedCount = 0;

    for (let i = 0; i < vectors.length; i++) {
      const vector = vectors[i];
      if (!vector || vector.length !== this.vectorSize) {
        console.warn(`⚠️ 向量維度不匹配: 期望${this.vectorSize}, 實際${vector ? vector.length : 0}`);
        continue;
      }

      const payload = { ...(metadata[i] || {}) };
      payload.timestamp = payload.timestamp || Math.floor(Date.now() / 1000);
      payload.addedAt = Math.floor(Date.now() / 1000);

      this._points.push({
        id: generatedIds[i],
        vector,
        payload,
      });
      addedCount++;
    }

    console.log(`✅ 成功新增 ${addedCount} 個向量到集合 ${this.collectionName}`);
    return addedCount > 0;
  }

  /**
   * 搜尋相似向量
   * @param {number[]} queryVector - 查詢向量
   * @param {number} limit - 回傳結果數量限制
   * @param {number|null} scoreThreshold - 相似度閾值
   * @param {Object|null} where - 過濾條件
   * @returns {Object[]} 搜尋結果
   */
  searchSimilar(queryVector, limit = 10, scoreThreshold = null, where = null) {
    if (!queryVector || queryVector.length !== this.vectorSize) {
      console.error(`❌ 查詢向量維度錯誤: 期望${this.vectorSize}, 實際${queryVector ? queryVector.length : 0}`);
      return [];
    }

    // 過濾候選點
    let candidates = this._points;
    if (where) {
      candidates = candidates.filter(point => {
        for (const [key, value] of Object.entries(where)) {
          if (point.payload[key] !== value) return false;
        }
        return true;
      });
    }

    // 計算相似度並排序
    const scored = candidates.map(point => ({
      id: point.id,
      score: this._calculateSimilarity(queryVector, point.vector),
      metadata: point.payload,
    }));

    // 按分數降序排列
    scored.sort((a, b) => b.score - a.score);

    // 套用閾值過濾
    let results = scored;
    if (scoreThreshold != null) {
      results = results.filter(r => r.score >= scoreThreshold);
    }

    return results.slice(0, limit);
  }

  /**
   * 刪除向量
   * @param {string[]} ids - 要刪除的向量 ID 列表
   * @returns {boolean}
   */
  deleteVectors(ids) {
    if (!ids || !ids.length) return true;
    const idSet = new Set(ids);
    const before = this._points.length;
    this._points = this._points.filter(p => !idSet.has(p.id));
    const deleted = before - this._points.length;
    console.log(`✅ 成功刪除 ${deleted} 個向量`);
    return true;
  }

  /**
   * 依記憶ID刪除向量（透過 payload 中的 memory_id 過濾）
   * @param {string[]} memoryIds - 記憶ID列表
   */
  deleteMemories(memoryIds) {
    if (!memoryIds || !memoryIds.length) return;
    const idSet = new Set(memoryIds);
    const before = this._points.length;
    this._points = this._points.filter(p => !idSet.has(p.payload.memory_id));
    const deleted = before - this._points.length;
    console.log(`✅ 成功按 memory_id 刪除 ${deleted} 個向量`);
  }

  /**
   * 清空集合
   * @returns {boolean}
   */
  clearCollection() {
    this._points = [];
    console.log(`✅ 成功清空集合: ${this.collectionName}`);
    return true;
  }

  /**
   * 獲取集合資訊
   * @returns {Object}
   */
  getCollectionInfo() {
    return {
      name: this.collectionName,
      vectorsCount: this._points.length,
      pointsCount: this._points.length,
      config: {
        vectorSize: this.vectorSize,
        distance: this.distance,
      },
    };
  }

  /**
   * 獲取集合統計資訊（相容抽象介面）
   * @returns {Object}
   */
  getCollectionStats() {
    const info = this.getCollectionInfo();
    info.storeType = 'qdrant_in_memory';
    return info;
  }

  /**
   * 健康檢查
   * @returns {boolean}
   */
  healthCheck() {
    // 記憶體模擬始終可用
    return true;
  }

  // ─── 私有方法 ───

  /**
   * 計算兩個向量的相似度
   * @param {number[]} a
   * @param {number[]} b
   * @returns {number} 相似度分數
   */
  _calculateSimilarity(a, b) {
    if (this.distance === 'cosine') return this._cosineSimilarity(a, b);
    if (this.distance === 'dot') return this._dotProduct(a, b);
    if (this.distance === 'euclidean') {
      // 歐氏距離轉相似度：1 / (1 + distance)
      return 1 / (1 + this._euclideanDistance(a, b));
    }
    return this._cosineSimilarity(a, b);
  }

  /**
   * 餘弦相似度
   * @param {number[]} a
   * @param {number[]} b
   * @returns {number}
   */
  _cosineSimilarity(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    return (normA === 0 || normB === 0) ? 0 : dot / (normA * normB);
  }

  /**
   * 點積
   * @param {number[]} a
   * @param {number[]} b
   * @returns {number}
   */
  _dotProduct(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
    return sum;
  }

  /**
   * 歐氏距離
   * @param {number[]} a
   * @param {number[]} b
   * @returns {number}
   */
  _euclideanDistance(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const d = a[i] - b[i];
      sum += d * d;
    }
    return Math.sqrt(sum);
  }
}

/**
 * Qdrant 連線管理器 — 單例模式
 *
 * 防止重複連線和初始化，同一組 (url, collectionName) 只建立一個實例。
 */
export class QdrantConnectionManager {
  /** @type {Map<string, QdrantVectorStore>} */
  static _instances = new Map();

  /**
   * 獲取或建立 Qdrant 實例（單例模式）
   * @param {Object} opts
   * @param {string|null} opts.url
   * @param {string|null} opts.apiKey
   * @param {string} opts.collectionName
   * @param {number} opts.vectorSize
   * @param {string} opts.distance
   * @param {number} opts.timeout
   * @returns {QdrantVectorStore}
   */
  static getInstance({
    url = null,
    apiKey = null,
    collectionName = 'hello_agents_vectors',
    vectorSize = 384,
    distance = 'cosine',
    timeout = 30,
  } = {}) {
    const key = `${url || 'local'}_${collectionName}`;
    if (!this._instances.has(key)) {
      this._instances.set(
        key,
        new QdrantVectorStore({ url, apiKey, collectionName, vectorSize, distance, timeout }),
      );
    }
    return this._instances.get(key);
  }
}
