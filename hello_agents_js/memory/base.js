/**
 * 記憶系統基礎類別與配置
 *
 * 按照第8章架構設計的基礎元件：
 * - MemoryItem: 記憶項資料結構
 * - MemoryConfig: 記憶系統配置
 * - BaseMemory: 記憶基礎類別
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * 記憶項資料結構
 */
export class MemoryItem {
  constructor({ id, content, memoryType, userId, timestamp = new Date(), importance = 0.5, metadata = {} }) {
    this.id = id;
    this.content = content;
    this.memoryType = memoryType;
    this.userId = userId;
    this.timestamp = timestamp instanceof Date ? timestamp : new Date(timestamp);
    this.importance = importance;
    this.metadata = metadata;
  }
}

/**
 * 記憶系統配置
 */
export class MemoryConfig {
  constructor({
    storagePath = './memory_data',
    maxCapacity = 100,
    importanceThreshold = 0.1,
    decayFactor = 0.95,
    workingMemoryCapacity = 10,
    workingMemoryTokens = 2000,
    workingMemoryTtlMinutes = 120,
    perceptualMemoryModalities = ['text', 'image', 'audio', 'video'],
  } = {}) {
    // 儲存路徑
    this.storagePath = storagePath;

    // 統計顯示用的基礎配置（僅用於展示）
    this.maxCapacity = maxCapacity;
    this.importanceThreshold = importanceThreshold;
    this.decayFactor = decayFactor;

    // 工作記憶特定配置
    this.workingMemoryCapacity = workingMemoryCapacity;
    this.workingMemoryTokens = workingMemoryTokens;
    this.workingMemoryTtlMinutes = workingMemoryTtlMinutes;

    // 感知記憶特定配置
    this.perceptualMemoryModalities = perceptualMemoryModalities;
  }
}

/**
 * 記憶基礎類別
 *
 * 定義所有記憶類型的通用介面和行為
 */
export class BaseMemory {
  constructor(config, storageBackend = null) {
    if (new.target === BaseMemory) {
      throw new Error('BaseMemory 是抽象類別，無法直接實例化');
    }
    this.config = config;
    this.storage = storageBackend;
    this.memoryType = this.constructor.name.toLowerCase().replace('memory', '');
  }

  /**
   * 添加記憶項
   * @abstract
   * @param {MemoryItem} memoryItem - 記憶項物件
   * @returns {string} 記憶ID
   */
  add(memoryItem) { throw new Error('尚未實作'); }

  /**
   * 檢索相關記憶
   * @abstract
   * @param {string} query - 查詢內容
   * @param {number} limit - 回傳數量限制
   * @returns {MemoryItem[]} 相關記憶列表
   */
  retrieve(query, limit = 5) { throw new Error('尚未實作'); }

  /**
   * 更新記憶
   * @abstract
   * @param {string} memoryId - 記憶ID
   * @param {string|null} content - 新內容
   * @param {number|null} importance - 新重要性
   * @param {Object|null} metadata - 新中繼資料
   * @returns {boolean} 是否更新成功
   */
  update(memoryId, content, importance, metadata) { throw new Error('尚未實作'); }

  /**
   * 刪除記憶
   * @abstract
   * @param {string} memoryId - 記憶ID
   * @returns {boolean} 是否刪除成功
   */
  remove(memoryId) { throw new Error('尚未實作'); }

  /**
   * 檢查記憶是否存在
   * @abstract
   * @param {string} memoryId - 記憶ID
   * @returns {boolean} 是否存在
   */
  hasMemory(memoryId) { throw new Error('尚未實作'); }

  /**
   * 清空所有記憶
   * @abstract
   */
  clear() { throw new Error('尚未實作'); }

  /**
   * 獲取記憶統計資訊
   * @abstract
   * @returns {Object} 統計資訊字典
   */
  getStats() { throw new Error('尚未實作'); }

  /**
   * 產生記憶ID
   * @returns {string}
   */
  _generateId() { return uuidv4(); }

  /**
   * 計算記憶重要性
   * @param {string} content - 記憶內容
   * @param {number} baseImportance - 基礎重要性
   * @returns {number} 計算後的重要性分數
   */
  _calculateImportance(content, baseImportance = 0.5) {
    let importance = baseImportance;

    // 基於內容長度
    if (content.length > 100) importance += 0.1;

    // 基於關鍵字
    const keywords = ['important', 'critical', 'must', 'warning', 'error', '重要', '關鍵', '必須', '注意', '警告', '錯誤'];
    if (keywords.some(kw => content.includes(kw))) importance += 0.2;

    return Math.max(0.0, Math.min(1.0, importance));
  }

  toString() {
    const stats = this.getStats();
    return `${this.constructor.name}(count=${stats.count || 0})`;
  }
}
