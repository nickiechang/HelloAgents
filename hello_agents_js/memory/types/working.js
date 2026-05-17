/**
 * 工作記憶實作
 *
 * 按照第8章架構設計的工作記憶，提供：
 * - 短期上下文管理
 * - 容量和時間限制
 * - 優先級管理
 * - 自動清理機制
 */

import { BaseMemory } from '../base.js';

export class WorkingMemory extends BaseMemory {
  /**
   * 工作記憶實作
   *
   * 特點：
   * - 容量有限（通常10-20條記憶）
   * - 時效性強（會話級別）
   * - 優先級管理
   * - 自動清理過期記憶
   */
  constructor(config, storageBackend = null) {
    super(config, storageBackend);

    // 工作記憶特定配置
    this.maxCapacity = config.workingMemoryCapacity || 10;
    this.maxTokens = config.workingMemoryTokens || 2000;
    this.maxAgeMinutes = config.workingMemoryTtlMinutes || 120;
    this.currentTokens = 0;
    this.sessionStart = new Date();

    // 記憶體儲存（工作記憶不需要持久化）
    this.memories = [];
  }

  /**
   * 添加工作記憶
   * @param {import('../base.js').MemoryItem} memoryItem
   * @returns {string} 記憶ID
   */
  add(memoryItem) {
    // 過期清理
    this._expireOldMemories();

    // 計算優先級（重要性 + 時間衰減）
    this.memories.push(memoryItem);

    // 更新token計數
    this.currentTokens += memoryItem.content.split(/\s+/).length;

    // 檢查容量限制
    this._enforceCapacityLimits();

    return memoryItem.id;
  }

  /**
   * 檢索工作記憶 - 關鍵詞匹配 + 時間衰減 + 重要性加權
   * @param {string} query - 查詢內容
   * @param {number} limit - 回傳數量限制
   * @param {Object} opts
   * @param {string} opts.userId - 使用者ID
   * @param {number} opts.minImportance - 最低重要性閾值
   * @returns {import('../base.js').MemoryItem[]} 相關記憶列表
   */
  retrieve(query, limit = 5, { userId, minImportance = 0 } = {}) {
    // 過期清理
    this._expireOldMemories();

    // 過濾已遺忘的記憶
    let active = this.memories.filter(m => !m.metadata.forgotten);

    // 按使用者ID過濾（如果提供）
    if (userId) active = active.filter(m => m.userId === userId);
    if (!active.length) return [];

    const queryLower = query.toLowerCase();
    const queryWords = new Set(queryLower.split(/\s+/));

    const scored = active.map(m => {
      const contentLower = m.content.toLowerCase();
      const contentWords = new Set(contentLower.split(/\s+/));

      // 關鍵詞匹配分數
      let overlap = 0;
      for (const w of queryWords) { if (contentWords.has(w)) overlap++; }
      const keywordScore = queryWords.size > 0 ? overlap / queryWords.size : 0;

      // 時間衰減
      const timeDecay = this._calculateTimeDecay(m.timestamp);

      // 重要性權重
      const importanceWeight = 0.8 + m.importance * 0.4;

      return { score: keywordScore * timeDecay * importanceWeight, memory: m };
    }).filter(s => s.score > 0 && s.memory.importance >= minImportance);

    // 按分數排序並回傳
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.memory);
  }

  /**
   * 更新工作記憶
   * @param {string} memoryId - 記憶ID
   * @param {string|null} content - 新內容
   * @param {number|null} importance - 新重要性
   * @param {Object|null} metadata - 新中繼資料
   * @returns {boolean} 是否更新成功
   */
  update(memoryId, content, importance, metadata) {
    const m = this.memories.find(m => m.id === memoryId);
    if (!m) return false;
    if (content != null) {
      const oldTokens = m.content.split(/\s+/).length;
      m.content = content;
      // 更新token計數
      this.currentTokens += m.content.split(/\s+/).length - oldTokens;
    }
    if (importance != null) m.importance = importance;
    if (metadata) Object.assign(m.metadata, metadata);
    return true;
  }

  /**
   * 刪除工作記憶
   * @param {string} memoryId - 記憶ID
   * @returns {boolean} 是否刪除成功
   */
  remove(memoryId) {
    const idx = this.memories.findIndex(m => m.id === memoryId);
    if (idx === -1) return false;
    const removed = this.memories.splice(idx, 1)[0];
    // 更新token計數
    this.currentTokens = Math.max(0, this.currentTokens - removed.content.split(/\s+/).length);
    return true;
  }

  /**
   * 檢查記憶是否存在
   * @param {string} memoryId
   * @returns {boolean}
   */
  hasMemory(memoryId) { return this.memories.some(m => m.id === memoryId); }

  /**
   * 清空所有工作記憶
   */
  clear() { this.memories = []; this.currentTokens = 0; }

  /**
   * 獲取所有記憶
   * @returns {import('../base.js').MemoryItem[]}
   */
  getAll() { return [...this.memories]; }

  /**
   * 獲取工作記憶統計資訊
   * @returns {Object} 統計資訊
   */
  getStats() {
    this._expireOldMemories();
    const active = this.memories;
    const sessionDurationMin = (Date.now() - this.sessionStart.getTime()) / 60000;

    return {
      count: active.length,
      forgottenCount: 0,
      totalCount: this.memories.length,
      currentTokens: this.currentTokens,
      maxCapacity: this.maxCapacity,
      maxTokens: this.maxTokens,
      maxAgeMinutes: this.maxAgeMinutes,
      sessionDurationMinutes: sessionDurationMin,
      avgImportance: active.length > 0
        ? active.reduce((s, m) => s + m.importance, 0) / active.length
        : 0.0,
      capacityUsage: this.maxCapacity > 0 ? active.length / this.maxCapacity : 0.0,
      tokenUsage: this.maxTokens > 0 ? this.currentTokens / this.maxTokens : 0.0,
      memoryType: 'working',
    };
  }

  /**
   * 獲取最近的記憶
   * @param {number} limit
   * @returns {import('../base.js').MemoryItem[]}
   */
  getRecent(limit = 10) {
    return [...this.memories]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * 獲取重要記憶
   * @param {number} limit
   * @returns {import('../base.js').MemoryItem[]}
   */
  getImportant(limit = 10) {
    return [...this.memories]
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit);
  }

  /**
   * 獲取上下文摘要
   * @param {number} maxLength - 最大字元長度
   * @returns {string}
   */
  getContextSummary(maxLength = 500) {
    if (!this.memories.length) return 'No working memories available.';

    const sorted = [...this.memories].sort(
      (a, b) => (b.importance - a.importance) || (b.timestamp.getTime() - a.timestamp.getTime())
    );

    const parts = [];
    let currentLength = 0;
    for (const m of sorted) {
      if (currentLength + m.content.length <= maxLength) {
        parts.push(m.content);
        currentLength += m.content.length;
      } else {
        const remaining = maxLength - currentLength;
        if (remaining > 50) parts.push(m.content.slice(0, remaining) + '...');
        break;
      }
    }
    return 'Working Memory Context:\n' + parts.join('\n');
  }

  /**
   * 工作記憶遺忘機制
   * @param {string} strategy - 遺忘策略：importance_based / time_based / capacity_based
   * @param {number} threshold - 遺忘閾值
   * @param {number} maxAgeDays - 最大保留天數
   * @returns {number} 遺忘的記憶數量
   */
  forget(strategy = 'importance_based', threshold = 0.1, maxAgeDays = 1) {
    let forgottenCount = 0;
    const now = Date.now();
    const toRemove = new Set();

    // 始終先執行TTL過期（分鐘級）
    const ttlMs = this.maxAgeMinutes * 60 * 1000;
    for (const m of this.memories) {
      if ((now - m.timestamp.getTime()) >= ttlMs) toRemove.add(m.id);
    }

    if (strategy === 'importance_based') {
      // 刪除低重要性記憶
      for (const m of this.memories) {
        if (m.importance < threshold) toRemove.add(m.id);
      }
    } else if (strategy === 'time_based') {
      // 刪除過期記憶
      const cutoffMs = maxAgeDays * 24 * 3600 * 1000;
      for (const m of this.memories) {
        if ((now - m.timestamp.getTime()) >= cutoffMs) toRemove.add(m.id);
      }
    } else if (strategy === 'capacity_based') {
      // 刪除超出容量的記憶
      if (this.memories.length > this.maxCapacity) {
        const sorted = [...this.memories].sort((a, b) => this._calculatePriority(a) - this._calculatePriority(b));
        const excess = this.memories.length - this.maxCapacity;
        for (let i = 0; i < excess; i++) toRemove.add(sorted[i].id);
      }
    }

    // 執行刪除
    for (const id of toRemove) {
      if (this.remove(id)) forgottenCount++;
    }
    return forgottenCount;
  }

  /**
   * 計算記憶優先級
   * @param {import('../base.js').MemoryItem} memory
   * @returns {number}
   */
  _calculatePriority(memory) {
    return memory.importance * this._calculateTimeDecay(memory.timestamp);
  }

  /**
   * 計算時間衰減因子
   * @param {Date} timestamp
   * @returns {number}
   */
  _calculateTimeDecay(timestamp) {
    const hoursPassed = Math.max((Date.now() - timestamp.getTime()) / 3600000, 0);
    // 指數衰減（工作記憶衰減更快，每6小時衰減）
    const decay = Math.pow(this.config.decayFactor || 0.95, hoursPassed / 6);
    return Math.max(0.1, decay); // 最小保持10%的權重
  }

  /**
   * 按TTL清理過期記憶，並同步更新token計數
   */
  _expireOldMemories() {
    if (!this.memories.length) return;
    const now = Date.now();
    const ttlMs = this.maxAgeMinutes * 60 * 1000;

    const kept = [];
    let removedTokens = 0;
    for (const m of this.memories) {
      if ((now - m.timestamp.getTime()) < ttlMs) {
        kept.push(m);
      } else {
        removedTokens += m.content.split(/\s+/).length;
      }
    }
    if (kept.length === this.memories.length) return;
    this.memories = kept;
    this.currentTokens = Math.max(0, this.currentTokens - removedTokens);
  }

  /**
   * 強制執行容量限制
   */
  _enforceCapacityLimits() {
    // 檢查記憶數量限制
    while (this.memories.length > this.maxCapacity) {
      this._removeLowestPriorityMemory();
    }
    // 檢查token限制
    while (this.currentTokens > this.maxTokens && this.memories.length > 0) {
      this._removeLowestPriorityMemory();
    }
  }

  /**
   * 刪除優先級最低的記憶
   */
  _removeLowestPriorityMemory() {
    if (!this.memories.length) return;
    let lowestPriority = Infinity;
    let lowestMemory = null;
    for (const m of this.memories) {
      const priority = this._calculatePriority(m);
      if (priority < lowestPriority) {
        lowestPriority = priority;
        lowestMemory = m;
      }
    }
    if (lowestMemory) this.remove(lowestMemory.id);
  }
}
