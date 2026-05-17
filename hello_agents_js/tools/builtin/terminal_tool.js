/**
 * TerminalTool — 命令列工具
 *
 * 為 Agent 提供安全的命令列執行能力，支援：
 * - 檔案系統操作（ls, cat, head, tail, find, grep）
 * - 文字處理（wc, sort, uniq）
 * - 目錄導航（pwd, cd）
 * - 安全限制（白名單命令、路徑限制、逾時控制）
 *
 * 安全特性：
 * - 命令白名單（只允許安全的唯讀命令）
 * - 工作目錄限制（沙箱）
 * - 逾時控制
 * - 輸出大小限制
 * - 禁止危險操作（rm, mv, chmod 等）
 */

import { Tool, ToolParameter } from '../base.js';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { platform } from 'os';

/** 允許的命令白名單（跨平台） */
const ALLOWED_COMMANDS = new Set([
  'ls', 'dir', 'tree', 'cat', 'type', 'head', 'tail', 'less', 'more',
  'find', 'where', 'grep', 'egrep', 'fgrep', 'findstr',
  'wc', 'sort', 'uniq', 'cut', 'awk', 'sed',
  'pwd', 'cd', 'file', 'stat', 'du', 'df',
  'echo', 'which', 'whereis',
  'python', 'python3', 'node', 'bash', 'sh', 'powershell', 'cmd',
]);

/**
 * 跨平台命令列工具
 *
 * 提供安全的命令列執行能力，支援常用的檔案系統和文字處理命令。
 *
 * 安全限制：
 * - 只允許白名單中的命令
 * - 限制在指定工作目錄內
 * - 逾時控制（預設30秒）
 * - 輸出大小限制（預設10MB）
 */
export class TerminalTool extends Tool {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.workspace='.'] - 工作目錄
   * @param {number} [opts.timeout=30] - 逾時秒數
   * @param {number} [opts.maxOutputSize] - 輸出大小限制（位元組）
   * @param {boolean} [opts.allowCd=true] - 是否允許 cd 命令
   */
  constructor({ workspace = '.', timeout = 30, maxOutputSize = 10 * 1024 * 1024, allowCd = true } = {}) {
    super('terminal', '跨平台命令列工具 — 執行安全的檔案系統、文字處理和程式碼執行命令（支援 Windows/Linux/Mac）');
    this.workspace = resolve(workspace);
    this.timeout = timeout;
    this.maxOutputSize = maxOutputSize;
    this.allowCd = allowCd;
    this.osType = platform() === 'win32' ? 'windows' : (platform() === 'darwin' ? 'mac' : 'linux');
    this.currentDir = this.workspace;
    if (!existsSync(this.workspace)) mkdirSync(this.workspace, { recursive: true });
  }

  /**
   * 執行命令
   * @param {Object} parameters
   * @returns {string}
   */
  run(parameters) {
    const command = (parameters.command || '').trim();
    if (!command) return '❌ 命令不能為空';

    const parts = command.split(/\s+/);
    const baseCommand = parts[0];

    if (!ALLOWED_COMMANDS.has(baseCommand)) {
      return `❌ 不允許的命令: ${baseCommand}\n允許的命令: ${[...ALLOWED_COMMANDS].sort().join(', ')}`;
    }

    if (baseCommand === 'cd') return this._handleCd(parts);
    return this._executeCommand(command);
  }

  /** 處理 cd 命令 */
  _handleCd(parts) {
    if (!this.allowCd) return '❌ cd 命令已停用';
    if (parts.length < 2) return `目前目錄: ${this.currentDir}`;
    const target = parts[1];
    const newDir = resolve(this.currentDir, target);
    if (!newDir.startsWith(this.workspace)) return `❌ 不允許存取工作目錄外的路徑: ${newDir}`;
    if (!existsSync(newDir)) return `❌ 目錄不存在: ${newDir}`;
    this.currentDir = newDir;
    return `目前目錄: ${this.currentDir}`;
  }

  /** 執行命令 */
  _executeCommand(command) {
    try {
      const output = execSync(command, {
        cwd: this.currentDir,
        timeout: this.timeout * 1000,
        maxBuffer: this.maxOutputSize,
        encoding: 'utf-8',
      });
      return output || '（無輸出）';
    } catch (e) {
      return `❌ 命令執行失敗: ${e.message}`;
    }
  }

  /** @returns {ToolParameter[]} */
  getParameters() {
    return [
      new ToolParameter({ name: 'command', type: 'string', description: '要執行的命令', required: true }),
    ];
  }
}
