/**
 * 工具鏈管理器 — HelloAgents 工具鏈式呼叫支援
 *
 * 提供多個工具的順序執行（pipeline）能力，
 * 支援模板變數替換，前一步驟的輸出可作為後續步驟的輸入。
 */

/**
 * 工具鏈 — 支援多個工具的順序執行
 */
export class ToolChain {
  /**
   * @param {string} name - 工具鏈名稱
   * @param {string} description - 工具鏈描述
   */
  constructor(name, description) {
    this.name = name;
    this.description = description;
    /** @type {Array<{toolName: string, inputTemplate: string, outputKey: string}>} */
    this.steps = [];
  }

  /**
   * 新增工具執行步驟
   * @param {string} toolName - 工具名稱
   * @param {string} inputTemplate - 輸入模板，支援變數替換，如 "{input}" 或 "{search_result}"
   * @param {string|null} outputKey - 輸出結果的鍵名，用於後續步驟引用
   */
  addStep(toolName, inputTemplate, outputKey = null) {
    this.steps.push({
      toolName,
      inputTemplate,
      outputKey: outputKey || `step_${this.steps.length}_result`,
    });
    console.log(`✅ 工具鏈 '${this.name}' 新增步驟: ${toolName}`);
  }

  /**
   * 執行工具鏈
   * @param {import('./registry.js').ToolRegistry} registry - 工具註冊表
   * @param {string} inputData - 初始輸入資料
   * @param {Object|null} context - 執行上下文，用於變數替換
   * @returns {string} 最終執行結果
   */
  execute(registry, inputData, context = null) {
    if (!this.steps.length) return '❌ 工具鏈為空，無法執行';
    console.log(`🚀 開始執行工具鏈: ${this.name}`);

    const ctx = context ? { ...context } : {};
    ctx.input = inputData;
    let finalResult = inputData;

    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      console.log(`📝 執行步驟 ${i + 1}/${this.steps.length}: ${step.toolName}`);

      // 替換模板中的變數
      let actualInput;
      try {
        actualInput = step.inputTemplate.replace(/\{(\w+)\}/g, (_, key) => {
          if (!(key in ctx)) throw new Error(`未找到變數: ${key}`);
          return ctx[key];
        });
      } catch (e) {
        return `❌ 模板變數替換失敗: ${e.message}`;
      }

      // 執行工具
      try {
        const result = registry.executeTool(step.toolName, actualInput);
        ctx[step.outputKey] = result;
        finalResult = result;
        console.log(`✅ 步驟 ${i + 1} 完成`);
      } catch (e) {
        return `❌ 工具 '${step.toolName}' 執行失敗: ${e.message}`;
      }
    }

    console.log(`🎉 工具鏈 '${this.name}' 執行完成`);
    return finalResult;
  }
}

/**
 * 工具鏈管理器
 */
export class ToolChainManager {
  /**
   * @param {import('./registry.js').ToolRegistry} registry - 工具註冊表
   */
  constructor(registry) {
    this.registry = registry;
    /** @type {Object<string, ToolChain>} */
    this.chains = {};
  }

  /**
   * 註冊工具鏈
   * @param {ToolChain} chain
   */
  registerChain(chain) {
    this.chains[chain.name] = chain;
    console.log(`✅ 工具鏈 '${chain.name}' 已註冊`);
  }

  /**
   * 執行指定的工具鏈
   * @param {string} chainName - 工具鏈名稱
   * @param {string} inputData - 輸入資料
   * @param {Object|null} context - 執行上下文
   * @returns {string}
   */
  executeChain(chainName, inputData, context = null) {
    if (!this.chains[chainName]) return `❌ 工具鏈 '${chainName}' 不存在`;
    return this.chains[chainName].execute(this.registry, inputData, context);
  }

  /**
   * 列出所有已註冊的工具鏈
   * @returns {string[]}
   */
  listChains() {
    return Object.keys(this.chains);
  }

  /**
   * 獲取工具鏈資訊
   * @param {string} chainName
   * @returns {Object|null}
   */
  getChainInfo(chainName) {
    const chain = this.chains[chainName];
    if (!chain) return null;
    return {
      name: chain.name,
      description: chain.description,
      steps: chain.steps.length,
      stepDetails: chain.steps.map(s => ({
        toolName: s.toolName,
        inputTemplate: s.inputTemplate,
        outputKey: s.outputKey,
      })),
    };
  }
}

// ==================
// 便捷函式
// ==================

/**
 * 建立研究工具鏈：搜尋 -> 計算 -> 總結
 * @returns {ToolChain}
 */
export function createResearchChain() {
  const chain = new ToolChain('research_and_calculate', '搜尋資訊並進行相關計算');
  chain.addStep('search', '{input}', 'search_result');
  chain.addStep('my_calculator', '2 + 2', 'calc_result');
  return chain;
}

/**
 * 建立簡單的工具鏈範例
 * @returns {ToolChain}
 */
export function createSimpleChain() {
  const chain = new ToolChain('simple_demo', '簡單的工具鏈示範');
  chain.addStep('my_calculator', '{input}', 'result');
  return chain;
}
