// 消息系统

export class Message {
  /**
   * @param {string} content
   * @param {'user'|'assistant'|'system'|'tool'} role
   * @param {object} [options]
   * @param {Date} [options.timestamp]
   * @param {object} [options.metadata]
   */
  constructor(content, role, { timestamp, metadata } = {}) {
    this.content = content;
    this.role = role;
    this.timestamp = timestamp ?? new Date();
    this.metadata = metadata ?? {};
  }

  toDict() {
    return {
      role: this.role,
      content: this.content,
    };
  }

  toString() {
    return `[${this.role}] ${this.content}`;
  }
}
