// 日志工具

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARNING: 2, ERROR: 3, CRITICAL: 4 };

class Logger {
  constructor(name, level = 'INFO') {
    this.name = name;
    this.level = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
  }

  _log(level, ...args) {
    if (LOG_LEVELS[level] >= this.level) {
      const timestamp = new Date().toISOString();
      console.log(`${timestamp} - ${this.name} - ${level} -`, ...args);
    }
  }

  debug(...args) { this._log('DEBUG', ...args); }
  info(...args) { this._log('INFO', ...args); }
  warning(...args) { this._log('WARNING', ...args); }
  error(...args) { this._log('ERROR', ...args); }
  critical(...args) { this._log('CRITICAL', ...args); }

  setLevel(level) {
    this.level = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
  }
}

const loggerCache = new Map();

export function setupLogger(name = 'hello_agents', level = 'INFO') {
  const logger = new Logger(name, level);
  loggerCache.set(name, logger);
  return logger;
}

export function getLogger(name = 'hello_agents') {
  if (!loggerCache.has(name)) {
    loggerCache.set(name, new Logger(name));
  }
  return loggerCache.get(name);
}
