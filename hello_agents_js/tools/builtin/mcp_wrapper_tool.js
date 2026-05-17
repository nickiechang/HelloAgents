/**
 * MCP 工具包裝器 — 將單個 MCP 工具包裝成 HelloAgents Tool
 *
 * 這個模組將 MCP 伺服器的每個工具展開為獨立的 HelloAgents Tool 物件，
 * 使得 Agent 可以像呼叫普通工具一樣呼叫 MCP 工具。
 */

import { Tool, ToolParameter } from '../base.js';

/**
 * MCP 工具包裝器
 *
 * 將 MCP 伺服器的一個工具（如 read_file）包裝成獨立的 Tool 物件。
 * Agent 呼叫時只需提供參數，無需了解 MCP 的內部結構。
 */
export class MCPWrapperTool extends Tool {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.name='mcp_wrapper'] - 工具名稱
   * @param {string|null} [opts.serverUrl] - MCP 伺服器 URL
   */
  constructor({ name = 'mcp_wrapper', serverUrl = null } = {}) {
    super(name, 'MCP 包裝工具 — 包裝 MCP 協議呼叫為獨立工具');
    this.serverUrl = serverUrl;
  }

  /**
   * 執行 MCP 包裝工具
   * @param {Object} parameters
   * @returns {string}
   */
  run(parameters) {
    return '❌ MCP 包裝工具需要配置伺服器。請先透過 MCPTool 連接 MCP 伺服器。';
  }

  /** @returns {ToolParameter[]} */
  getParameters() {
    return [
      new ToolParameter({ name: 'action', type: 'string', description: '操作類型', required: true }),
    ];
  }
}
