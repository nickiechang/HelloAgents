/**
 * ContextBuilder — GSSC 流水線實作
 *
 * 實現 Gather-Select-Structure-Compress 上下文建構流程：
 * 1. Gather：從多來源收集候選資訊（歷史、記憶、RAG、工具結果）
 * 2. Select：基於優先級、相關性、多樣性篩選
 * 3. Structure：組織成結構化上下文模板
 * 4. Compress：在預算內壓縮與規範化
 */

import { Message } from '../core/message.js';

/**
 * 計算文字的 token 數量
 *
 * 嘗試使用 tiktoken 套件精確計算，若不可用則以每 4 字元約 1 token 粗略估算。
 * @param {string} text - 要計算的文字
 * @returns {number} token 數量
 */
export function countTokens(text) {
  try {
    // 嘗試使用 tiktoken（若已安裝）
    const { encoding_for_model } = require('tiktoken');
    const enc = encoding_for_model('gpt-4');
    const tokens = enc.encode(text);
    enc.free();
    return tokens.length;
  } catch {
    // 降級方案：約 4 字元 ≈ 1 token
    return Math.ceil(text.length / 4);
  }
}

/**
 * 上下文資訊包
 *
 * 封裝一段候選上下文內容及其中繼資料（時間戳記、相關性分數等）。
 */
export class ContextPacket {
  /**
   * @param {Object} opts
   * @param {string} opts.content - 內容文字
   * @param {Date} [opts.timestamp] - 時間戳記
   * @param {Object} [opts.metadata] - 中繼資料
   * @param {number} [opts.tokenCount] - token 數量（0 時自動計算）
   * @param {number} [opts.relevanceScore] - 相關性分數（0.0–1.0）
   */
  constructor({ content, timestamp = new Date(), metadata = {}, tokenCount = 0, relevanceScore = 0.0 }) {
    /** @type {string} */
    this.content = content;
    /** @type {Date} */
    this.timestamp = timestamp;
    /** @type {Object} */
    this.metadata = metadata;
    /** @type {number} */
    this.tokenCount = tokenCount || countTokens(content);
    /** @type {number} */
    this.relevanceScore = relevanceScore;
  }
}

/**
 * 上下文建構配置
 */
export class ContextConfig {
  /**
   * @param {Object} [opts]
   * @param {number} [opts.maxTokens=8000] - 總 token 預算
   * @param {number} [opts.reserveRatio=0.15] - 生成餘量（10–20%）
   * @param {number} [opts.minRelevance=0.3] - 最小相關性閾值
   * @param {boolean} [opts.enableMmr=true] - 啟用最大邊際相關性（多樣性）
   * @param {number} [opts.mmrLambda=0.7] - MMR 平衡參數（0=純多樣性, 1=純相關性）
   * @param {string} [opts.systemPromptTemplate] - 系統提示模板
   * @param {boolean} [opts.enableCompression=true] - 啟用壓縮
   */
  constructor({
    maxTokens = 8000,
    reserveRatio = 0.15,
    minRelevance = 0.3,
    enableMmr = true,
    mmrLambda = 0.7,
    systemPromptTemplate = '',
    enableCompression = true,
  } = {}) {
    this.maxTokens = maxTokens;
    this.reserveRatio = reserveRatio;
    this.minRelevance = minRelevance;
    this.enableMmr = enableMmr;
    this.mmrLambda = mmrLambda;
    this.systemPromptTemplate = systemPromptTemplate;
    this.enableCompression = enableCompression;
  }

  /**
   * 取得可用 token 預算（扣除餘量）
   * @returns {number}
   */
  getAvailableTokens() {
    return Math.floor(this.maxTokens * (1 - this.reserveRatio));
  }
}

/**
 * 上下文建構器 — GSSC 流水線
 *
 * @example
 * ```js
 * const builder = new ContextBuilder({
 *   memoryTool,
 *   ragTool,
 *   config: new ContextConfig({ maxTokens: 8000 }),
 * });
 *
 * const context = builder.build({
 *   userQuery: '使用者問題',
 *   conversationHistory: [...],
 *   systemInstructions: '系統指令',
 * });
 * ```
 */
export class ContextBuilder {
  /**
   * @param {Object} [opts]
   * @param {Object|null} [opts.memoryTool] - 記憶工具
   * @param {Object|null} [opts.ragTool] - RAG 工具
   * @param {ContextConfig|null} [opts.config] - 配置
   */
  constructor({ memoryTool = null, ragTool = null, config = null } = {}) {
    this.memoryTool = memoryTool;
    this.ragTool = ragTool;
    this.config = config || new ContextConfig();
  }

  /**
   * 建構完整上下文
   *
   * @param {Object} opts
   * @param {string} opts.userQuery - 使用者查詢
   * @param {Message[]} [opts.conversationHistory] - 對話歷史
   * @param {string|null} [opts.systemInstructions] - 系統指令
   * @param {ContextPacket[]} [opts.additionalPackets] - 額外的上下文包
   * @returns {string} 結構化上下文字串
   */
  build({ userQuery, conversationHistory = [], systemInstructions = null, additionalPackets = [] }) {
    // 1. Gather：收集候選資訊
    const packets = this._gather({ userQuery, conversationHistory, systemInstructions, additionalPackets });
    // 2. Select：篩選與排序
    const selectedPackets = this._select(packets, userQuery);
    // 3. Structure：組織成結構化模板
    const structuredContext = this._structure({ selectedPackets, userQuery, systemInstructions });
    // 4. Compress：壓縮與規範化
    return this._compress(structuredContext);
  }

  /**
   * Gather：收集候選資訊
   * @private
   */
  _gather({ userQuery, conversationHistory, systemInstructions, additionalPackets }) {
    const packets = [];

    // P0：系統指令（強約束）
    if (systemInstructions) {
      packets.push(new ContextPacket({ content: systemInstructions, metadata: { type: 'instructions' } }));
    }

    // P1：從記憶中取得任務狀態與關鍵結論
    if (this.memoryTool) {
      try {
        const stateResults = this.memoryTool.execute('search', { query: '任務狀態 子目標 結論 阻塞', minImportance: 0.7, limit: 5 });
        if (stateResults && !stateResults.includes('未找到')) {
          packets.push(new ContextPacket({ content: stateResults, metadata: { type: 'task_state', importance: 'high' } }));
        }
        // 搜尋與目前查詢相關的記憶
        const relatedResults = this.memoryTool.execute('search', { query: userQuery, limit: 5 });
        if (relatedResults && !relatedResults.includes('未找到')) {
          packets.push(new ContextPacket({ content: relatedResults, metadata: { type: 'related_memory' } }));
        }
      } catch (e) {
        console.warn(`記憶檢索失敗: ${e.message}`);
      }
    }

    // P2：從 RAG 中取得事實證據
    if (this.ragTool) {
      try {
        const ragResults = this.ragTool.run({ action: 'search', query: userQuery, limit: 5 });
        if (ragResults && !ragResults.includes('未找到') && !ragResults.includes('錯誤')) {
          packets.push(new ContextPacket({ content: ragResults, metadata: { type: 'knowledge_base' } }));
        }
      } catch (e) {
        console.warn(`RAG 檢索失敗: ${e.message}`);
      }
    }

    // P3：對話歷史（輔助材料）
    if (conversationHistory.length > 0) {
      const recent = conversationHistory.slice(-10);
      const historyText = recent.map(msg => `[${msg.role}] ${msg.content}`).join('\n');
      packets.push(new ContextPacket({ content: historyText, metadata: { type: 'history', count: recent.length } }));
    }

    // 加入額外資訊包
    packets.push(...additionalPackets);
    return packets;
  }

  /**
   * Select：基於分數與預算的篩選
   * @private
   */
  _select(packets, userQuery) {
    const queryTokens = new Set(userQuery.toLowerCase().split(/\s+/));

    // 1) 計算相關性（關鍵詞重疊）
    for (const packet of packets) {
      const contentTokens = new Set(packet.content.toLowerCase().split(/\s+/));
      if (queryTokens.size > 0) {
        let overlap = 0;
        for (const t of queryTokens) { if (contentTokens.has(t)) overlap++; }
        packet.relevanceScore = overlap / queryTokens.size;
      }
    }

    // 2) 計算新近性（指數衰減，時間尺度 1 小時）
    const recencyScore = (ts) => {
      const delta = Math.max((Date.now() - ts.getTime()) / 1000, 0);
      return Math.exp(-delta / 3600);
    };

    // 3) 計算複合分：0.7 × 相關性 + 0.3 × 新近性
    const scored = packets.map(p => ({
      score: 0.7 * p.relevanceScore + 0.3 * recencyScore(p.timestamp),
      packet: p,
    }));

    // 4) 系統指令固定納入
    const systemPackets = scored.filter(s => s.packet.metadata.type === 'instructions').map(s => s.packet);
    const remaining = scored
      .filter(s => s.packet.metadata.type !== 'instructions')
      .sort((a, b) => b.score - a.score)
      .map(s => s.packet)
      .filter(p => p.relevanceScore >= this.config.minRelevance);

    // 5) 按預算填充
    const availableTokens = this.config.getAvailableTokens();
    const selected = [];
    let usedTokens = 0;

    // 先放入系統指令
    for (const p of systemPackets) {
      if (usedTokens + p.tokenCount <= availableTokens) { selected.push(p); usedTokens += p.tokenCount; }
    }
    // 再按分數加入其餘
    for (const p of remaining) {
      if (usedTokens + p.tokenCount <= availableTokens) { selected.push(p); usedTokens += p.tokenCount; }
    }

    return selected;
  }

  /**
   * Structure：組織成結構化上下文模板
   * @private
   */
  _structure({ selectedPackets, userQuery, systemInstructions }) {
    const sections = [];

    // [Role & Policies] — 系統指令
    const p0 = selectedPackets.filter(p => p.metadata.type === 'instructions');
    if (p0.length) sections.push('[Role & Policies]\n' + p0.map(p => p.content).join('\n'));

    // [Task] — 目前任務
    sections.push(`[Task]\n使用者問題：${userQuery}`);

    // [State] — 任務狀態
    const p1 = selectedPackets.filter(p => p.metadata.type === 'task_state');
    if (p1.length) sections.push('[State]\n關鍵進展與未決問題：\n' + p1.map(p => p.content).join('\n'));

    // [Evidence] — 事實證據
    const p2 = selectedPackets.filter(p => ['related_memory', 'knowledge_base', 'retrieval', 'tool_result'].includes(p.metadata.type));
    if (p2.length) sections.push('[Evidence]\n事實與引用：\n' + p2.map(p => `\n${p.content}\n`).join(''));

    // [Context] — 輔助材料（歷史等）
    const p3 = selectedPackets.filter(p => p.metadata.type === 'history');
    if (p3.length) sections.push('[Context]\n對話歷史與背景：\n' + p3.map(p => p.content).join('\n'));

    // [Output] — 輸出約束
    sections.push(`[Output]\n請按以下格式回答：\n1. 結論（簡潔明確）\n2. 依據（列出支撐證據及來源）\n3. 風險與假設（如有）\n4. 下一步行動建議（如適用）`);

    return sections.join('\n\n');
  }

  /**
   * Compress：壓縮與規範化（若超預算則截斷）
   * @private
   */
  _compress(context) {
    if (!this.config.enableCompression) return context;

    const currentTokens = countTokens(context);
    const availableTokens = this.config.getAvailableTokens();

    if (currentTokens <= availableTokens) return context;

    console.warn(`上下文超預算 (${currentTokens} > ${availableTokens})，執行截斷`);

    // 按段落截斷，保留結構
    const lines = context.split('\n');
    const compressed = [];
    let used = 0;

    for (const line of lines) {
      const lineTokens = countTokens(line);
      if (used + lineTokens > availableTokens) break;
      compressed.push(line);
      used += lineTokens;
    }

    return compressed.join('\n');
  }
}
