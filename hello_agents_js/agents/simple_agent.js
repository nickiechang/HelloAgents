// 简单Agent实现 - 基于OpenAI原生API
import { Agent } from '../core/agent.js';
import { Message } from '../core/message.js';

export class SimpleAgent extends Agent {
  constructor(name, llm, { systemPrompt = null, config = null, toolRegistry = null, enableToolCalling = true } = {}) {
    super(name, llm, systemPrompt, config);
    this.toolRegistry = toolRegistry;
    this.enableToolCalling = enableToolCalling && toolRegistry != null;
  }

  _getEnhancedSystemPrompt() {
    const basePrompt = this.systemPrompt || '你是一个有用的AI助手。';
    if (!this.enableToolCalling || !this.toolRegistry) return basePrompt;

    const toolsDescription = this.toolRegistry.getToolsDescription();
    if (!toolsDescription || toolsDescription === '暂无可用工具') return basePrompt;

    let toolsSection = '\n\n## 可用工具\n';
    toolsSection += '你可以使用以下工具来帮助回答问题：\n';
    toolsSection += toolsDescription + '\n';
    toolsSection += '\n## 工具调用格式\n';
    toolsSection += '当需要使用工具时，请使用以下格式：\n';
    toolsSection += '`[TOOL_CALL:{tool_name}:{parameters}]`\n\n';
    toolsSection += '### 参数格式说明\n';
    toolsSection += '1. **多个参数**：使用 `key=value` 格式，用逗号分隔\n';
    toolsSection += '   示例：`[TOOL_CALL:calculator_multiply:a=12,b=8]`\n\n';
    toolsSection += '2. **单个参数**：直接使用 `key=value`\n';
    toolsSection += '   示例：`[TOOL_CALL:search:query=Python编程]`\n\n';
    toolsSection += '3. **简单查询**：可以直接传入文本\n';
    toolsSection += '   示例：`[TOOL_CALL:search:Python编程]`\n\n';
    toolsSection += '### 重要提示\n';
    toolsSection += '- 参数名必须与工具定义的参数名完全匹配\n';
    toolsSection += '- 数字参数直接写数字：`a=12`\n';
    toolsSection += '- 工具调用结果会自动插入到对话中\n';
    return basePrompt + toolsSection;
  }

  _parseToolCalls(text) {
    const pattern = /\[TOOL_CALL:([^:]+):([^\]]+)\]/g;
    const calls = [];
    let match;
    while ((match = pattern.exec(text)) !== null) {
      calls.push({
        toolName: match[1].trim(),
        parameters: match[2].trim(),
        original: match[0],
      });
    }
    return calls;
  }

  _executeToolCall(toolName, parameters) {
    if (!this.toolRegistry) return '❌ 错误：未配置工具注册表';
    try {
      const tool = this.toolRegistry.getTool(toolName);
      if (!tool) return `❌ 错误：未找到工具 '${toolName}'`;
      const paramDict = this._parseToolParameters(toolName, parameters);
      const result = tool.run(paramDict);
      return `🔧 工具 ${toolName} 执行结果：\n${result}`;
    } catch (e) {
      return `❌ 工具调用失败：${e.message}`;
    }
  }

  _parseToolParameters(toolName, parameters) {
    const paramDict = {};
    try {
      if (parameters.trim().startsWith('{')) {
        return JSON.parse(parameters);
      }
    } catch { /* not JSON */ }

    if (parameters.includes('=')) {
      const pairs = parameters.includes(',') ? parameters.split(',') : [parameters];
      for (const pair of pairs) {
        if (pair.includes('=')) {
          const [key, ...rest] = pair.split('=');
          paramDict[key.trim()] = rest.join('=').trim();
        }
      }
      return this._convertParameterTypes(toolName, paramDict);
    }
    return this._inferSimpleParameters(toolName, parameters);
  }

  _convertParameterTypes(toolName, paramDict) {
    if (!this.toolRegistry) return paramDict;
    const tool = this.toolRegistry.getTool(toolName);
    if (!tool) return paramDict;
    let toolParams;
    try { toolParams = tool.getParameters(); } catch { return paramDict; }

    const typeMap = {};
    for (const p of toolParams) typeMap[p.name] = p.type;

    const converted = {};
    for (const [key, value] of Object.entries(paramDict)) {
      const pType = typeMap[key];
      if (pType === 'number' || pType === 'integer') {
        converted[key] = pType === 'integer' ? parseInt(value) : parseFloat(value);
      } else if (pType === 'boolean') {
        converted[key] = ['true', '1', 'yes'].includes(String(value).toLowerCase());
      } else {
        converted[key] = value;
      }
    }
    return converted;
  }

  _inferSimpleParameters(toolName, parameters) {
    if (toolName === 'rag' || toolName === 'memory') {
      return { action: 'search', query: parameters };
    }
    return { input: parameters };
  }

  async run(inputText, { maxToolIterations = 3, ...kwargs } = {}) {
    const messages = [];
    const enhancedSystemPrompt = this._getEnhancedSystemPrompt();
    messages.push({ role: 'system', content: enhancedSystemPrompt });
    for (const msg of this._history) {
      messages.push({ role: msg.role, content: msg.content });
    }
    messages.push({ role: 'user', content: inputText });

    if (!this.enableToolCalling) {
      const response = await this.llm.invoke(messages, kwargs);
      this.addMessage(new Message(inputText, 'user'));
      this.addMessage(new Message(response, 'assistant'));
      return response;
    }

    let currentIteration = 0;
    let finalResponse = '';

    while (currentIteration < maxToolIterations) {
      const response = await this.llm.invoke(messages, kwargs);
      const toolCalls = this._parseToolCalls(response);

      if (toolCalls.length > 0) {
        const toolResults = [];
        let cleanResponse = response;
        messages.push({ role: 'assistant', content: cleanResponse });

        for (const call of toolCalls) {
          const result = this._executeToolCall(call.toolName, call.parameters);
          toolResults.push(result);
          cleanResponse = cleanResponse.replace(call.original, '');
        }

        const toolResultsText = toolResults.join('\n\n');
        messages.push({ role: 'user', content: `工具执行结果：\n${toolResultsText}\n\n请基于这些结果给出完整的回答。` });
        currentIteration++;
        continue;
      }

      finalResponse = response;
      break;
    }

    if (currentIteration >= maxToolIterations && !finalResponse) {
      finalResponse = await this.llm.invoke(messages, kwargs);
    }

    this.addMessage(new Message(inputText, 'user'));
    this.addMessage(new Message(finalResponse, 'assistant'));
    return finalResponse;
  }

  addTool(tool) {
    if (!this.toolRegistry) {
      const { ToolRegistry } = require('../tools/registry.js');
      this.toolRegistry = new ToolRegistry();
      this.enableToolCalling = true;
    }
    this.toolRegistry.registerTool(tool);
  }

  removeTool(toolName) {
    if (this.toolRegistry) return this.toolRegistry.unregisterTool(toolName);
    return false;
  }

  listTools() {
    if (this.toolRegistry) return this.toolRegistry.listTools();
    return [];
  }

  hasTools() {
    return this.enableToolCalling && this.toolRegistry != null;
  }

  async *streamRun(inputText, kwargs = {}) {
    const messages = [];
    if (this.systemPrompt) messages.push({ role: 'system', content: this.systemPrompt });
    for (const msg of this._history) messages.push({ role: msg.role, content: msg.content });
    messages.push({ role: 'user', content: inputText });

    let fullResponse = '';
    for await (const chunk of this.llm.streamInvoke(messages, kwargs)) {
      fullResponse += chunk;
      yield chunk;
    }
    this.addMessage(new Message(inputText, 'user'));
    this.addMessage(new Message(fullResponse, 'assistant'));
  }
}
