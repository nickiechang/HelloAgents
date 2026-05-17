/**
 * 情景記憶實作
 *
 * 按照第8章架構設計的情景記憶，提供：
 * - 具體互動事件儲存
 * - 時間序列組織
 * - 上下文豐富的記憶
 * - 模式識別能力
 *
 * 簡化的記憶體實作（Python版本使用 Qdrant + SQLite）
 */

import { BaseMemory, MemoryItem } from '../base.js';

/**
 * 情景記憶中的單個情景
 */
export class Episode {
  /**
   * @param {Object} opts
   * @param {string} opts.episodeId - 情景ID
   * @param {string} opts.userId - 使用者ID
   * @param {string} opts.sessionId - 會話ID
   * @param {Date} opts.timestamp - 時間戳記
   * @param {string} opts.content - 內容
   * @param {Object} opts.context - 上下文
   * @param {string|null} opts.outcome - 結果
   * @param {number} opts.importance - 重要性
   */
  constructor({ episodeId, userId, sessionId, timestamp, content, context = {}, outcome = null, importance = 0.5 }) {
    this.episodeId = episodeId;
    this.userId = userId;
    this.sessionId = sessionId;
    this.timestamp = timestamp instanceof Date ? timestamp : new Date(timestamp);
    this.content = content;
    this.context = context;
    this.outcome = outcome;
    this.importance = importance;
  }
}

export class EpisodicMemory extends BaseMemory {
  /**
   * 情景記憶實作
   *
   * 特點：
   * - 儲存具體的互動事件
   * - 包含豐富的上下文資訊
   * - 按時間序列組織
   * - 支援模式識別和回溯
   */
  constructor(config, storageBackend = null) {
    super(config, storageBackend);

    // 本地快取（記憶體）
    this.episodes = [];
    this.sessions = {}; // sessionId -> episodeIds[]

    // 模式識別快取
    this.patternsCache = {};
    this.lastPatternAnalysis = null;
  }

  /**
   * 添加情景記憶
   * @param {MemoryItem} memoryItem
   * @returns {string} 記憶ID
   */
  add(memoryItem) {
    // 從中繼資料中提取情景資訊
    const sessionId = memoryItem.metadata.session_id || 'default_session';
    const context = memoryItem.metadata.context || {};
    const outcome = memoryItem.metadata.outcome || null;

    // 建立情景（記憶體快取）
    const episode = new Episode({
      episodeId: memoryItem.id,
      userId: memoryItem.userId,
      sessionId,
      timestamp: memoryItem.timestamp,
      content: memoryItem.content,
      context,
      outcome,
      importance: memoryItem.importance,
    });

    this.episodes.push(episode);
    if (!this.sessions[sessionId]) this.sessions[sessionId] = [];
    this.sessions[sessionId].push(episode.episodeId);

    return memoryItem.id;
  }

  /**
   * 檢索情景記憶
   * @param {string} query - 查詢內容
   * @param {number} limit - 回傳數量限制
   * @param {Object} opts
   * @param {string} opts.userId - 使用者ID
   * @param {string} opts.sessionId - 限定會話ID
   * @param {number} opts.minImportance - 最低重要性閾值
   * @returns {MemoryItem[]}
   */
  retrieve(query, limit = 5, { userId, sessionId, minImportance = 0 } = {}) {
    // 過濾情景
    let candidates = this._filterEpisodes(userId, sessionId);

    // 過濾已遺忘
    candidates = candidates.filter(e => !e.context.forgotten);

    if (minImportance) candidates = candidates.filter(e => e.importance >= minImportance);
    if (!candidates.length) return [];

    const queryLower = query.toLowerCase();
    const queryWords = new Set(queryLower.split(/\s+/));
    const nowTs = Date.now();

    const scored = candidates.map(ep => {
      const contentLower = ep.content.toLowerCase();
      const contentWords = new Set(contentLower.split(/\s+/));

      // 關鍵詞匹配分數
      let overlap = 0;
      for (const w of queryWords) { if (contentWords.has(w)) overlap++; }
      const keywordScore = queryWords.size > 0 ? overlap / queryWords.size : 0;

      // 近因分數
      const ageDays = Math.max(0, (nowTs - ep.timestamp.getTime()) / 86400000);
      const recencyScore = 1.0 / (1.0 + ageDays);

      // 新評分演算法：相似度為主，重要性為輔助加權因子
      const baseRelevance = keywordScore * 0.8 + recencyScore * 0.2;
      const importanceWeight = 0.8 + (ep.importance * 0.4);
      const combined = baseRelevance * importanceWeight;

      return { score: combined, episode: ep };
    }).filter(s => s.score > 0);

    scored.sort((a, b) => b.score - a.score);

    // 轉換為 MemoryItem
    return scored.slice(0, limit).map(s => new MemoryItem({
      id: s.episode.episodeId,
      content: s.episode.content,
      memoryType: 'episodic',
      userId: s.episode.userId,
      timestamp: s.episode.timestamp,
      importance: s.episode.importance,
      metadata: {
        session_id: s.episode.sessionId,
        context: s.episode.context,
        outcome: s.episode.outcome,
        relevance_score: s.score,
      },
    }));
  }

  /**
   * 更新情景記憶
   * @param {string} memoryId
   * @param {string|null} content
   * @param {number|null} importance
   * @param {Object|null} metadata
   * @returns {boolean}
   */
  update(memoryId, content, importance, metadata) {
    const ep = this.episodes.find(e => e.episodeId === memoryId);
    if (!ep) return false;
    if (content != null) ep.content = content;
    if (importance != null) ep.importance = importance;
    if (metadata) {
      if (metadata.context) Object.assign(ep.context, metadata.context);
      if ('outcome' in metadata) ep.outcome = metadata.outcome;
    }
    return true;
  }

  /**
   * 刪除情景記憶
   * @param {string} memoryId
   * @returns {boolean}
   */
  remove(memoryId) {
    const idx = this.episodes.findIndex(e => e.episodeId === memoryId);
    if (idx === -1) return false;
    const removed = this.episodes.splice(idx, 1)[0];
    const sid = removed.sessionId;
    if (sid in this.sessions) {
      this.sessions[sid] = this.sessions[sid].filter(id => id !== memoryId);
      if (!this.sessions[sid].length) delete this.sessions[sid];
    }
    return true;
  }

  /**
   * 檢查記憶是否存在
   * @param {string} memoryId
   * @returns {boolean}
   */
  hasMemory(memoryId) { return this.episodes.some(e => e.episodeId === memoryId); }

  /**
   * 清空所有情景記憶
   */
  clear() {
    this.episodes = [];
    this.sessions = {};
    this.patternsCache = {};
  }

  /**
   * 獲取所有情景記憶（轉換為MemoryItem格式）
   * @returns {MemoryItem[]}
   */
  getAll() {
    return this.episodes.map(ep => new MemoryItem({
      id: ep.episodeId,
      content: ep.content,
      memoryType: 'episodic',
      userId: ep.userId,
      timestamp: ep.timestamp,
      importance: ep.importance,
      metadata: { session_id: ep.sessionId, context: ep.context, outcome: ep.outcome },
    }));
  }

  /**
   * 獲取情景記憶統計資訊
   * @returns {Object}
   */
  getStats() {
    const active = this.episodes;
    return {
      count: active.length,
      forgottenCount: 0,
      totalCount: this.episodes.length,
      sessionsCount: Object.keys(this.sessions).length,
      avgImportance: active.length > 0
        ? active.reduce((s, e) => s + e.importance, 0) / active.length
        : 0.0,
      timeSpanDays: this._calculateTimeSpan(),
      memoryType: 'episodic',
    };
  }

  /**
   * 情景記憶遺忘機制（硬刪除）
   * @param {string} strategy - 遺忘策略
   * @param {number} threshold - 遺忘閾值
   * @param {number} maxAgeDays - 最大保留天數
   * @returns {number} 遺忘的記憶數量
   */
  forget(strategy = 'importance_based', threshold = 0.1, maxAgeDays = 30) {
    let forgottenCount = 0;
    const now = Date.now();
    const toRemove = [];

    for (const ep of this.episodes) {
      let shouldForget = false;

      if (strategy === 'importance_based') {
        if (ep.importance < threshold) shouldForget = true;
      } else if (strategy === 'time_based') {
        const cutoffMs = maxAgeDays * 24 * 3600 * 1000;
        if ((now - ep.timestamp.getTime()) >= cutoffMs) shouldForget = true;
      } else if (strategy === 'capacity_based') {
        if (this.episodes.length > (this.config.maxCapacity || 100)) {
          const sorted = [...this.episodes].sort((a, b) => a.importance - b.importance);
          const excess = this.episodes.length - (this.config.maxCapacity || 100);
          if (sorted.indexOf(ep) < excess) shouldForget = true;
        }
      }

      if (shouldForget) toRemove.push(ep.episodeId);
    }

    for (const id of toRemove) {
      if (this.remove(id)) forgottenCount++;
    }
    return forgottenCount;
  }

  /**
   * 獲取指定會話的所有情景
   * @param {string} sessionId
   * @returns {Episode[]}
   */
  getSessionEpisodes(sessionId) {
    if (!(sessionId in this.sessions)) return [];
    const ids = new Set(this.sessions[sessionId]);
    return this.episodes.filter(e => ids.has(e.episodeId));
  }

  /**
   * 發現使用者行為模式
   * @param {string|null} userId
   * @param {number} minFrequency - 最低出現頻率
   * @returns {Object[]}
   */
  findPatterns(userId = null, minFrequency = 2) {
    const cacheKey = `${userId}_${minFrequency}`;
    if (cacheKey in this.patternsCache && this.lastPatternAnalysis &&
        (Date.now() - this.lastPatternAnalysis.getTime()) < 3600000) {
      return this.patternsCache[cacheKey];
    }

    const episodes = userId
      ? this.episodes.filter(e => e.userId === userId)
      : this.episodes;

    // 簡單的模式識別：基於內容關鍵詞
    const keywordPatterns = {};
    const contextPatterns = {};

    for (const ep of episodes) {
      const words = ep.content.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length > 3) keywordPatterns[word] = (keywordPatterns[word] || 0) + 1;
      }
      for (const [key, value] of Object.entries(ep.context)) {
        const pk = `${key}:${value}`;
        contextPatterns[pk] = (contextPatterns[pk] || 0) + 1;
      }
    }

    const patterns = [];
    for (const [kw, freq] of Object.entries(keywordPatterns)) {
      if (freq >= minFrequency) {
        patterns.push({ type: 'keyword', pattern: kw, frequency: freq, confidence: freq / episodes.length });
      }
    }
    for (const [cp, freq] of Object.entries(contextPatterns)) {
      if (freq >= minFrequency) {
        patterns.push({ type: 'context', pattern: cp, frequency: freq, confidence: freq / episodes.length });
      }
    }

    patterns.sort((a, b) => b.frequency - a.frequency);
    this.patternsCache[cacheKey] = patterns;
    this.lastPatternAnalysis = new Date();
    return patterns;
  }

  /**
   * 獲取時間線視圖
   * @param {string|null} userId
   * @param {number} limit
   * @returns {Object[]}
   */
  getTimeline(userId = null, limit = 50) {
    let episodes = userId
      ? this.episodes.filter(e => e.userId === userId)
      : this.episodes;

    episodes = [...episodes].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return episodes.slice(0, limit).map(ep => ({
      episodeId: ep.episodeId,
      timestamp: ep.timestamp.toISOString(),
      content: ep.content.length > 100 ? ep.content.slice(0, 100) + '...' : ep.content,
      sessionId: ep.sessionId,
      importance: ep.importance,
      outcome: ep.outcome,
    }));
  }

  /**
   * 過濾情景
   * @param {string|null} userId
   * @param {string|null} sessionId
   * @param {[Date, Date]|null} timeRange
   * @returns {Episode[]}
   */
  _filterEpisodes(userId = null, sessionId = null, timeRange = null) {
    let filtered = this.episodes;
    if (userId) filtered = filtered.filter(e => e.userId === userId);
    if (sessionId) filtered = filtered.filter(e => e.sessionId === sessionId);
    if (timeRange) {
      const [start, end] = timeRange;
      filtered = filtered.filter(e => e.timestamp >= start && e.timestamp <= end);
    }
    return filtered;
  }

  /**
   * 計算記憶時間跨度（天）
   * @returns {number}
   */
  _calculateTimeSpan() {
    if (!this.episodes.length) return 0.0;
    const timestamps = this.episodes.map(e => e.timestamp.getTime());
    return (Math.max(...timestamps) - Math.min(...timestamps)) / 86400000;
  }
}
