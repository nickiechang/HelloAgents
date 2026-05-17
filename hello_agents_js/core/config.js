// 配置管理

export class Config {
  constructor({
    defaultModel = 'gpt-3.5-turbo',
    defaultProvider = 'openai',
    temperature = 0.7,
    maxTokens = null,
    debug = false,
    logLevel = 'INFO',
    maxHistoryLength = 100,
  } = {}) {
    this.defaultModel = defaultModel;
    this.defaultProvider = defaultProvider;
    this.temperature = temperature;
    this.maxTokens = maxTokens;
    this.debug = debug;
    this.logLevel = logLevel;
    this.maxHistoryLength = maxHistoryLength;
  }

  static fromEnv() {
    return new Config({
      debug: (process.env.DEBUG || 'false').toLowerCase() === 'true',
      logLevel: process.env.LOG_LEVEL || 'INFO',
      temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
      maxTokens: process.env.MAX_TOKENS ? parseInt(process.env.MAX_TOKENS) : null,
    });
  }

  toDict() {
    return { ...this };
  }
}
