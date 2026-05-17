/**
 * 評估工具集合
 *
 * 包含以下評估工具的佔位實作：
 * - BFCLEvaluationTool：BFCL 函式呼叫評估（第12章）
 * - GAIAEvaluationTool：GAIA 通用AI助手評估（第12章）
 * - LLMJudgeTool：LLM 評審評估（第12章）
 * - WinRateTool：勝率評估（第12章）
 * - RLTrainingTool：強化學習訓練（第11章）
 */

import { Tool, ToolParameter } from '../base.js';

/**
 * BFCL 一鍵評估工具
 *
 * Berkeley Function Calling Leaderboard 評估工具。
 * 評估智能體的工具呼叫能力，支援多個評估類別：
 * - simple_python：簡單 Python 函式呼叫
 * - simple_java：簡單 Java 函式呼叫
 * - simple_javascript：簡單 JavaScript 函式呼叫
 * - multiple：多函式呼叫
 * - parallel：平行函式呼叫
 * - parallel_multiple：平行多函式呼叫
 * - irrelevance：無關檢測
 */
export class BFCLEvaluationTool extends Tool {
  constructor() {
    super('bfcl_evaluation', 'BFCL 一鍵評估工具 — 評估智能體的工具呼叫能力，支援多個評估類別');
  }

  /**
   * 執行 BFCL 評估
   * @param {Object} parameters
   * @returns {string} 評估結果
   */
  run(parameters) {
    return '❌ BFCL 評估工具需要配置評估資料集。請參考文件配置 BFCL 資料目錄。';
  }

  /** @returns {ToolParameter[]} */
  getParameters() {
    return [
      new ToolParameter({ name: 'action', type: 'string', description: '操作類型', required: true }),
      new ToolParameter({ name: 'category', type: 'string', description: '評估類別：simple_python, multiple, parallel 等', required: false, default: 'simple_python' }),
      new ToolParameter({ name: 'max_samples', type: 'integer', description: '評估樣本數（預設：5，設為0表示全部）', required: false, default: 5 }),
    ];
  }
}

/**
 * GAIA 評估工具
 *
 * General AI Assistants 評估工具。
 * 評估智能體的通用AI助手能力，支援三個難度級別：
 * - Level 1：簡單任務（0步推理）
 * - Level 2：中等任務（1-5步推理）
 * - Level 3：困難任務（5+步推理）
 */
export class GAIAEvaluationTool extends Tool {
  constructor() {
    super('gaia_evaluation', 'GAIA 評估工具 — 評估智能體的通用AI助手能力，支援三個難度級別');
  }

  /**
   * 執行 GAIA 評估
   * @param {Object} parameters
   * @returns {string} 評估結果
   */
  run(parameters) {
    return '❌ GAIA 評估工具需要配置評估資料集。請參考文件配置 GAIA 資料目錄。';
  }

  /** @returns {ToolParameter[]} */
  getParameters() {
    return [
      new ToolParameter({ name: 'action', type: 'string', description: '操作類型', required: true }),
      new ToolParameter({ name: 'level', type: 'integer', description: '難度級別：1(簡單), 2(中等), 3(困難)', required: false }),
      new ToolParameter({ name: 'max_samples', type: 'integer', description: '最大評估樣本數', required: false }),
    ];
  }
}

/**
 * LLM Judge 評估工具
 *
 * 使用 LLM 作為評委評估資料生成品質。
 * 從正確性、清晰度、難度匹配、完整性等維度進行評分。
 */
export class LLMJudgeTool extends Tool {
  constructor() {
    super('llm_judge_evaluation', 'LLM Judge 評估工具 — 使用 LLM 作為評委評估資料生成品質');
  }

  /**
   * 執行 LLM Judge 評估
   * @param {Object} parameters
   * @returns {string} 評估結果
   */
  run(parameters) {
    return '❌ LLM Judge 工具需要配置 LLM 實例。請參考文件設定評委模型。';
  }

  /** @returns {ToolParameter[]} */
  getParameters() {
    return [
      new ToolParameter({ name: 'generated_data_path', type: 'string', description: '生成資料的 JSON 檔案路徑', required: true }),
      new ToolParameter({ name: 'reference_data_path', type: 'string', description: '參考資料的 JSON 檔案路徑（可選，用於對比）', required: false }),
      new ToolParameter({ name: 'max_samples', type: 'integer', description: '最大評估樣本數', required: false }),
      new ToolParameter({ name: 'judge_model', type: 'string', description: '評委模型名稱（預設：gpt-4o）', required: false, default: 'gpt-4o' }),
    ];
  }
}

/**
 * Win Rate 評估工具
 *
 * 透過成對對比計算生成資料相對於真題的勝率。
 */
export class WinRateTool extends Tool {
  constructor() {
    super('win_rate_evaluation', 'Win Rate 評估工具 — 透過成對對比計算生成資料的勝率');
  }

  /**
   * 執行 Win Rate 評估
   * @param {Object} parameters
   * @returns {string} 評估結果
   */
  run(parameters) {
    return '❌ Win Rate 工具需要配置評估資料。請提供生成資料與參考資料路徑。';
  }

  /** @returns {ToolParameter[]} */
  getParameters() {
    return [
      new ToolParameter({ name: 'generated_data_path', type: 'string', description: '生成資料的 JSON 檔案路徑', required: true }),
      new ToolParameter({ name: 'reference_data_path', type: 'string', description: '參考資料的 JSON 檔案路徑', required: false }),
      new ToolParameter({ name: 'num_comparisons', type: 'integer', description: '對比次數', required: false }),
      new ToolParameter({ name: 'judge_model', type: 'string', description: '評委模型名稱（預設：gpt-4o）', required: false, default: 'gpt-4o' }),
    ];
  }
}

/**
 * RL 訓練工具
 *
 * 提供強化學習訓練功能，包括 SFT、GRPO 等演算法。
 * 支援訓練模型、載入資料集、建立獎勵函式、評估模型等操作。
 */
export class RLTrainingTool extends Tool {
  constructor() {
    super('rl_training', '強化學習訓練工具 — 支援 SFT、GRPO 等演算法，用於訓練和最佳化語言模型的推理能力');
  }

  /**
   * 執行 RL 相關操作
   * @param {Object} parameters
   * @returns {string} 操作結果
   */
  run(parameters) {
    return '❌ RL 訓練工具需要配置訓練環境。JavaScript 版本目前僅提供佔位實作。';
  }

  /** @returns {ToolParameter[]} */
  getParameters() {
    return [
      new ToolParameter({ name: 'action', type: 'string', description: '操作類型：train(訓練), load_dataset(載入資料集), create_reward(建立獎勵函式), evaluate(評估)', required: true }),
      new ToolParameter({ name: 'algorithm', type: 'string', description: '訓練演算法：sft, grpo', required: false, default: 'sft' }),
      new ToolParameter({ name: 'model_name', type: 'string', description: '模型名稱', required: false }),
      new ToolParameter({ name: 'dataset', type: 'string', description: '資料集名稱', required: false, default: 'gsm8k' }),
      new ToolParameter({ name: 'max_samples', type: 'integer', description: '最大樣本數', required: false }),
    ];
  }
}
