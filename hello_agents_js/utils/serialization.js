// 序列化工具
import { readFileSync, writeFileSync } from 'fs';

export function serializeObject(obj, format = 'json') {
  if (format === 'json') {
    return JSON.stringify(obj, null, 2);
  }
  throw new Error(`不支持的序列化格式: ${format}`);
}

export function deserializeObject(data, format = 'json') {
  if (format === 'json') {
    return JSON.parse(data);
  }
  throw new Error(`不支持的反序列化格式: ${format}`);
}

export function saveToFile(obj, filepath, format = 'json') {
  const data = serializeObject(obj, format);
  writeFileSync(filepath, data, 'utf-8');
}

export function loadFromFile(filepath, format = 'json') {
  const data = readFileSync(filepath, 'utf-8');
  return deserializeObject(data, format);
}
