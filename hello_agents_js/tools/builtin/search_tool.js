/**
 * 搜尋工具 — HelloAgents 原生搜尋實作
 *
 * 支援多後端、可回傳結構化結果的搜尋工具。
 * 後端：Tavily、SerpApi、DuckDuckGo、SearXNG、Perplexity 等。
 *
 * JavaScript 版本為簡化佔位實作，需配置 API 金鑰以啟用實際搜尋功能。
 */

import { Tool, ToolParameter } from '../base.js';

/**
 * 智慧網頁搜尋引擎
 *
 * 支援多種後端，可回傳結構化或文字化的搜尋結果。
 */
export class SearchTool extends Tool {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.backend='hybrid'] - 搜尋後端
   * @param {string|null} [opts.tavilyKey] - Tavily API 金鑰
   * @param {string|null} [opts.serpApiKey] - SerpApi API 金鑰
   * @param {string|null} [opts.perplexityKey] - Perplexity API 金鑰
   */
  constructor({ backend = 'hybrid', tavilyKey = null, serpApiKey = null, perplexityKey = null } = {}) {
    super('search', '智慧網頁搜尋引擎，支援多種後端，可回傳結構化或文字化的搜尋結果。');
    this.backend = (backend || 'hybrid').toLowerCase();
    this.tavilyKey = tavilyKey || process.env.TAVILY_API_KEY;
    this.serpApiKey = serpApiKey || process.env.SERPAPI_API_KEY;
    this.perplexityKey = perplexityKey || process.env.PERPLEXITY_API_KEY;
    /** @type {string[]} */
    this.availableBackends = [];
    this._setupBackends();
  }

  /** 設定可用的搜尋後端 */
  _setupBackends() {
    if (this.tavilyKey) {
      this.availableBackends.push('tavily');
      console.log('✅ Tavily 搜尋引擎已初始化');
    }
    if (this.serpApiKey) {
      this.availableBackends.push('serpapi');
      console.log('✅ SerpApi 搜尋引擎已初始化');
    }
  }

  /**
   * 執行搜尋
   * @param {Object} parameters
   * @returns {string}
   */
  run(parameters) {
    const query = (parameters.input || parameters.query || '').trim();
    if (!query) return '錯誤：搜尋查詢不能為空';

    // 佔位實作 — 需配置搜尋 API 金鑰以啟用實際搜尋
    return `搜尋結果 (查詢: "${query}"): 此為搜尋工具佔位實作，請配置搜尋 API 金鑰以啟用實際搜尋功能。`;
  }

  /** @returns {ToolParameter[]} */
  getParameters() {
    return [
      new ToolParameter({ name: 'input', type: 'string', description: '搜尋查詢關鍵詞', required: true }),
    ];
  }
}

/**
 * 便捷搜尋函式
 * @param {string} query - 搜尋查詢
 * @returns {string} 搜尋結果
 */
export function search(query) {
  const tool = new SearchTool();
  return tool.run({ input: query });
}
