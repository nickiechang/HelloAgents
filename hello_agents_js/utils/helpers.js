// 辅助工具函数

export function formatTime(timestamp = null, formatStr = null) {
  const date = timestamp || new Date();
  if (formatStr) {
    return formatStr
      .replace('%Y', date.getFullYear())
      .replace('%m', String(date.getMonth() + 1).padStart(2, '0'))
      .replace('%d', String(date.getDate()).padStart(2, '0'))
      .replace('%H', String(date.getHours()).padStart(2, '0'))
      .replace('%M', String(date.getMinutes()).padStart(2, '0'))
      .replace('%S', String(date.getSeconds()).padStart(2, '0'));
  }
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

export function validateConfig(config, requiredKeys) {
  const missingKeys = requiredKeys.filter(key => !(key in config));
  if (missingKeys.length) {
    throw new Error(`配置缺少必需的键: ${JSON.stringify(missingKeys)}`);
  }
  return true;
}

export function safeImport(moduleName) {
  try {
    return require(moduleName);
  } catch (e) {
    throw new Error(`无法导入 ${moduleName}: ${e.message}`);
  }
}

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { mkdirSync, existsSync } from 'fs';

export function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

export function getProjectRoot() {
  const __filename = fileURLToPath(import.meta.url);
  return resolve(dirname(__filename), '..', '..');
}

export function mergeDicts(dict1, dict2) {
  const result = { ...dict1 };
  for (const [key, value] of Object.entries(dict2)) {
    if (key in result && typeof result[key] === 'object' && !Array.isArray(result[key])
        && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = mergeDicts(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
