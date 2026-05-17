/**
 * 感知記憶實作（長存的多模態）
 *
 * 按照第8章架構設計的感知記憶（長期、多模態），提供：
 * - 多模態資料儲存（文字、圖片、音訊等）
 * - 結構化中繼資料 + 關鍵詞檢索
 * - 同模態檢索
 * - 輕量編碼：文字用雜湊向量
 *
 * 簡化的記憶體實作（Python版本使用 CLIP/CLAP + Qdrant + SQLite）
 */

import { createHash } from 'crypto';
import { BaseMemory, MemoryItem } from '../base.js';

/**
 * 感知資料實體
 */
export class Perception {
  /**
   * @param {Object} opts
   * @param {string} opts.perceptionId - 感知ID
   * @param {*} opts.data - 原始資料
   * @param {string} opts.modality - 模態：text / image / audio / video / structured
   * @param {number[]} opts.encoding - 編碼向量
   * @param {Object} opts.metadata - 中繼資料
   */
  constructor({ perceptionId, data, modality, encoding = [], metadata = {} }) {
    this.perceptionId = perceptionId;
    this.data = data;
    this.modality = modality;
    this.encoding = encoding;
    this.metadata = metadata;
    this.timestamp = new Date();
    this.dataHash = this._calculateHash();
  }

  /**
   * 計算資料雜湊
   * @returns {string}
   */
  _calculateHash() {
    return createHash('md5').update(String(this.data)).digest('hex');
  }
}

export class PerceptualMemory extends BaseMemory {
  /**
   * 感知記憶實作
   *
   * 特點：
   * - 支援多模態資料（文字、圖片、音訊等）
   * - 跨模態相似性搜尋
   * - 感知資料的語義理解
   * - 支援內容生成和檢索
   */
  constructor(config, storageBackend = null) {
    super(config, storageBackend);

    // 感知資料儲存（記憶體快取）
    this.perceptions = {};
    this.perceptualMemories = [];

    // 模態索引
    this.modalityIndex = {}; // modality -> perceptionIds[]

    // 支援的模態
    this.supportedModalities = new Set(config.perceptualMemoryModalities || ['text', 'image', 'audio', 'video']);
  }

  /**
   * 添加感知記憶
   * @param {MemoryItem} memoryItem
   * @returns {string} 記憶ID
   */
  add(memoryItem) {
    const modality = memoryItem.metadata.modality || 'text';
    const rawData = memoryItem.metadata.raw_data || memoryItem.content;

    if (!this.supportedModalities.has(modality)) {
      throw new Error(`不支援的模態類型: ${modality}`);
    }

    // 編碼感知資料
    const perception = new Perception({
      perceptionId: `perception_${memoryItem.id}`,
      data: rawData,
      modality,
      encoding: this._encodeData(rawData),
      metadata: { source: 'memory_system' },
    });

    // 快取與索引
    this.perceptions[perception.perceptionId] = perception;
    if (!this.modalityIndex[modality]) this.modalityIndex[modality] = [];
    this.modalityIndex[modality].push(perception.perceptionId);

    // 儲存記憶項（快取）
    memoryItem.metadata.perception_id = perception.perceptionId;
    memoryItem.metadata.modality = modality;
    this.perceptualMemories.push(memoryItem);

    return memoryItem.id;
  }

  /**
   * 檢索感知記憶（可篩模態；關鍵詞檢索 + 時間/重要性融合）
   * @param {string} query - 查詢內容
   * @param {number} limit
   * @param {Object} opts
   * @param {string} opts.userId
   * @param {string} opts.modality - 限制目標模態
   * @param {number} opts.minImportance
   * @returns {MemoryItem[]}
   */
  retrieve(query, limit = 5, { userId, modality, minImportance = 0 } = {}) {
    let candidates = this.perceptualMemories;
    if (userId) candidates = candidates.filter(m => m.userId === userId);
    if (modality) candidates = candidates.filter(m => m.metadata.modality === modality);
    if (minImportance) candidates = candidates.filter(m => m.importance >= minImportance);
    if (!candidates.length) return [];

    const queryLower = query.toLowerCase();
    const nowTs = Date.now();

    const scored = candidates.map(m => {
      const contentLower = (m.content || '').toLowerCase();

      // 關鍵詞匹配
      const queryWords = new Set(queryLower.split(/\s+/));
      const contentWords = new Set(contentLower.split(/\s+/));
      let overlap = 0;
      for (const w of queryWords) { if (contentWords.has(w)) overlap++; }
      const keywordScore = queryWords.size > 0 ? overlap / queryWords.size : 0;

      // 近因分數
      const ageDays = Math.max(0, (nowTs - m.timestamp.getTime()) / 86400000);
      const recencyScore = 1.0 / (1.0 + ageDays);

      // 新評分演算法：相似度為主，重要性為輔助加權因子
      const baseRelevance = keywordScore * 0.8 + recencyScore * 0.2;
      const importanceWeight = 0.8 + (m.importance * 0.4);
      const combined = baseRelevance * importanceWeight;

      return { score: combined, memory: m };
    }).filter(s => s.score > 0);

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.memory);
  }

  /**
   * 更新感知記憶
   * @param {string} memoryId
   * @param {string|null} content
   * @param {number|null} importance
   * @param {Object|null} metadata
   * @returns {boolean}
   */
  update(memoryId, content, importance, metadata) {
    const m = this.perceptualMemories.find(m => m.id === memoryId);
    if (!m) return false;
    if (content != null) m.content = content;
    if (importance != null) m.importance = importance;
    if (metadata) Object.assign(m.metadata, metadata);
    return true;
  }

  /**
   * 刪除感知記憶
   * @param {string} memoryId
   * @returns {boolean}
   */
  remove(memoryId) {
    const idx = this.perceptualMemories.findIndex(m => m.id === memoryId);
    if (idx === -1) return false;
    const removed = this.perceptualMemories.splice(idx, 1)[0];

    // 清理感知快取與模態索引
    const perceptionId = removed.metadata.perception_id;
    if (perceptionId && perceptionId in this.perceptions) {
      const perception = this.perceptions[perceptionId];
      const mod = perception.modality;
      delete this.perceptions[perceptionId];
      if (mod in this.modalityIndex) {
        this.modalityIndex[mod] = this.modalityIndex[mod].filter(id => id !== perceptionId);
        if (!this.modalityIndex[mod].length) delete this.modalityIndex[mod];
      }
    }
    return true;
  }

  /**
   * 檢查記憶是否存在
   * @param {string} memoryId
   * @returns {boolean}
   */
  hasMemory(memoryId) { return this.perceptualMemories.some(m => m.id === memoryId); }

  /**
   * 感知記憶遺忘機制（硬刪除）
   * @param {string} strategy
   * @param {number} threshold
   * @param {number} maxAgeDays
   * @returns {number}
   */
  forget(strategy = 'importance_based', threshold = 0.1, maxAgeDays = 30) {
    let forgottenCount = 0;
    const now = Date.now();
    const toRemove = [];

    for (const m of this.perceptualMemories) {
      let shouldForget = false;

      if (strategy === 'importance_based') {
        if (m.importance < threshold) shouldForget = true;
      } else if (strategy === 'time_based') {
        const cutoffMs = maxAgeDays * 24 * 3600 * 1000;
        if ((now - m.timestamp.getTime()) >= cutoffMs) shouldForget = true;
      } else if (strategy === 'capacity_based') {
        if (this.perceptualMemories.length > (this.config.maxCapacity || 100)) {
          const sorted = [...this.perceptualMemories].sort((a, b) => a.importance - b.importance);
          const excess = this.perceptualMemories.length - (this.config.maxCapacity || 100);
          if (sorted.indexOf(m) < excess) shouldForget = true;
        }
      }

      if (shouldForget) toRemove.push(m.id);
    }

    for (const id of toRemove) {
      if (this.remove(id)) forgottenCount++;
    }
    return forgottenCount;
  }

  /**
   * 清空所有感知記憶
   */
  clear() {
    this.perceptualMemories = [];
    this.perceptions = {};
    this.modalityIndex = {};
  }

  /**
   * 獲取所有感知記憶
   * @returns {MemoryItem[]}
   */
  getAll() { return [...this.perceptualMemories]; }

  /**
   * 獲取感知記憶統計資訊
   * @returns {Object}
   */
  getStats() {
    const active = this.perceptualMemories;
    const modalityCounts = {};
    for (const [mod, ids] of Object.entries(this.modalityIndex)) modalityCounts[mod] = ids.length;

    return {
      count: active.length,
      forgottenCount: 0,
      totalCount: this.perceptualMemories.length,
      perceptionsCount: Object.keys(this.perceptions).length,
      modalityCounts,
      supportedModalities: [...this.supportedModalities],
      avgImportance: active.length > 0
        ? active.reduce((s, m) => s + m.importance, 0) / active.length
        : 0.0,
      memoryType: 'perceptual',
    };
  }

  /**
   * 跨模態搜尋
   * @param {*} query
   * @param {string} queryModality
   * @param {string|null} targetModality
   * @param {number} limit
   * @returns {MemoryItem[]}
   */
  crossModalSearch(query, queryModality, targetModality = null, limit = 5) {
    return this.retrieve(String(query), limit, { modality: targetModality || queryModality });
  }

  /**
   * 按模態獲取記憶
   * @param {string} modality
   * @param {number} limit
   * @returns {MemoryItem[]}
   */
  getByModality(modality, limit = 10) {
    if (!(modality in this.modalityIndex)) return [];
    const pids = new Set(this.modalityIndex[modality]);
    return this.perceptualMemories
      .filter(m => pids.has(m.metadata.perception_id))
      .slice(0, limit);
  }

  /**
   * 基於感知記憶生成內容
   * @param {string} prompt
   * @param {string} targetModality
   * @returns {string|null}
   */
  generateContent(prompt, targetModality) {
    if (!this.supportedModalities.has(targetModality)) return null;

    const relevant = this.retrieve(prompt, 3);
    if (!relevant.length) return null;

    if (targetModality === 'text') {
      const contents = relevant.map(m => m.content);
      return `基於感知記憶生成的內容：\n${contents.join('\n')}`;
    }
    return `生成的${targetModality}內容（基於${relevant.length}個相關記憶）`;
  }

  // ─── 私有方法 ───

  /**
   * 編碼資料為簡單雜湊向量
   * @param {*} data
   * @returns {number[]}
   */
  _encodeData(data) {
    const hash = createHash('sha256').update(String(data)).digest('hex');
    // 將雜湊轉為簡單數值向量
    const vec = [];
    for (let i = 0; i < hash.length; i += 2) {
      vec.push(parseInt(hash.slice(i, i + 2), 16) / 255);
    }
    return vec;
  }

  /**
   * 計算編碼相似度（餘弦相似度）
   * @param {number[]} encoding1
   * @param {number[]} encoding2
   * @returns {number}
   */
  _calculateSimilarity(encoding1, encoding2) {
    if (!encoding1.length || !encoding2.length) return 0.0;
    const minLen = Math.min(encoding1.length, encoding2.length);
    if (!minLen) return 0.0;

    let dot = 0, norm1 = 0, norm2 = 0;
    for (let i = 0; i < minLen; i++) {
      dot += encoding1[i] * encoding2[i];
      norm1 += encoding1[i] * encoding1[i];
      norm2 += encoding2[i] * encoding2[i];
    }
    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);
    return (norm1 === 0 || norm2 === 0) ? 0.0 : dot / (norm1 * norm2);
  }
}
