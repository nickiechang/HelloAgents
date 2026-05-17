/**
 * NoteTool — 結構化筆記工具
 *
 * 為 Agent 提供結構化筆記管理能力，支援多種筆記類型：
 * - task_state：任務狀態
 * - conclusion：關鍵結論
 * - blocker：阻塞項
 * - action：行動計劃
 * - reference：參考資料
 * - general：通用筆記
 */

import { Tool, ToolParameter } from '../base.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export class NoteTool extends Tool {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.workspace='./notes'] - 筆記儲存目錄
   * @param {boolean} [opts.autoBackup=true] - 是否自動備份
   * @param {number} [opts.maxNotes=1000] - 筆記數量上限
   * @param {boolean} [opts.expandable=false] - 是否可展開
   */
  constructor({ workspace = './notes', autoBackup = true, maxNotes = 1000, expandable = false } = {}) {
    super('note', '筆記工具 — 建立、讀取、更新、刪除結構化筆記，支援任務狀態、結論、阻塞項等類型', { expandable });
    this.workspace = workspace;
    this.autoBackup = autoBackup;
    this.maxNotes = maxNotes;
    this.indexFile = join(workspace, 'notes_index.json');
    mkdirSync(workspace, { recursive: true });
    this._loadIndex();
  }

  /** 載入筆記索引 */
  _loadIndex() {
    if (existsSync(this.indexFile)) {
      this.notesIndex = JSON.parse(readFileSync(this.indexFile, 'utf-8'));
    } else {
      this.notesIndex = { notes: [], metadata: { created_at: new Date().toISOString(), total_notes: 0 } };
      this._saveIndex();
    }
  }

  /** 儲存筆記索引 */
  _saveIndex() {
    writeFileSync(this.indexFile, JSON.stringify(this.notesIndex, null, 2), 'utf-8');
  }

  /** 產生筆記 ID */
  _generateNoteId() {
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
    return `note_${ts}_${this.notesIndex.notes.length}`;
  }

  /**
   * 執行工具
   * @param {Object} parameters
   * @returns {string}
   */
  run(parameters) {
    const action = parameters.action;
    if (action === 'create') return this._createNote(parameters);
    if (action === 'read') return this._readNote(parameters);
    if (action === 'list') return this._listNotes(parameters);
    if (action === 'search') return this._searchNotes(parameters);
    if (action === 'delete') return this._deleteNote(parameters);
    if (action === 'summary') return this._getSummary();
    return `❌ 不支援的操作: ${action}`;
  }

  /** 建立筆記 */
  _createNote(params) {
    const { title, content, note_type = 'general', tags = [] } = params;
    if (!title || !content) return '❌ 建立筆記需要提供 title 和 content';
    if (this.notesIndex.notes.length >= this.maxNotes) return `❌ 筆記數量已達上限 (${this.maxNotes})`;

    const noteId = this._generateNoteId();
    const note = { id: noteId, title, content, type: note_type, tags: Array.isArray(tags) ? tags : [], created_at: new Date().toISOString() };
    const notePath = join(this.workspace, `${noteId}.json`);
    writeFileSync(notePath, JSON.stringify(note, null, 2), 'utf-8');

    this.notesIndex.notes.push({ id: noteId, title, type: note_type, tags: note.tags, created_at: note.created_at });
    this.notesIndex.metadata.total_notes = this.notesIndex.notes.length;
    this._saveIndex();
    return `✅ 筆記建立成功\nID: ${noteId}\n標題: ${title}\n類型: ${note_type}`;
  }

  /** 讀取筆記 */
  _readNote(params) {
    const noteId = params.note_id;
    if (!noteId) return '❌ 讀取筆記需要提供 note_id';
    const notePath = join(this.workspace, `${noteId}.json`);
    if (!existsSync(notePath)) return `❌ 筆記不存在: ${noteId}`;
    const note = JSON.parse(readFileSync(notePath, 'utf-8'));
    return `📝 ${note.title}\n類型: ${note.type}\n內容: ${note.content}`;
  }

  /** 列出筆記 */
  _listNotes(params) {
    const noteType = params.note_type;
    const limit = params.limit || 10;
    let notes = this.notesIndex.notes;
    if (noteType) notes = notes.filter(n => n.type === noteType);
    notes = notes.slice(0, limit);
    if (!notes.length) return '📋 暫無筆記';
    const lines = [`📋 筆記列表 (${notes.length} 條):`];
    notes.forEach((n, i) => lines.push(`${i + 1}. [${n.type}] ${n.title} (${n.id})`));
    return lines.join('\n');
  }

  /** 搜尋筆記 */
  _searchNotes(params) {
    const query = (params.query || '').toLowerCase();
    if (!query) return '❌ 搜尋需要提供 query';
    const results = this.notesIndex.notes.filter(n =>
      n.title.toLowerCase().includes(query) || (n.tags || []).some(t => t.toLowerCase().includes(query))
    );
    if (!results.length) return `🔍 未找到與 '${query}' 相關的筆記`;
    const lines = [`🔍 找到 ${results.length} 條筆記:`];
    results.slice(0, params.limit || 10).forEach((n, i) => lines.push(`${i + 1}. [${n.type}] ${n.title}`));
    return lines.join('\n');
  }

  /** 刪除筆記 */
  _deleteNote(params) {
    const noteId = params.note_id;
    if (!noteId) return '❌ 刪除筆記需要提供 note_id';
    this.notesIndex.notes = this.notesIndex.notes.filter(n => n.id !== noteId);
    this.notesIndex.metadata.total_notes = this.notesIndex.notes.length;
    this._saveIndex();
    return `✅ 筆記已刪除: ${noteId}`;
  }

  /** 取得筆記摘要 */
  _getSummary() {
    const byType = {};
    for (const n of this.notesIndex.notes) {
      byType[n.type] = (byType[n.type] || 0) + 1;
    }
    const lines = ['📊 筆記摘要', `總數: ${this.notesIndex.notes.length}`];
    for (const [type, count] of Object.entries(byType)) lines.push(`  ${type}: ${count}`);
    return lines.join('\n');
  }

  /** @returns {ToolParameter[]} */
  getParameters() {
    return [
      new ToolParameter({ name: 'action', type: 'string', description: '操作：create/read/list/search/delete/summary', required: true }),
      new ToolParameter({ name: 'title', type: 'string', description: '筆記標題', required: false }),
      new ToolParameter({ name: 'content', type: 'string', description: '筆記內容', required: false }),
      new ToolParameter({ name: 'note_type', type: 'string', description: '筆記類型', required: false, default: 'general' }),
      new ToolParameter({ name: 'tags', type: 'array', description: '標籤列表', required: false }),
      new ToolParameter({ name: 'note_id', type: 'string', description: '筆記ID', required: false }),
      new ToolParameter({ name: 'query', type: 'string', description: '搜尋關鍵詞', required: false }),
      new ToolParameter({ name: 'limit', type: 'integer', description: '結果數量限制', required: false, default: 10 }),
    ];
  }
}
