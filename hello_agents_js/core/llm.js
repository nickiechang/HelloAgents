// HelloAgents统一LLM接口 - 基于OpenAI原生API
import OpenAI from 'openai';
import { HelloAgentsException } from './exceptions.js';

const SUPPORTED_PROVIDERS = [
  'openai', 'deepseek', 'qwen', 'modelscope', 'kimi',
  'zhipu', 'ollama', 'vllm', 'local', 'auto', 'custom',
];

export class HelloAgentsLLM {
  constructor({
    model = null,
    apiKey = null,
    baseUrl = null,
    provider = null,
    temperature = 0.7,
    maxTokens = null,
    timeout = null,
  } = {}) {
    this.model = model || process.env.LLM_MODEL_ID;
    this.temperature = temperature;
    this.maxTokens = maxTokens;
    this.timeout = timeout || parseInt(process.env.LLM_TIMEOUT || '60');

    const requestedProvider = provider ? provider.toLowerCase() : null;
    this.provider = provider || this._autoDetectProvider(apiKey, baseUrl);

    if (requestedProvider === 'custom') {
      this.provider = 'custom';
      this.apiKey = apiKey || process.env.LLM_API_KEY;
      this.baseUrl = baseUrl || process.env.LLM_BASE_URL;
    } else {
      const [resolvedKey, resolvedUrl] = this._resolveCredentials(apiKey, baseUrl);
      this.apiKey = resolvedKey;
      this.baseUrl = resolvedUrl;
    }

    if (!this.model) {
      this.model = this._getDefaultModel();
    }
    if (!this.apiKey || !this.baseUrl) {
      throw new HelloAgentsException('API密钥和服务地址必须被提供或在环境变量中定义。');
    }

    this._client = this._createClient();
  }

  _autoDetectProvider(apiKey, baseUrl) {
    if (process.env.OPENAI_API_KEY) return 'openai';
    if (process.env.DEEPSEEK_API_KEY) return 'deepseek';
    if (process.env.DASHSCOPE_API_KEY) return 'qwen';
    if (process.env.MODELSCOPE_API_KEY) return 'modelscope';
    if (process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY) return 'kimi';
    if (process.env.ZHIPU_API_KEY || process.env.GLM_API_KEY) return 'zhipu';
    if (process.env.OLLAMA_API_KEY || process.env.OLLAMA_HOST) return 'ollama';
    if (process.env.VLLM_API_KEY || process.env.VLLM_HOST) return 'vllm';

    const actualApiKey = apiKey || process.env.LLM_API_KEY;
    if (actualApiKey) {
      const keyLower = actualApiKey.toLowerCase();
      if (actualApiKey.startsWith('ms-')) return 'modelscope';
      if (keyLower === 'ollama') return 'ollama';
      if (keyLower === 'vllm') return 'vllm';
      if (keyLower === 'local') return 'local';
    }

    const actualBaseUrl = baseUrl || process.env.LLM_BASE_URL;
    if (actualBaseUrl) {
      const urlLower = actualBaseUrl.toLowerCase();
      if (urlLower.includes('api.openai.com')) return 'openai';
      if (urlLower.includes('api.deepseek.com')) return 'deepseek';
      if (urlLower.includes('dashscope.aliyuncs.com')) return 'qwen';
      if (urlLower.includes('api-inference.modelscope.cn')) return 'modelscope';
      if (urlLower.includes('api.moonshot.cn')) return 'kimi';
      if (urlLower.includes('open.bigmodel.cn')) return 'zhipu';
      if (urlLower.includes('localhost') || urlLower.includes('127.0.0.1')) {
        if (urlLower.includes(':11434') || urlLower.includes('ollama')) return 'ollama';
        if (urlLower.includes(':8000') && urlLower.includes('vllm')) return 'vllm';
        return 'local';
      }
    }
    return 'auto';
  }

  _resolveCredentials(apiKey, baseUrl) {
    const providerMap = {
      openai: {
        key: () => apiKey || process.env.OPENAI_API_KEY || process.env.LLM_API_KEY,
        url: () => baseUrl || process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
      },
      deepseek: {
        key: () => apiKey || process.env.DEEPSEEK_API_KEY || process.env.LLM_API_KEY,
        url: () => baseUrl || process.env.LLM_BASE_URL || 'https://api.deepseek.com',
      },
      qwen: {
        key: () => apiKey || process.env.DASHSCOPE_API_KEY || process.env.LLM_API_KEY,
        url: () => baseUrl || process.env.LLM_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      },
      modelscope: {
        key: () => apiKey || process.env.MODELSCOPE_API_KEY || process.env.LLM_API_KEY,
        url: () => baseUrl || process.env.LLM_BASE_URL || 'https://api-inference.modelscope.cn/v1/',
      },
      kimi: {
        key: () => apiKey || process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY || process.env.LLM_API_KEY,
        url: () => baseUrl || process.env.LLM_BASE_URL || 'https://api.moonshot.cn/v1',
      },
      zhipu: {
        key: () => apiKey || process.env.ZHIPU_API_KEY || process.env.GLM_API_KEY || process.env.LLM_API_KEY,
        url: () => baseUrl || process.env.LLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
      },
      ollama: {
        key: () => apiKey || process.env.OLLAMA_API_KEY || process.env.LLM_API_KEY || 'ollama',
        url: () => baseUrl || process.env.OLLAMA_HOST || process.env.LLM_BASE_URL || 'http://localhost:11434/v1',
      },
      vllm: {
        key: () => apiKey || process.env.VLLM_API_KEY || process.env.LLM_API_KEY || 'vllm',
        url: () => baseUrl || process.env.VLLM_HOST || process.env.LLM_BASE_URL || 'http://localhost:8000/v1',
      },
      local: {
        key: () => apiKey || process.env.LLM_API_KEY || 'local',
        url: () => baseUrl || process.env.LLM_BASE_URL || 'http://localhost:8000/v1',
      },
      custom: {
        key: () => apiKey || process.env.LLM_API_KEY,
        url: () => baseUrl || process.env.LLM_BASE_URL,
      },
    };

    const entry = providerMap[this.provider] || {
      key: () => apiKey || process.env.LLM_API_KEY,
      url: () => baseUrl || process.env.LLM_BASE_URL,
    };
    return [entry.key(), entry.url()];
  }

  _createClient() {
    return new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
      timeout: this.timeout * 1000,
    });
  }

  _getDefaultModel() {
    const modelMap = {
      openai: 'gpt-3.5-turbo',
      deepseek: 'deepseek-chat',
      qwen: 'qwen-plus',
      modelscope: 'Qwen/Qwen2.5-72B-Instruct',
      kimi: 'moonshot-v1-8k',
      zhipu: 'glm-4',
      ollama: 'llama3.2',
      vllm: 'meta-llama/Llama-2-7b-chat-hf',
      local: 'local-model',
      custom: this.model || 'gpt-3.5-turbo',
    };
    return modelMap[this.provider] || 'gpt-3.5-turbo';
  }

  async *think(messages, temperature = null) {
    console.log(`🧠 正在调用 ${this.model} 模型...`);
    try {
      const response = await this._client.chat.completions.create({
        model: this.model,
        messages,
        temperature: temperature ?? this.temperature,
        max_tokens: this.maxTokens,
        stream: true,
      });

      console.log('✅ 大语言模型响应成功:');
      for await (const chunk of response) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          process.stdout.write(content);
          yield content;
        }
      }
      console.log();
    } catch (e) {
      console.log(`❌ 调用LLM API时发生错误: ${e}`);
      throw new HelloAgentsException(`LLM调用失败: ${e.message}`);
    }
  }

  async invoke(messages, options = {}) {
    try {
      const response = await this._client.chat.completions.create({
        model: this.model,
        messages,
        temperature: options.temperature ?? this.temperature,
        max_tokens: options.max_tokens ?? this.maxTokens,
      });
      return response.choices[0].message.content;
    } catch (e) {
      throw new HelloAgentsException(`LLM调用失败: ${e.message}`);
    }
  }

  async *streamInvoke(messages, options = {}) {
    yield* this.think(messages, options.temperature);
  }
}
