/**
 * 記憶管理器 - 記憶核心層的統一管理介面
 *
 * 負責：
 * - 記憶生命週期管理
 * - 記憶優先級和重要性評估
 * - 記憶遺忘和清理機制
 * - 多類型記憶的協調管理
 */

import { v4 as uuidv4 } from 'uuid';
import { MemoryItem, MemoryConfig } from './base.js';
import { WorkingMemory } from './types/working.js';
import { EpisodicMemory } from './types/episodic.js';
import { SemanticMemory } from './types/semantic.js';
import { PerceptualMemory } from './types/perceptual.js';
// 儲存和檢索功能已被各記憶類型內部實作替代

export class MemoryManager {
  /**
   * @param {Object} opts
   * @param {MemoryConfig|null} opts.config - 記憶系統配置
   * @param {string} opts.userId - 使用者ID
   * @param {boolean} opts.enableWorking - 啟用工作記憶
   * @param {boolean} opts.enableEpisodic - 啟用情景記憶
   * @param {boolean} opts.enableSemantic - 啟用語義記憶
   * @param {boolean} opts.enablePerceptual - 啟用感知記憶
   */
  constructor({
    config = null,
    userId = 'default_user',
    enableWorking = true,
    enableEpisodic = true,
    enableSemantic = true,
    enablePerceptual = false,
  } = {}) {
    this.config = config || new MemoryConfig();
    this.userId = userId;

    // 儲存和檢索功能已移至各記憶類型內部實作

    // 初始化各類型記憶
    this.memoryTypes = {};

    if (enableWorking) this.memoryTypes.working = new WorkingMemory(this.config);
    if (enableEpisodic) this.memoryTypes.episodic = new EpisodicMemory(this.config);
    if (enableSemantic) this.memoryTypes.semantic = new SemanticMemory(this.config);
    if (enablePerceptual) this.memoryTypes.perceptual = new PerceptualMemory(this.config);

    console.info(`MemoryManager初始化完成，啟用記憶類型: ${Object.keys(this.memoryTypes).join(', ')}`);
  }

  /**
   * 添加記憶
   *
   * @param {Object} opts
   * @param {string} opts.content - 記憶內容
   * @param {string} opts.memoryType - 記憶類型
   * @param {number|null} opts.importance - 重要性分數 (0-1)
   * @param {Object|null} opts.metadata - 中繼資料
   * @param {boolean} opts.autoClassify - 是否自動分類到合適的記憶類型
   * @returns {string} 記憶ID
   */
  addMemory({ content, memoryType = 'working', importance = null, metadata = null, autoClassify = true }) {
    // 自動分類記憶類型
    if (autoClassify) memoryType = this._classifyMemoryType(content, metadata);

    // 計算重要性
    if (importance == null) importance = this._calculateImportance(content, metadata);

    // 建立記憶項
    const item = new MemoryItem({
      id: uuidv4(),
      content,
      memoryType,
      userId: this.userId,
      timestamp: new Date(),
      importance,
      metadata: metadata || {},
    });

    // 添加到對應的記憶類型
    if (!(memoryType in this.memoryTypes)) {
      throw new Error(`不支援的記憶類型: ${memoryType}`);
    }

    const memoryId = this.memoryTypes[memoryType].add(item);
    console.debug(`添加記憶到 ${memoryType}: ${memoryId}`);
    return memoryId;
  }

  /**
   * 檢索記憶
   *
   * @param {Object} opts
   * @param {string} opts.query - 查詢內容
   * @param {string[]|null} opts.memoryTypes - 要檢索的記憶類型列表
   * @param {number} opts.limit - 回傳數量限制
   * @param {number} opts.minImportance - 最小重要性閾值
   * @returns {MemoryItem[]} 檢索到的記憶列表
   */
  retrieveMemories({ query, memoryTypes = null, limit = 10, minImportance = 0 }) {
    const types = memoryTypes || Object.keys(this.memoryTypes);
    const perTypeLimit = Math.max(1, Math.floor(limit / types.length));
    let allResults = [];

    // 從各個記憶類型中檢索
    for (const type of types) {
      if (!(type in this.memoryTypes)) continue;
      try {
        // 使用各個記憶類型自己的檢索方法
        const results = this.memoryTypes[type].retrieve(query, perTypeLimit, { minImportance, userId: this.userId });
        allResults.push(...results);
      } catch (e) {
        console.warn(`檢索 ${type} 記憶時出錯: ${e.message}`);
      }
    }

    // 按重要性和相關性排序
    allResults.sort((a, b) => b.importance - a.importance);
    return allResults.slice(0, limit);
  }

  /**
   * 更新記憶
   *
   * @param {Object} opts
   * @param {string} opts.memoryId - 記憶ID
   * @param {string|null} opts.content - 新內容
   * @param {number|null} opts.importance - 新重要性
   * @param {Object|null} opts.metadata - 新中繼資料
   * @returns {boolean} 是否更新成功
   */
  updateMemory({ memoryId, content, importance, metadata }) {
    // 查找記憶所在的類型
    for (const instance of Object.values(this.memoryTypes)) {
      if (instance.hasMemory(memoryId)) return instance.update(memoryId, content, importance, metadata);
    }
    console.warn(`未找到記憶: ${memoryId}`);
    return false;
  }

  /**
   * 刪除記憶
   *
   * @param {string} memoryId - 記憶ID
   * @returns {boolean} 是否刪除成功
   */
  removeMemory(memoryId) {
    for (const instance of Object.values(this.memoryTypes)) {
      if (instance.hasMemory(memoryId)) return instance.remove(memoryId);
    }
    console.warn(`未找到記憶: ${memoryId}`);
    return false;
  }

  /**
   * 記憶遺忘機制
   *
   * @param {Object} opts
   * @param {string} opts.strategy - 遺忘策略 ("importance_based", "time_based", "capacity_based")
   * @param {number} opts.threshold - 遺忘閾值
   * @param {number} opts.maxAgeDays - 最大保存天數
   * @returns {number} 遺忘的記憶數量
   */
  forgetMemories({ strategy = 'importance_based', threshold = 0.1, maxAgeDays = 30 } = {}) {
    let totalForgotten = 0;
    for (const instance of Object.values(this.memoryTypes)) {
      if (typeof instance.forget === 'function') {
        totalForgotten += instance.forget(strategy, threshold, maxAgeDays);
      }
    }
    console.info(`記憶遺忘完成: ${totalForgotten} 條記憶`);
    return totalForgotten;
  }

  /**
   * 記憶整合 - 將重要的短期記憶轉換為長期記憶
   *
   * @param {Object} opts
   * @param {string} opts.fromType - 來源記憶類型
   * @param {string} opts.toType - 目標記憶類型
   * @param {number} opts.importanceThreshold - 重要性閾值
   * @returns {number} 整合的記憶數量
   */
  consolidateMemories({ fromType = 'working', toType = 'episodic', importanceThreshold = 0.7 } = {}) {
    if (!(fromType in this.memoryTypes) || !(toType in this.memoryTypes)) {
      console.warn(`記憶類型不存在: ${fromType} -> ${toType}`);
      return 0;
    }

    // 獲取高重要性的來源記憶
    const source = this.memoryTypes[fromType];
    const target = this.memoryTypes[toType];

    // 獲取需要整合的記憶
    const all = typeof source.getAll === 'function' ? source.getAll() : [];
    const candidates = all.filter(m => m.importance >= importanceThreshold);
    let consolidatedCount = 0;

    for (const memory of candidates) {
      // 移動到目標記憶類型
      if (source.remove(memory.id)) {
        memory.memoryType = toType;
        memory.importance = Math.min(1.0, memory.importance * 1.1); // 提升重要性
        target.add(memory);
        consolidatedCount++;
      }
    }

    console.info(`記憶整合完成: ${consolidatedCount} 條記憶從 ${fromType} 轉移到 ${toType}`);
    return consolidatedCount;
  }

  /**
   * 獲取記憶統計資訊
   * @returns {Object} 統計資訊字典
   */
  getMemoryStats() {
    const stats = {
      userId: this.userId,
      enabledTypes: Object.keys(this.memoryTypes),
      totalMemories: 0,
      memoriesByType: {},
      config: {
        maxCapacity: this.config.maxCapacity,
        importanceThreshold: this.config.importanceThreshold,
        decayFactor: this.config.decayFactor,
      },
    };
    for (const [type, instance] of Object.entries(this.memoryTypes)) {
      const typeStats = instance.getStats();
      stats.memoriesByType[type] = typeStats;
      // 使用count欄位（活躍記憶數），而不是totalCount（包含已遺忘的）
      stats.totalMemories += typeStats.count || 0;
    }
    return stats;
  }

  /**
   * 清空所有記憶
   */
  clearAllMemories() {
    for (const instance of Object.values(this.memoryTypes)) instance.clear();
    console.info('所有記憶已清空');
  }

  /**
   * 自動分類記憶類型
   * @param {string} content - 記憶內容
   * @param {Object|null} metadata - 中繼資料
   * @returns {string} 記憶類型
   */
  _classifyMemoryType(content, metadata) {
    if (metadata?.type) return metadata.type;

    // 簡單的分類邏輯，可以擴展為更複雜的分類器
    if (this._isEpisodicContent(content)) return 'episodic';
    if (this._isSemanticContent(content)) return 'semantic';
    return 'working';
  }

  /**
   * 判斷是否為情景記憶內容
   * @param {string} content
   * @returns {boolean}
   */
  _isEpisodicContent(content) {
    const keywords = ['yesterday', 'today', 'tomorrow', 'last time', 'remember', 'happened', '昨天', '今天', '明天', '上次', '記得', '發生', '經歷'];
    return keywords.some(kw => content.includes(kw));
  }

  /**
   * 判斷是否為語義記憶內容
   * @param {string} content
   * @returns {boolean}
   */
  _isSemanticContent(content) {
    const keywords = ['definition', 'concept', 'rule', 'knowledge', 'principle', '定義', '概念', '規則', '知識', '原理', '方法'];
    return keywords.some(kw => content.includes(kw));
  }

  /**
   * 計算記憶重要性
   * @param {string} content - 記憶內容
   * @param {Object|null} metadata - 中繼資料
   * @returns {number} 重要性分數
   */
  _calculateImportance(content, metadata) {
    let importance = 0.5; // 基礎重要性

    // 基於內容長度
    if (content.length > 100) importance += 0.1;

    // 基於關鍵字
    const keywords = ['important', 'critical', 'must', 'warning', 'error', '重要', '關鍵', '必須', '注意', '警告', '錯誤'];
    if (keywords.some(kw => content.includes(kw))) importance += 0.2;

    // 基於中繼資料
    if (metadata?.priority === 'high') importance += 0.3;
    else if (metadata?.priority === 'low') importance -= 0.2;

    return Math.max(0.0, Math.min(1.0, importance));
  }

  toString() {
    const stats = this.getMemoryStats();
    return `MemoryManager(user=${this.userId}, total=${stats.totalMemories})`;
  }
}
