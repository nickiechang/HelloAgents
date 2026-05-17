// Agent基类

import { Message } from './message.js';
import { HelloAgentsLLM } from './llm.js';
import { Config } from './config.js';

export class Agent {
  constructor(name, llm, systemPrompt = null, config = null) {
    if (new.target === Agent) {
      throw new Error('Agent is abstract and cannot be instantiated directly');
    }
    this.name = name;
    this.llm = llm;
    this.systemPrompt = systemPrompt;
    this.config = config || new Config();
    this._history = [];
  }

  async run(inputText, options = {}) {
    throw new Error('run() must be implemented by subclass');
  }

  addMessage(message) {
    this._history.push(message);
  }

  clearHistory() {
    this._history = [];
  }

  getHistory() {
    return [...this._history];
  }

  toString() {
    return `Agent(name=${this.name}, provider=${this.llm.provider})`;
  }
}
