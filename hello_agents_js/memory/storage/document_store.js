/**
 * 文件儲存實作
 *
 * 支援多種文件資料庫後端：
 * - InMemoryDocumentStore：輕量級記憶體實作（預設）
 * - SQLiteDocumentStore：別名，對應 Python 版 SQLite 實作
 *
 * 簡化的 JavaScript 記憶體實作（Python 版本使用 SQLite / PostgreSQL）
 */

import { randomUUID } from 'crypto';

/**
 * 文件儲存基底類別（抽象）
 */
export class DocumentStore {
  /**
   * 新增記憶
   * @param {string} memoryId - 記憶ID
   * @param {string} userId - 使用者ID
   * @param {string} content - 記憶內容
   * @param {string} memoryType - 記憶類型
   * @param {number} timestamp - 時間戳
   * @param {number} importance - 重要性
   * @param {Object} properties - 附加屬性
   * @returns {string} 記憶ID
   */
  addMemory(memoryId, userId, content, memoryType, timestamp, importance, properties) {
    throw new Error('未實作');
  }

  /**
   * 獲取單個記憶
   * @param {string} memoryId
   * @returns {Object|null}
   */
  getMemory(memoryId) { throw new Error('未實作'); }

  /**
   * 搜尋記憶
   * @param {Object} params - 搜尋條件
   * @returns {Object[]}
   */
  searchMemories(params) { throw new Error('未實作'); }

  /**
   * 更新記憶
   * @param {string} memoryId
   * @param {string|null} content
   * @param {number|null} importance
   * @param {Object|null} properties
   * @returns {boolean}
   */
  updateMemory(memoryId, content, importance, properties) { throw new Error('未實作'); }

  /**
   * 刪除記憶
   * @param {string} memoryId
   * @returns {boolean}
   */
  deleteMemory(memoryId) { throw new Error('未實作'); }

  /**
   * 獲取資料庫統計資訊
   * @returns {Object}
   */
  getDatabaseStats() { throw new Error('未實作'); }

  /**
   * 新增文件
   * @param {string} content - 文件內容
   * @param {Object} metadata - 中繼資料
   * @returns {string} 文件ID
   */
  addDocument(content, metadata) { throw new Error('未實作'); }

  /**
   * 獲取文件
   * @param {string} documentId
   * @returns {Object|null}
   */
  getDocument(documentId) { throw new Error('未實作'); }
}

/**
 * 記憶體文件儲存實作
 *
 * 使用 Map 進行快速存取，支援按使用者、類型、時間範圍、重要性等條件搜尋。
 * 對應 Python 版的 SQLiteDocumentStore（簡化為記憶體實作）。
 */
export class InMemoryDocumentStore extends DocumentStore {
  constructor() {
    super();
    /** @type {Map<string, Object>} 記憶儲存 */
    this._memories = new Map();
    /** @type {Map<string, Object>} 文件儲存 */
    this._documents = new Map();
    /** @type {Map<string, Object>} 概念儲存 */
    this._concepts = new Map();
    /** @type {Map<string, Object>} 記憶-概念關聯 */
    this._memoryConcepts = new Map();
    /** @type {Set<string>} 使用者集合 */
    this._users = new Set();

    console.log('[OK] 記憶體文件儲存初始化完成');
  }

  /**
   * 新增記憶
   * @param {string} memoryId
   * @param {string} userId
   * @param {string} content
   * @param {string} memoryType
   * @param {number} timestamp
   * @param {number} importance
   * @param {Object} properties
   * @returns {string}
   */
  addMemory(memoryId, userId, content, memoryType, timestamp, importance, properties = {}) {
    // 確保使用者存在
    this._users.add(userId);

    const now = new Date().toISOString();
    this._memories.set(memoryId, {
      memoryId,
      userId,
      content,
      memoryType,
      timestamp,
      importance,
      properties,
      createdAt: now,
      updatedAt: now,
    });
    return memoryId;
  }

  /**
   * 獲取單個記憶
   * @param {string} memoryId
   * @returns {Object|null}
   */
  getMemory(memoryId) {
    return this._memories.get(memoryId) || null;
  }

  /**
   * 搜尋記憶
   * @param {Object} opts
   * @param {string} opts.userId - 使用者ID
   * @param {string} opts.memoryType - 記憶類型
   * @param {number} opts.startTime - 起始時間
   * @param {number} opts.endTime - 結束時間
   * @param {number} opts.importanceThreshold - 最低重要性閾值
   * @param {number} opts.limit - 回傳數量限制
   * @returns {Object[]}
   */
  searchMemories({ userId, memoryType, startTime, endTime, importanceThreshold, limit = 10 } = {}) {
    let results = [...this._memories.values()];

    if (userId) results = results.filter(m => m.userId === userId);
    if (memoryType) results = results.filter(m => m.memoryType === memoryType);
    if (startTime != null) results = results.filter(m => m.timestamp >= startTime);
    if (endTime != null) results = results.filter(m => m.timestamp <= endTime);
    if (importanceThreshold != null) results = results.filter(m => m.importance >= importanceThreshold);

    // 按重要性和時間戳降序排列
    results.sort((a, b) => {
      if (b.importance !== a.importance) return b.importance - a.importance;
      return b.timestamp - a.timestamp;
    });

    return results.slice(0, limit);
  }

  /**
   * 更新記憶
   * @param {string} memoryId
   * @param {string|null} content
   * @param {number|null} importance
   * @param {Object|null} properties
   * @returns {boolean}
   */
  updateMemory(memoryId, content, importance, properties) {
    const m = this._memories.get(memoryId);
    if (!m) return false;

    if (content != null) m.content = content;
    if (importance != null) m.importance = importance;
    if (properties) Object.assign(m.properties, properties);
    m.updatedAt = new Date().toISOString();

    return true;
  }

  /**
   * 刪除記憶
   * @param {string} memoryId
   * @returns {boolean}
   */
  deleteMemory(memoryId) {
    // 同時清理記憶-概念關聯
    for (const [key, val] of this._memoryConcepts) {
      if (val.memoryId === memoryId) this._memoryConcepts.delete(key);
    }
    return this._memories.delete(memoryId);
  }

  /**
   * 獲取資料庫統計資訊
   * @returns {Object}
   */
  getDatabaseStats() {
    // 統計記憶類型分布
    const memoryTypes = {};
    for (const m of this._memories.values()) {
      memoryTypes[m.memoryType] = (memoryTypes[m.memoryType] || 0) + 1;
    }

    // 統計使用者分布（前10名）
    const userCounts = {};
    for (const m of this._memories.values()) {
      userCounts[m.userId] = (userCounts[m.userId] || 0) + 1;
    }
    const topUsers = Object.fromEntries(
      Object.entries(userCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)
    );

    return {
      usersCount: this._users.size,
      memoriesCount: this._memories.size,
      conceptsCount: this._concepts.size,
      memoryConceptsCount: this._memoryConcepts.size,
      documentsCount: this._documents.size,
      memoryTypes,
      topUsers,
      storeType: 'in_memory',
    };
  }

  /**
   * 新增文件
   * @param {string} content
   * @param {Object} metadata
   * @returns {string} 文件ID
   */
  addDocument(content, metadata = {}) {
    const docId = randomUUID();
    const userId = metadata.userId || 'system';
    return this.addMemory(
      docId,
      userId,
      content,
      'document',
      Math.floor(Date.now() / 1000),
      0.5,
      metadata,
    );
  }

  /**
   * 獲取文件
   * @param {string} documentId
   * @returns {Object|null}
   */
  getDocument(documentId) {
    return this.getMemory(documentId);
  }

  /**
   * 關閉儲存（記憶體實作無需操作）
   */
  close() {
    console.log('[OK] 記憶體文件儲存已關閉');
  }
}

/** SQLiteDocumentStore 別名（JavaScript 版使用記憶體實作） */
export const SQLiteDocumentStore = InMemoryDocumentStore;
