/**
 * 記憶工具
 *
 * 為HelloAgents框架提供記憶能力的工具實現。
 * 可以作為工具添加到任何Agent中，讓Agent具備記憶功能。
 */

import { Tool, ToolParameter } from '../base.js';
import { MemoryManager, MemoryConfig } from '../../memory/index.js';

const MEMORY_TYPE_LABELS = {
  working: '工作記憶',
  episodic: '情景記憶',
  semantic: '語義記憶',
  perceptual: '感知記憶',
};

export class MemoryTool extends Tool {
  /**
   * 記憶工具
   *
   * 為Agent提供記憶功能：
   * - 添加記憶
   * - 檢索相關記憶
   * - 獲取記憶摘要
   * - 管理記憶生命週期
   */
  constructor({ userId = 'default_user', memoryConfig = null, memoryTypes = null, expandable = false } = {}) {
    super('memory', '記憶工具 - 可以儲存和檢索對話歷史、知識和經驗', { expandable });

    // 初始化記憶管理器
    this.memoryConfig = memoryConfig || new MemoryConfig();
    this.memoryTypesList = memoryTypes || ['working', 'episodic', 'semantic'];

    this.memoryManager = new MemoryManager({
      config: this.memoryConfig,
      userId,
      enableWorking: this.memoryTypesList.includes('working'),
      enableEpisodic: this.memoryTypesList.includes('episodic'),
      enableSemantic: this.memoryTypesList.includes('semantic'),
      enablePerceptual: this.memoryTypesList.includes('perceptual'),
    });

    // 會話狀態
    this.currentSessionId = null;
    this.conversationCount = 0;
  }

  /**
   * 執行工具（非展開模式）
   * @param {Object} parameters - 工具參數字典，必須包含action參數
   * @returns {string} 執行結果字串
   */
  run(parameters) {
    if (!this.validateParameters(parameters)) {
      return '❌ 參數驗證失敗：缺少必需的參數';
    }

    const action = parameters.action;

    switch (action) {
      case 'add':
        return this._addMemory({
          content: parameters.content || '',
          memoryType: parameters.memory_type || 'working',
          importance: parameters.importance ?? 0.5,
          filePath: parameters.file_path || null,
          modality: parameters.modality || null,
        });
      case 'search':
        return this._searchMemory({
          query: parameters.query,
          limit: parameters.limit || 5,
          memoryType: parameters.memory_type || null,
          minImportance: parameters.min_importance ?? 0.1,
        });
      case 'summary':
        return this._getSummary({ limit: parameters.limit || 10 });
      case 'stats':
        return this._getStats();
      case 'update':
        return this._updateMemory({
          memoryId: parameters.memory_id,
          content: parameters.content,
          importance: parameters.importance,
        });
      case 'remove':
        return this._removeMemory({ memoryId: parameters.memory_id });
      case 'forget':
        return this._forget({
          strategy: parameters.strategy || 'importance_based',
          threshold: parameters.threshold ?? 0.1,
          maxAgeDays: parameters.max_age_days ?? 30,
        });
      case 'consolidate':
        return this._consolidate({
          fromType: parameters.from_type || 'working',
          toType: parameters.to_type || 'episodic',
          importanceThreshold: parameters.importance_threshold ?? 0.7,
        });
      case 'clear_all':
        return this._clearAll();
      default:
        return `❌ 不支援的操作: ${action}`;
    }
  }

  getParameters() {
    return [
      new ToolParameter({
        name: 'action',
        type: 'string',
        description:
          '要執行的操作：add(添加記憶), search(搜尋記憶), summary(獲取摘要), stats(獲取統計), ' +
          'update(更新記憶), remove(刪除記憶), forget(遺忘記憶), consolidate(整合記憶), clear_all(清空所有記憶)',
        required: true,
      }),
      new ToolParameter({ name: 'content', type: 'string', description: '記憶內容（add/update時可用；感知記憶可作描述）', required: false }),
      new ToolParameter({ name: 'query', type: 'string', description: '搜尋查詢（search時可用）', required: false }),
      new ToolParameter({ name: 'memory_type', type: 'string', description: '記憶類型：working, episodic, semantic, perceptual（預設：working）', required: false, default: 'working' }),
      new ToolParameter({ name: 'importance', type: 'number', description: '重要性分數，0.0-1.0（add/update時可用）', required: false }),
      new ToolParameter({ name: 'limit', type: 'integer', description: '搜尋結果數量限制（預設：5）', required: false, default: 5 }),
      new ToolParameter({ name: 'memory_id', type: 'string', description: '目標記憶ID（update/remove時必需）', required: false }),
      new ToolParameter({ name: 'file_path', type: 'string', description: '感知記憶：本地檔案路徑（image/audio）', required: false }),
      new ToolParameter({ name: 'modality', type: 'string', description: '感知記憶模態：text/image/audio（不傳則按副檔名推斷）', required: false }),
      new ToolParameter({ name: 'strategy', type: 'string', description: '遺忘策略：importance_based/time_based/capacity_based（forget時可用）', required: false, default: 'importance_based' }),
      new ToolParameter({ name: 'threshold', type: 'number', description: '遺忘閾值（forget時可用，預設0.1）', required: false, default: 0.1 }),
      new ToolParameter({ name: 'max_age_days', type: 'integer', description: '最大保留天數（forget策略為time_based時可用）', required: false, default: 30 }),
      new ToolParameter({ name: 'from_type', type: 'string', description: '整合來源類型（consolidate時可用，預設working）', required: false, default: 'working' }),
      new ToolParameter({ name: 'to_type', type: 'string', description: '整合目標類型（consolidate時可用，預設episodic）', required: false, default: 'episodic' }),
      new ToolParameter({ name: 'importance_threshold', type: 'number', description: '整合重要性閾值（預設0.7）', required: false, default: 0.7 }),
    ];
  }

  /**
   * 添加記憶
   * @param {Object} opts
   * @param {string} opts.content - 記憶內容
   * @param {string} opts.memoryType - 記憶類型：working/episodic/semantic/perceptual
   * @param {number} opts.importance - 重要性分數 0.0-1.0
   * @param {string|null} opts.filePath - 感知記憶：本地檔案路徑
   * @param {string|null} opts.modality - 感知記憶模態：text/image/audio
   * @returns {string} 執行結果
   */
  _addMemory({ content = '', memoryType = 'working', importance = 0.5, filePath = null, modality = null } = {}) {
    const metadata = {};
    try {
      // 確保會話ID存在
      if (this.currentSessionId === null) {
        const now = new Date();
        const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 15);
        this.currentSessionId = `session_${ts}`;
      }

      // 感知記憶檔案支援：注入 raw_data 與模態
      if (memoryType === 'perceptual' && filePath) {
        const inferred = modality || this._inferModality(filePath);
        metadata.modality = metadata.modality || inferred;
        metadata.raw_data = metadata.raw_data || filePath;
      }

      // 添加會話資訊到中繼資料
      metadata.session_id = this.currentSessionId;
      metadata.timestamp = new Date().toISOString();

      const memoryId = this.memoryManager.addMemory({
        content,
        memoryType,
        importance,
        metadata,
        autoClassify: false,
      });

      return `✅ 記憶已添加 (ID: ${String(memoryId).slice(0, 8)}...)`;
    } catch (e) {
      return `❌ 添加記憶失敗: ${e.message}`;
    }
  }

  /**
   * 根據副檔名推斷模態（預設image/audio/text）
   * @param {string} path
   * @returns {string}
   */
  _inferModality(path) {
    try {
      const ext = (path.split('.').pop() || '').toLowerCase();
      if (['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'].includes(ext)) return 'image';
      if (['mp3', 'wav', 'flac', 'm4a', 'ogg'].includes(ext)) return 'audio';
      return 'text';
    } catch {
      return 'text';
    }
  }

  /**
   * 搜尋記憶
   * @param {Object} opts
   * @param {string} opts.query - 搜尋查詢內容
   * @param {number} opts.limit - 搜尋結果數量限制
   * @param {string|null} opts.memoryType - 限定記憶類型
   * @param {number} opts.minImportance - 最低重要性閾值
   * @returns {string} 搜尋結果
   */
  _searchMemory({ query, limit = 5, memoryType = null, minImportance = 0.1 } = {}) {
    try {
      const memoryTypes = memoryType ? [memoryType] : null;

      const results = this.memoryManager.retrieveMemories({
        query,
        limit,
        memoryTypes,
        minImportance,
      });

      if (!results || results.length === 0) {
        return `🔍 未找到與 '${query}' 相關的記憶`;
      }

      const lines = [`🔍 找到 ${results.length} 條相關記憶:`];
      results.forEach((memory, i) => {
        const typeLabel = MEMORY_TYPE_LABELS[memory.memoryType] || memory.memoryType;
        const preview = memory.content.length > 80 ? memory.content.slice(0, 80) + '...' : memory.content;
        lines.push(`${i + 1}. [${typeLabel}] ${preview} (重要性: ${memory.importance.toFixed(2)})`);
      });

      return lines.join('\n');
    } catch (e) {
      return `❌ 搜尋記憶失敗: ${e.message}`;
    }
  }

  /**
   * 獲取記憶摘要
   * @param {Object} opts
   * @param {number} opts.limit - 顯示的重要記憶數量
   * @returns {string} 記憶摘要
   */
  _getSummary({ limit = 10 } = {}) {
    try {
      const stats = this.memoryManager.getMemoryStats();

      const parts = [
        '📊 記憶系統摘要',
        `總記憶數: ${stats.totalMemories}`,
        `當前會話: ${this.currentSessionId || '未開始'}`,
        `對話輪次: ${this.conversationCount}`,
      ];

      // 各類型記憶統計
      if (stats.memoriesByType && Object.keys(stats.memoriesByType).length > 0) {
        parts.push('\n📋 記憶類型分布:');
        for (const [type, typeStats] of Object.entries(stats.memoriesByType)) {
          const count = typeStats.count || 0;
          const avgImportance = typeStats.avgImportance || typeStats.avg_importance || 0;
          const typeLabel = MEMORY_TYPE_LABELS[type] || type;
          parts.push(`  • ${typeLabel}: ${count} 條 (平均重要性: ${avgImportance.toFixed(2)})`);
        }
      }

      // 獲取重要記憶 - 去重
      const importantMemories = this.memoryManager.retrieveMemories({
        query: '',
        memoryTypes: null,
        limit: limit * 3,
        minImportance: 0.5,
      });

      if (importantMemories && importantMemories.length > 0) {
        const seenIds = new Set();
        const seenContents = new Set();
        const unique = [];

        for (const memory of importantMemories) {
          if (seenIds.has(memory.id)) continue;
          const contentKey = memory.content.trim().toLowerCase();
          if (seenContents.has(contentKey)) continue;
          seenIds.add(memory.id);
          seenContents.add(contentKey);
          unique.push(memory);
        }

        unique.sort((a, b) => b.importance - a.importance);
        const showCount = Math.min(limit, unique.length);
        parts.push(`\n⭐ 重要記憶 (前${showCount}條):`);

        for (let i = 0; i < showCount; i++) {
          const m = unique[i];
          const preview = m.content.length > 60 ? m.content.slice(0, 60) + '...' : m.content;
          parts.push(`  ${i + 1}. ${preview} (重要性: ${m.importance.toFixed(2)})`);
        }
      }

      return parts.join('\n');
    } catch (e) {
      return `❌ 獲取摘要失敗: ${e.message}`;
    }
  }

  /**
   * 獲取統計資訊
   * @returns {string} 統計資訊
   */
  _getStats() {
    try {
      const stats = this.memoryManager.getMemoryStats();

      return [
        '📈 記憶系統統計',
        `總記憶數: ${stats.totalMemories}`,
        `啟用的記憶類型: ${stats.enabledTypes.join(', ')}`,
        `會話ID: ${this.currentSessionId || '未開始'}`,
        `對話輪次: ${this.conversationCount}`,
      ].join('\n');
    } catch (e) {
      return `❌ 獲取統計資訊失敗: ${e.message}`;
    }
  }

  /**
   * 自動記錄對話
   * 這個方法可以被Agent呼叫來自動記錄對話歷史
   * @param {string} userInput
   * @param {string} agentResponse
   */
  autoRecordConversation(userInput, agentResponse) {
    this.conversationCount++;

    this._addMemory({
      content: `使用者: ${userInput}`,
      memoryType: 'working',
      importance: 0.6,
    });

    this._addMemory({
      content: `助理: ${agentResponse}`,
      memoryType: 'working',
      importance: 0.7,
    });

    // 如果是重要對話，記錄為情景記憶
    if (agentResponse.length > 100 || userInput.includes('重要') || userInput.includes('記住')) {
      this._addMemory({
        content: `對話 - 使用者: ${userInput}\n助理: ${agentResponse}`,
        memoryType: 'episodic',
        importance: 0.8,
      });
    }
  }

  /**
   * 更新記憶
   * @param {Object} opts
   * @param {string} opts.memoryId - 要更新的記憶ID
   * @param {string|null} opts.content - 新的記憶內容
   * @param {number|null} opts.importance - 新的重要性分數
   * @returns {string} 執行結果
   */
  _updateMemory({ memoryId, content = null, importance = null } = {}) {
    try {
      const success = this.memoryManager.updateMemory({
        memoryId,
        content,
        importance,
        metadata: null,
      });
      return success ? '✅ 記憶已更新' : '⚠️ 未找到要更新的記憶';
    } catch (e) {
      return `❌ 更新記憶失敗: ${e.message}`;
    }
  }

  /**
   * 刪除記憶
   * @param {Object} opts
   * @param {string} opts.memoryId - 要刪除的記憶ID
   * @returns {string} 執行結果
   */
  _removeMemory({ memoryId } = {}) {
    try {
      const success = this.memoryManager.removeMemory(memoryId);
      return success ? '✅ 記憶已刪除' : '⚠️ 未找到要刪除的記憶';
    } catch (e) {
      return `❌ 刪除記憶失敗: ${e.message}`;
    }
  }

  /**
   * 遺忘記憶（支援多種策略）
   * @param {Object} opts
   * @param {string} opts.strategy - 遺忘策略
   * @param {number} opts.threshold - 遺忘閾值
   * @param {number} opts.maxAgeDays - 最大保留天數
   * @returns {string} 執行結果
   */
  _forget({ strategy = 'importance_based', threshold = 0.1, maxAgeDays = 30 } = {}) {
    try {
      const count = this.memoryManager.forgetMemories({
        strategy,
        threshold,
        maxAgeDays,
      });
      return `🧹 已遺忘 ${count} 條記憶（策略: ${strategy}）`;
    } catch (e) {
      return `❌ 遺忘記憶失敗: ${e.message}`;
    }
  }

  /**
   * 整合記憶（將重要的短期記憶提升為長期記憶）
   * @param {Object} opts
   * @param {string} opts.fromType - 來源記憶類型
   * @param {string} opts.toType - 目標記憶類型
   * @param {number} opts.importanceThreshold - 整合的重要性閾值
   * @returns {string} 執行結果
   */
  _consolidate({ fromType = 'working', toType = 'episodic', importanceThreshold = 0.7 } = {}) {
    try {
      const count = this.memoryManager.consolidateMemories({
        fromType,
        toType,
        importanceThreshold,
      });
      return `🔄 已整合 ${count} 條記憶為長期記憶（${fromType} → ${toType}，閾值=${importanceThreshold}）`;
    } catch (e) {
      return `❌ 整合記憶失敗: ${e.message}`;
    }
  }

  /**
   * 清空所有記憶
   * @returns {string} 執行結果
   */
  _clearAll() {
    try {
      this.memoryManager.clearAllMemories();
      return '🧽 已清空所有記憶';
    } catch (e) {
      return `❌ 清空記憶失敗: ${e.message}`;
    }
  }

  /**
   * 添加知識到語義記憶（便捷方法）
   * @param {string} content
   * @param {number} importance
   */
  addKnowledge(content, importance = 0.9) {
    return this._addMemory({
      content,
      memoryType: 'semantic',
      importance,
    });
  }

  /**
   * 為查詢獲取相關上下文
   * 這個方法可以被Agent呼叫來獲取相關的記憶上下文
   * @param {string} query
   * @param {number} limit
   * @returns {string}
   */
  getContextForQuery(query, limit = 3) {
    const results = this.memoryManager.retrieveMemories({
      query,
      limit,
      minImportance: 0.3,
    });

    if (!results || results.length === 0) return '';

    const parts = ['相關記憶:'];
    for (const memory of results) {
      parts.push(`- ${memory.content}`);
    }
    return parts.join('\n');
  }

  /**
   * 清除當前會話
   */
  clearSession() {
    this.currentSessionId = null;
    this.conversationCount = 0;

    const wm = this.memoryManager.memoryTypes?.working;
    if (wm) wm.clear();
  }

  /**
   * 整合記憶
   */
  consolidateMemories() {
    return this.memoryManager.consolidateMemories();
  }

  /**
   * 遺忘舊記憶
   * @param {number} maxAgeDays
   */
  forgetOldMemories(maxAgeDays = 30) {
    return this.memoryManager.forgetMemories({
      strategy: 'time_based',
      maxAgeDays,
    });
  }
}
