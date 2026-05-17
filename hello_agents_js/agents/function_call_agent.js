// FunctionCallAgent - 使用OpenAI函数调用范式的Agent实现
import { Agent } from '../core/agent.js';
import { Message } from '../core/message.js';

function _mapParameterType(paramType) {
  const normalized = (paramType || '').toLowerCase();
  if (['string', 'number', 'integer', 'boolean', 'array', 'object'].includes(normalized)) {
    return normalized;
  }
  return 'string';
}

export class FunctionCallAgent extends Agent {
  constructor(name, llm, {
    systemPrompt = null,
    config = null,
    toolRegistry = null,
    enableToolCalling = true,
    defaultToolChoice = 'auto',
    maxToolIterations = 3,
  } = {}) {
    super(name, llm, systemPrompt, config);
    this.toolRegistry = toolRegistry;
    this.enableToolCalling = enableToolCalling && toolRegistry != null;
    this.defaultToolChoice = defaultToolChoice;
    this.maxToolIterations = maxToolIterations;
  }

  _getSystemPrompt() {
    const basePrompt = this.systemPrompt || '你是一个可靠的AI助理，能够在需要时调用工具完成任务。';
    if (!this.enableToolCalling || !this.toolRegistry) return basePrompt;
    const toolsDescription = this.toolRegistry.getToolsDescription();
    if (!toolsDescription || toolsDescription === '暂无可用工具') return basePrompt;
    let prompt = basePrompt + '\n\n## 可用工具\n';
    prompt += '当你判断需要外部信息或执行动作时，可以直接通过函数调用使用以下工具：\n';
    prompt += toolsDescription + '\n';
    prompt += '\n请主动决定是否调用工具，合理利用多次调用来获得完备答案。';
    return prompt;
  }

  _buildToolSchemas() {
    if (!this.enableToolCalling || !this.toolRegistry) return [];
    const schemas = [];

    for (const tool of this.toolRegistry.getAllTools()) {
      const properties = {};
      const required = [];
      let parameters;
      try { parameters = tool.getParameters(); } catch { parameters = []; }

      for (const param of parameters) {
        properties[param.name] = {
          type: _mapParameterType(param.type),
          description: param.description || '',
        };
        if (param.default != null) {
          properties[param.name].default = param.default;
        }
        if (param.required !== false) required.push(param.name);
      }

      const schema = {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description || '',
          parameters: { type: 'object', properties },
        },
      };
      if (required.length) schema.function.parameters.required = required;
      schemas.push(schema);
    }

    const functionMap = this.toolRegistry._functions || {};
    for (const [name, info] of Object.entries(functionMap)) {
      schemas.push({
        type: 'function',
        function: {
          name,
          description: info.description || '',
          parameters: {
            type: 'object',
            properties: { input: { type: 'string', description: '输入文本' } },
            required: ['input'],
          },
        },
      });
    }

    return schemas;
  }

  static _extractMessageContent(rawContent) {
    if (rawContent == null) return '';
    if (typeof rawContent === 'string') return rawContent;
    if (Array.isArray(rawContent)) {
      return rawContent.map(item => item?.text || item?.text || '').join('');
    }
    return String(rawContent);
  }

  static _parseFunctionCallArguments(args) {
    if (!args) return {};
    try {
      const parsed = JSON.parse(args);
      return typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch { return {}; }
  }

  _convertParameterTypes(toolName, paramDict) {
    if (!this.toolRegistry) return paramDict;
    const tool = this.toolRegistry.getTool(toolName);
    if (!tool) return paramDict;
    let toolParams;
    try { toolParams = tool.getParameters(); } catch { return paramDict; }

    const typeMapping = {};
    for (const p of toolParams) typeMapping[p.name] = p.type;

    const converted = {};
    for (const [key, value] of Object.entries(paramDict)) {
      const pt = typeMapping[key];
      if (!pt) { converted[key] = value; continue; }
      try {
        const norm = pt.toLowerCase();
        if (['number', 'float'].includes(norm)) converted[key] = parseFloat(value);
        else if (['integer', 'int'].includes(norm)) converted[key] = parseInt(value);
        else if (['boolean', 'bool'].includes(norm)) {
          converted[key] = typeof value === 'boolean' ? value : ['true', '1', 'yes'].includes(String(value).toLowerCase());
        } else converted[key] = value;
      } catch { converted[key] = value; }
    }
    return converted;
  }

  _executeToolCall(toolName, args) {
    if (!this.toolRegistry) return '❌ 错误：未配置工具注册表';
    const tool = this.toolRegistry.getTool(toolName);
    if (tool) {
      try {
        const typedArgs = this._convertParameterTypes(toolName, args);
        return tool.run(typedArgs);
      } catch (e) { return `❌ 工具调用失败：${e.message}`; }
    }
    const func = this.toolRegistry.getFunction(toolName);
    if (func) {
      try { return func(args.input || ''); } catch (e) { return `❌ 工具调用失败：${e.message}`; }
    }
    return `❌ 错误：未找到工具 '${toolName}'`;
  }

  async _invokeWithTools(messages, tools, toolChoice, kwargs = {}) {
    const client = this.llm._client;
    if (!client) throw new Error('HelloAgentsLLM 未正确初始化客户端');
    return client.chat.completions.create({
      model: this.llm.model,
      messages,
      tools,
      tool_choice: toolChoice,
      temperature: kwargs.temperature ?? this.llm.temperature,
      max_tokens: kwargs.max_tokens ?? this.llm.maxTokens,
    });
  }

  async run(inputText, { maxToolIterations = null, toolChoice = null, ...kwargs } = {}) {
    const messages = [];
    messages.push({ role: 'system', content: this._getSystemPrompt() });
    for (const msg of this._history) messages.push({ role: msg.role, content: msg.content });
    messages.push({ role: 'user', content: inputText });

    const toolSchemas = this._buildToolSchemas();
    if (!toolSchemas.length) {
      const responseText = await this.llm.invoke(messages, kwargs);
      this.addMessage(new Message(inputText, 'user'));
      this.addMessage(new Message(responseText, 'assistant'));
      return responseText;
    }

    const iterationsLimit = maxToolIterations ?? this.maxToolIterations;
    const effectiveToolChoice = toolChoice ?? this.defaultToolChoice;
    let currentIteration = 0;
    let finalResponse = '';

    while (currentIteration < iterationsLimit) {
      const response = await this._invokeWithTools(messages, toolSchemas, effectiveToolChoice, kwargs);
      const choice = response.choices[0];
      const assistantMessage = choice.message;
      const content = FunctionCallAgent._extractMessageContent(assistantMessage.content);
      const toolCalls = assistantMessage.tool_calls || [];

      if (toolCalls.length) {
        const assistantPayload = { role: 'assistant', content, tool_calls: [] };
        for (const tc of toolCalls) {
          assistantPayload.tool_calls.push({
            id: tc.id,
            type: tc.type,
            function: { name: tc.function.name, arguments: tc.function.arguments },
          });
        }
        messages.push(assistantPayload);

        for (const tc of toolCalls) {
          const args = FunctionCallAgent._parseFunctionCallArguments(tc.function.arguments);
          const result = this._executeToolCall(tc.function.name, args);
          messages.push({ role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: result });
        }
        currentIteration++;
        continue;
      }

      finalResponse = content;
      messages.push({ role: 'assistant', content: finalResponse });
      break;
    }

    if (currentIteration >= iterationsLimit && !finalResponse) {
      const finalChoice = await this._invokeWithTools(messages, toolSchemas, 'none', kwargs);
      finalResponse = FunctionCallAgent._extractMessageContent(finalChoice.choices[0].message.content);
      messages.push({ role: 'assistant', content: finalResponse });
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
    if (this.toolRegistry) {
      const before = new Set(this.toolRegistry.listTools());
      this.toolRegistry.unregister(toolName);
      const after = new Set(this.toolRegistry.listTools());
      return before.has(toolName) && !after.has(toolName);
    }
    return false;
  }

  listTools() {
    return this.toolRegistry ? this.toolRegistry.listTools() : [];
  }

  hasTools() {
    return this.enableToolCalling && this.toolRegistry != null;
  }
}
