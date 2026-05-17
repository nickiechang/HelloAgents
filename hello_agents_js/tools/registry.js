/**
 * 工具註冊表 — HelloAgents 原生工具系統
 *
 * 提供工具的註冊、管理和執行功能。
 * 支援兩種工具註冊方式：
 * 1. Tool 物件註冊（推薦）
 * 2. 函式直接註冊（簡便）
 */

export class ToolRegistry {
  constructor() {
    /** @type {Object<string, import('./base.js').Tool>} 工具物件表 */
    this._tools = {};
    /** @type {Object<string, {description: string, func: Function}>} 函式工具表 */
    this._functions = {};
  }

  /**
   * 註冊 Tool 物件
   * @param {import('./base.js').Tool} tool - Tool 實例
   * @param {Object} opts
   * @param {boolean} opts.autoExpand - 是否自動展開可展開的工具（預設 true）
   */
  registerTool(tool, { autoExpand = true } = {}) {
    // 檢查工具是否可展開
    if (autoExpand && tool.expandable) {
      const expandedTools = tool.getExpandedTools();
      if (expandedTools && expandedTools.length) {
        for (const subTool of expandedTools) {
          if (this._tools[subTool.name]) {
            console.log(`⚠️ 警告：工具 '${subTool.name}' 已存在，將被覆蓋。`);
          }
          this._tools[subTool.name] = subTool;
        }
        console.log(`✅ 工具 '${tool.name}' 已展開為 ${expandedTools.length} 個獨立工具`);
        return;
      }
    }

    // 普通工具或不展開的工具
    if (this._tools[tool.name]) {
      console.log(`⚠️ 警告：工具 '${tool.name}' 已存在，將被覆蓋。`);
    }
    this._tools[tool.name] = tool;
    console.log(`✅ 工具 '${tool.name}' 已註冊。`);
  }

  /**
   * 直接註冊函式作為工具（簡便方式）
   * @param {string} name - 工具名稱
   * @param {string} description - 工具描述
   * @param {Function} func - 工具函式，接受字串參數，回傳字串結果
   */
  registerFunction(name, description, func) {
    if (this._functions[name]) {
      console.log(`⚠️ 警告：工具 '${name}' 已存在，將被覆蓋。`);
    }
    this._functions[name] = { description, func };
    console.log(`✅ 工具 '${name}' 已註冊。`);
  }

  /**
   * 註銷工具
   * @param {string} name - 工具名稱
   */
  unregister(name) {
    if (this._tools[name]) {
      delete this._tools[name];
      console.log(`🗑️ 工具 '${name}' 已註銷。`);
    } else if (this._functions[name]) {
      delete this._functions[name];
      console.log(`🗑️ 工具 '${name}' 已註銷。`);
    } else {
      console.log(`⚠️ 工具 '${name}' 不存在。`);
    }
  }

  /**
   * 獲取 Tool 物件
   * @param {string} name
   * @returns {import('./base.js').Tool|null}
   */
  getTool(name) {
    return this._tools[name] || null;
  }

  /**
   * 獲取工具函式
   * @param {string} name
   * @returns {Function|null}
   */
  getFunction(name) {
    const info = this._functions[name];
    return info ? info.func : null;
  }

  /**
   * 執行工具
   * @param {string} name - 工具名稱
   * @param {string} inputText - 輸入參數
   * @returns {string} 工具執行結果
   */
  executeTool(name, inputText) {
    // 優先查詢 Tool 物件
    if (this._tools[name]) {
      try {
        return this._tools[name].run({ input: inputText });
      } catch (e) {
        return `錯誤：執行工具 '${name}' 時發生例外: ${e.message}`;
      }
    }

    // 查詢函式工具
    if (this._functions[name]) {
      try {
        return this._functions[name].func(inputText);
      } catch (e) {
        return `錯誤：執行工具 '${name}' 時發生例外: ${e.message}`;
      }
    }

    return `錯誤：未找到名為 '${name}' 的工具。`;
  }

  /**
   * 獲取所有可用工具的格式化描述字串
   * @returns {string} 工具描述字串，用於建構提示詞
   */
  getToolsDescription() {
    const descriptions = [];

    // Tool 物件描述
    for (const tool of Object.values(this._tools)) {
      descriptions.push(`- ${tool.name}: ${tool.description}`);
    }

    // 函式工具描述
    for (const [name, info] of Object.entries(this._functions)) {
      descriptions.push(`- ${name}: ${info.description}`);
    }

    return descriptions.length ? descriptions.join('\n') : '暫無可用工具';
  }

  /**
   * 列出所有工具名稱
   * @returns {string[]}
   */
  listTools() {
    return [...Object.keys(this._tools), ...Object.keys(this._functions)];
  }

  /**
   * 獲取所有 Tool 物件
   * @returns {import('./base.js').Tool[]}
   */
  getAllTools() {
    return Object.values(this._tools);
  }

  /**
   * 清空所有工具
   */
  clear() {
    this._tools = {};
    this._functions = {};
    console.log('🧹 所有工具已清空。');
  }
}

/** 全域工具註冊表 */
export const globalRegistry = new ToolRegistry();
