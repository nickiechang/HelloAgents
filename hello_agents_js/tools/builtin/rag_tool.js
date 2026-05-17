/**
 * RAG 工具 — 檢索增強生成
 *
 * 為 HelloAgents 框架提供簡潔易用的 RAG 能力：
 * - 資料流程：使用者資料 → 文件解析 → 向量化儲存 → 智慧檢索 → LLM 增強問答
 * - 多格式支援：PDF、Word、Excel、PPT、圖片、音訊、網頁等
 * - 智慧問答：自動檢索相關內容，注入提示詞，生成準確答案
 * - 命名空間：支援多專案隔離，便於管理不同知識庫
 *
 * JavaScript 版本為簡化的記憶體實作。
 */

import { Tool, ToolParameter } from '../base.js';

/**
 * RAG 工具
 *
 * 提供完整的 RAG 能力：
 * - 新增多格式文件
 * - 智慧檢索與召回
 * - LLM 增強問答
 * - 知識庫管理
 */
export class RAGTool extends Tool {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.knowledgeBasePath='./knowledge_base'] - 知識庫路徑
   * @param {boolean} [opts.expandable=false] - 是否可展開
   */
  constructor({ knowledgeBasePath = './knowledge_base', expandable = false } = {}) {
    super('rag', 'RAG 工具 — 支援多格式文件檢索增強生成，提供智慧問答能力', { expandable });
    this.knowledgeBasePath = knowledgeBasePath;
    /** @type {Object[]} */
    this._documents = [];
    this.initialized = true;
  }

  /**
   * 執行工具
   * @param {Object} parameters
   * @returns {string}
   */
  run(parameters) {
    const action = parameters.action;
    if (action === 'add_text') return this._addText(parameters);
    if (action === 'search') return this._search(parameters);
    if (action === 'ask') return this._search(parameters);
    if (action === 'stats') return this._getStats();
    if (action === 'clear') return this._clear();
    return `❌ 不支援的操作: ${action}`;
  }

  /** 新增文字到知識庫 */
  _addText(params) {
    const text = params.text || '';
    if (!text.trim()) return '❌ 文字內容不能為空';
    this._documents.push({ content: text, id: `doc_${Date.now()}`, timestamp: new Date().toISOString() });
    return `✅ 文字已新增到知識庫\n📊 目前文件數: ${this._documents.length}`;
  }

  /** 搜尋知識庫 */
  _search(params) {
    const query = (params.query || params.question || '').toLowerCase();
    if (!query) return '❌ 搜尋查詢不能為空';
    const results = this._documents.filter(d => d.content.toLowerCase().includes(query));
    if (!results.length) return `🔍 未找到與 '${query}' 相關的內容`;
    const lines = [`🔍 找到 ${results.length} 條相關內容:`];
    results.slice(0, params.limit || 5).forEach((d, i) => {
      const preview = d.content.length > 100 ? d.content.slice(0, 100) + '...' : d.content;
      lines.push(`${i + 1}. ${preview}`);
    });
    return lines.join('\n');
  }

  /** 取得知識庫統計 */
  _getStats() {
    return `📊 知識庫統計\n文件數: ${this._documents.length}`;
  }

  /** 清空知識庫 */
  _clear() {
    this._documents = [];
    return '✅ 知識庫已清空';
  }

  /** @returns {ToolParameter[]} */
  getParameters() {
    return [
      new ToolParameter({ name: 'action', type: 'string', description: '操作：add_text/search/ask/stats/clear', required: true }),
      new ToolParameter({ name: 'text', type: 'string', description: '文字內容', required: false }),
      new ToolParameter({ name: 'query', type: 'string', description: '搜尋查詢', required: false }),
      new ToolParameter({ name: 'question', type: 'string', description: '問題', required: false }),
      new ToolParameter({ name: 'limit', type: 'integer', description: '結果數量限制', required: false, default: 5 }),
    ];
  }
}
