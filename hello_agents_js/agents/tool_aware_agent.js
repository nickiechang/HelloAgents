// ToolAwareSimpleAgent - SimpleAgent子类，记录工具调用情况
import { SimpleAgent } from './simple_agent.js';

export class ToolAwareSimpleAgent extends SimpleAgent {
  constructor(...args) {
    const lastArg = args[args.length - 1];
    let toolCallListener = null;
    if (lastArg && typeof lastArg === 'object' && 'toolCallListener' in lastArg) {
      toolCallListener = lastArg.toolCallListener;
    }
    super(...args);
    this._toolCallListener = toolCallListener;
  }

  _executeToolCall(toolName, parameters) {
    if (!this.toolRegistry) return '❌ 错误：未配置工具注册表';

    let parsedParameters = {};
    let formattedResult;
    try {
      const tool = this.toolRegistry.getTool(toolName);
      if (!tool) return `❌ 错误：未找到工具 '${toolName}'`;
      parsedParameters = this._parseToolParameters(toolName, parameters);
      parsedParameters = ToolAwareSimpleAgent._sanitizeParameters(parsedParameters);
      const result = tool.run(parsedParameters);
      formattedResult = `🔧 工具 ${toolName} 执行结果：\n${result}`;
    } catch (e) {
      formattedResult = `❌ 工具调用失败：${e.message}`;
    }

    if (this._toolCallListener) {
      try {
        this._toolCallListener({
          agentName: this.name,
          toolName,
          rawParameters: parameters,
          parsedParameters,
          result: formattedResult,
        });
      } catch { /* listener failure */ }
    }
    return formattedResult;
  }

  _parseToolCalls(text) {
    const marker = '[TOOL_CALL:';
    const calls = [];
    let start = 0;

    while (true) {
      const begin = text.indexOf(marker, start);
      if (begin === -1) break;

      const toolStart = begin + marker.length;
      const colon = text.indexOf(':', toolStart);
      if (colon === -1) break;

      const toolName = text.slice(toolStart, colon).trim();
      const bodyStart = colon + 1;
      let pos = bodyStart;
      let depth = 0;
      let inString = false;
      let stringQuote = '';

      while (pos < text.length) {
        const char = text[pos];
        if ((char === '"' || char === "'")) {
          if (!inString) { inString = true; stringQuote = char; }
          else if (stringQuote === char && text[pos - 1] !== '\\') { inString = false; }
        }
        if (!inString) {
          if (char === '[') depth++;
          else if (char === ']') {
            if (depth === 0) {
              const body = text.slice(bodyStart, pos).trim();
              const original = text.slice(begin, pos + 1);
              calls.push({ toolName, parameters: body, original });
              start = pos + 1;
              break;
            } else depth--;
          }
        }
        pos++;
      }
      if (pos >= text.length) break;
    }
    return calls;
  }

  static _sanitizeParameters(parameters) {
    const sanitized = {};
    for (const [key, value] of Object.entries(parameters)) {
      if (typeof value !== 'string') { sanitized[key] = value; continue; }
      let normalized = ToolAwareSimpleAgent._normalizeString(value);
      if (key === 'task_id') {
        const num = parseInt(normalized);
        if (!isNaN(num)) { sanitized[key] = num; continue; }
      }
      if (key === 'tags') {
        try {
          const parsed = JSON.parse(normalized);
          if (Array.isArray(parsed)) { sanitized[key] = parsed; continue; }
        } catch { /* not JSON */ }
        if (normalized) { sanitized[key] = normalized.split(',').map(s => s.trim()).filter(Boolean); continue; }
      }
      sanitized[key] = normalized;
    }
    return sanitized;
  }

  static _normalizeString(value) {
    let trimmed = value.trim();
    if (trimmed && (trimmed[0] === '"' || trimmed[0] === "'")) {
      if (trimmed[trimmed.length - 1] === trimmed[0]) {
        trimmed = trimmed.slice(1, -1);
      }
    }
    return trimmed.trim();
  }

  static attachRegistry(agent, registry) {
    if (registry) {
      agent.toolRegistry = registry;
      agent.enableToolCalling = true;
    }
  }
}
