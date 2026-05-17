/**
 * 非同步工具執行器 — HelloAgents 非同步工具執行支援
 *
 * 提供工具的並行執行和批次執行能力，
 * 利用 Promise.all 實現多工具同時執行。
 */

/**
 * 非同步工具執行器
 */
export class AsyncToolExecutor {
  /**
   * @param {import('./registry.js').ToolRegistry} registry - 工具註冊表
   * @param {number} maxWorkers - 最大並行數（JS 中僅作為語義提示）
   */
  constructor(registry, maxWorkers = 4) {
    this.registry = registry;
    this.maxWorkers = maxWorkers;
  }

  /**
   * 非同步執行單個工具
   * @param {string} toolName - 工具名稱
   * @param {string} inputData - 輸入資料
   * @returns {Promise<string>} 執行結果
   */
  async executeToolAsync(toolName, inputData) {
    try {
      return this.registry.executeTool(toolName, inputData);
    } catch (e) {
      return `❌ 工具 '${toolName}' 非同步執行失敗: ${e.message}`;
    }
  }

  /**
   * 並行執行多個工具
   * @param {Array<{toolName: string, inputData: string}>} tasks - 任務列表
   * @returns {Promise<Array<{taskId: number, toolName: string, inputData: string, result: string, status: string}>>}
   */
  async executeToolsParallel(tasks) {
    console.log(`🚀 開始並行執行 ${tasks.length} 個工具任務`);

    const promises = tasks
      .filter(task => task.toolName)
      .map((task, i) => {
        console.log(`📝 建立任務 ${i + 1}: ${task.toolName}`);
        return this.executeToolAsync(task.toolName, task.inputData || '')
          .then(result => {
            console.log(`✅ 任務 ${i + 1} 完成: ${task.toolName}`);
            return {
              taskId: i,
              toolName: task.toolName,
              inputData: task.inputData,
              result,
              status: 'success',
            };
          })
          .catch(e => {
            console.log(`❌ 任務 ${i + 1} 失敗: ${task.toolName} - ${e.message}`);
            return {
              taskId: i,
              toolName: task.toolName,
              inputData: task.inputData,
              result: e.message,
              status: 'error',
            };
          });
      });

    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.status === 'success').length;
    console.log(`🎉 並行執行完成，成功: ${successCount}/${results.length}`);
    return results;
  }

  /**
   * 批次執行同一個工具
   * @param {string} toolName - 工具名稱
   * @param {string[]} inputList - 輸入資料列表
   * @returns {Promise<Array<Object>>} 執行結果列表
   */
  async executeToolsBatch(toolName, inputList) {
    const tasks = inputList.map(inputData => ({ toolName, inputData }));
    return this.executeToolsParallel(tasks);
  }
}

// ==================
// 便捷函式
// ==================

/**
 * 便捷函式：並行執行多個工具
 * @param {import('./registry.js').ToolRegistry} registry - 工具註冊表
 * @param {Array<{toolName: string, inputData: string}>} tasks - 任務列表
 * @param {number} maxWorkers - 最大並行數
 * @returns {Promise<Array<Object>>} 執行結果列表
 */
export async function runParallelTools(registry, tasks, maxWorkers = 4) {
  const executor = new AsyncToolExecutor(registry, maxWorkers);
  return executor.executeToolsParallel(tasks);
}

/**
 * 便捷函式：批次執行同一個工具
 * @param {import('./registry.js').ToolRegistry} registry - 工具註冊表
 * @param {string} toolName - 工具名稱
 * @param {string[]} inputList - 輸入資料列表
 * @param {number} maxWorkers - 最大並行數
 * @returns {Promise<Array<Object>>} 執行結果列表
 */
export async function runBatchTool(registry, toolName, inputList, maxWorkers = 4) {
  const executor = new AsyncToolExecutor(registry, maxWorkers);
  return executor.executeToolsBatch(toolName, inputList);
}
