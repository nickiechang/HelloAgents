/**
 * 協議工具集合
 *
 * 提供基於協議實作的工具介面：
 * - MCPTool：基於 fastmcp 庫，用於連接和呼叫 MCP 伺服器
 * - A2ATool：基於官方 a2a 庫，用於 Agent 間通訊
 * - ANPTool：基於概念實作，用於服務發現和網路管理
 */

import { Tool, ToolParameter } from '../base.js';

/**
 * MCP (Model Context Protocol) 工具
 *
 * 連接到 MCP 伺服器並呼叫其提供的工具、資源和提示詞。
 *
 * 功能：
 * - 列出伺服器提供的工具
 * - 呼叫伺服器工具
 * - 讀取伺服器資源
 * - 取得提示詞模板
 */
export class MCPTool extends Tool {
  /**
   * @param {Object} [opts]
   * @param {string|null} [opts.serverUrl] - MCP 伺服器 URL
   * @param {string} [opts.name='mcp'] - 工具名稱
   * @param {boolean} [opts.autoExpand=false] - 是否自動展開為獨立工具
   */
  constructor({ serverUrl = null, name = 'mcp', autoExpand = false } = {}) {
    super(name, 'MCP 協議工具 — Model Context Protocol 伺服器連接與呼叫');
    this.serverUrl = serverUrl;
    this.autoExpand = autoExpand;
    /** @type {Array} */
    this._availableTools = [];
  }

  /**
   * 執行 MCP 操作
   * @param {Object} parameters
   * @returns {string}
   */
  run(parameters) {
    return '❌ MCP 工具需要配置 MCP 伺服器連線。請參考文件配置 MCP 服務。';
  }

  /** @returns {ToolParameter[]} */
  getParameters() {
    return [
      new ToolParameter({ name: 'action', type: 'string', description: '操作類型：list_tools, call_tool, read_resource, get_prompt', required: true }),
    ];
  }
}

/**
 * A2A (Agent-to-Agent) 協議工具
 *
 * 用於 Agent 間通訊，支援任務委派和結果接收。
 */
export class A2ATool extends Tool {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.name='a2a'] - 工具名稱
   */
  constructor({ name = 'a2a' } = {}) {
    super(name, 'A2A 協議工具 — Agent-to-Agent Protocol，用於智能體間通訊');
  }

  /**
   * 執行 A2A 操作
   * @param {Object} parameters
   * @returns {string}
   */
  run(parameters) {
    return '❌ A2A 工具需要配置 Agent 網路。請參考文件配置 A2A 服務。';
  }

  /** @returns {ToolParameter[]} */
  getParameters() {
    return [
      new ToolParameter({ name: 'action', type: 'string', description: '操作類型：send_task, receive_result, discover_agents', required: true }),
    ];
  }
}

/**
 * ANP (Agent Network Protocol) 協議工具
 *
 * 用於服務發現和網路管理。
 */
export class ANPTool extends Tool {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.name='anp'] - 工具名稱
   */
  constructor({ name = 'anp' } = {}) {
    super(name, 'ANP 協議工具 — Agent Network Protocol，用於服務發現和網路管理');
  }

  /**
   * 執行 ANP 操作
   * @param {Object} parameters
   * @returns {string}
   */
  run(parameters) {
    return '❌ ANP 工具需要配置 Agent 網路。請參考文件配置 ANP 服務。';
  }

  /** @returns {ToolParameter[]} */
  getParameters() {
    return [
      new ToolParameter({ name: 'action', type: 'string', description: '操作類型：discover, register, query', required: true }),
    ];
  }
}
