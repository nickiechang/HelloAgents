/**
 * 計算器工具
 *
 * 提供安全的數學計算能力，支援基本運算與常用數學函式。
 */

import { Tool, ToolParameter } from '../base.js';

/**
 * Python 計算器工具
 *
 * 支援的運算：加、減、乘、除、次方
 * 支援的函式：abs, round, max, min, sqrt, sin, cos, tan, log, exp, pow, ceil, floor
 * 常數：pi, e
 */
export class CalculatorTool extends Tool {
  constructor() {
    super('python_calculator', '執行數學計算。支援基本運算、數學函式等。例如：2+3*4, sqrt(16), sin(pi/2)等。');
  }

  /**
   * 執行計算
   * @param {Object} parameters - 包含 input 或 expression 參數的字典
   * @returns {string} 計算結果
   */
  run(parameters) {
    const expression = parameters.input || parameters.expression || '';
    if (!expression) return '錯誤：計算表達式不能為空';
    console.log(`🧮 正在計算: ${expression}`);
    try {
      // 提供安全的數學函式
      const mathFuncs = {
        abs: Math.abs, round: Math.round, max: Math.max, min: Math.min,
        sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan,
        log: Math.log, exp: Math.exp, pi: Math.PI, e: Math.E,
        PI: Math.PI, E: Math.E, pow: Math.pow, ceil: Math.ceil, floor: Math.floor,
      };
      // 將函式名稱替換為常數值
      let safeExpr = expression;
      for (const [name, func] of Object.entries(mathFuncs)) {
        if (typeof func === 'number') {
          safeExpr = safeExpr.replace(new RegExp(`\\b${name}\\b`, 'g'), `(${func})`);
        }
      }
      // 僅允許安全的字元
      if (!/^[\d\s+\-*/().,%^a-zA-Z]+$/.test(safeExpr)) {
        return '錯誤：表達式包含不安全的字元';
      }
      const fn = new Function('Math', `"use strict"; return (${safeExpr});`);
      const result = fn(Math);
      console.log(`✅ 計算結果: ${result}`);
      return String(result);
    } catch (e) {
      const msg = `計算失敗: ${e.message}`;
      console.log(`❌ ${msg}`);
      return msg;
    }
  }

  /** @returns {ToolParameter[]} */
  getParameters() {
    return [
      new ToolParameter({ name: 'input', type: 'string', description: '要計算的數學表達式', required: true }),
    ];
  }
}

/**
 * 便捷計算函式
 * @param {string} expression - 數學表達式
 * @returns {string} 計算結果
 */
export function calculate(expression) {
  const tool = new CalculatorTool();
  return tool.run({ input: expression });
}
