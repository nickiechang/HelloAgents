/**
 * 統一嵌入模組（實作 + 提供器）
 *
 * 說明：
 * - 提供統一的文字嵌入介面與多實作：REST API（OpenAI 相容）、TF-IDF 兜底。
 * - 暴露 getTextEmbedder() / getDimension() / refreshEmbedder() 供各記憶類型統一使用。
 * - 透過環境變數優先順序：rest > tfidf。
 *
 * 環境變數：
 * - EMBED_MODEL_TYPE: "rest" | "tfidf"（預設 "tfidf"）
 * - EMBED_MODEL_NAME: 模型名稱（REST 預設 text-embedding-v3）
 * - EMBED_API_KEY: Embedding API Key（統一命名）
 * - EMBED_BASE_URL: Embedding Base URL（統一命名，必須為 REST 模式提供）
 *
 * 簡化的 JavaScript 實作（Python 版本另支援 sentence-transformers / DashScope SDK）
 */

/**
 * 嵌入模型基底類別（最小介面）
 */
export class EmbeddingModel {
  /**
   * 編碼文字為向量
   * @param {string|string[]} texts - 單筆文字或文字陣列
   * @returns {number[]|number[][]}
   */
  encode(texts) { throw new Error('未實作'); }

  /**
   * 向量維度
   * @returns {number}
   */
  get dimension() { throw new Error('未實作'); }
}

/**
 * TF-IDF 簡易兜底嵌入（在無深度模型時保證可用）
 */
export class TFIDFEmbedding extends EmbeddingModel {
  /**
   * @param {number} maxFeatures - 最大特徵數
   */
  constructor(maxFeatures = 1000) {
    super();
    this.maxFeatures = maxFeatures;
    /** @type {Map<string, number>} 詞彙表：詞 -> 索引 */
    this.vocabulary = new Map();
    this._dimension = maxFeatures;
    this._isFitted = false;
  }

  /**
   * 訓練 TF-IDF 模型
   * @param {string[]} texts - 訓練文本集合
   */
  fit(texts) {
    const df = new Map();
    for (const text of texts) {
      const words = new Set(text.toLowerCase().split(/\s+/));
      for (const w of words) df.set(w, (df.get(w) || 0) + 1);
    }
    // 按文件頻率排序，取前 maxFeatures 個
    const sorted = [...df.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.maxFeatures);
    this.vocabulary = new Map(sorted.map(([w], i) => [w, i]));
    this._dimension = this.vocabulary.size;
    this._isFitted = true;
  }

  /**
   * 編碼文字為 TF-IDF 向量
   * @param {string|string[]} texts
   * @returns {number[]|number[][]}
   */
  encode(texts) {
    if (!this._isFitted) {
      throw new Error('TF-IDF 模型尚未訓練，請先呼叫 fit() 方法');
    }
    const single = typeof texts === 'string';
    const input = single ? [texts] : texts;

    const results = input.map(text => {
      const vec = new Float32Array(this._dimension);
      const words = text.toLowerCase().split(/\s+/);
      for (const w of words) {
        const idx = this.vocabulary.get(w);
        if (idx !== undefined) vec[idx] += 1;
      }
      return Array.from(vec);
    });
    return single ? results[0] : results;
  }

  /** @returns {number} 向量維度 */
  get dimension() { return this._dimension; }
}

/**
 * REST API 嵌入（OpenAI 相容介面）
 *
 * 透過 POST {baseUrl}/embeddings 呼叫遠端嵌入服務。
 * 適用於 DashScope / OpenAI / 任何相容 API。
 */
export class RESTEmbedding extends EmbeddingModel {
  /**
   * @param {Object} opts
   * @param {string} opts.modelName - 模型名稱
   * @param {string} opts.apiKey - API Key
   * @param {string} opts.baseUrl - API Base URL
   */
  constructor({ modelName = 'text-embedding-v3', apiKey = '', baseUrl = '' } = {}) {
    super();
    this.modelName = modelName;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this._dimension = null;

    if (!this.baseUrl) {
      throw new Error('REST 嵌入模式必須提供 baseUrl');
    }
  }

  /**
   * 初始化：探測維度（需要 await）
   * @returns {Promise<void>}
   */
  async init() {
    const test = await this.encodeAsync('health_check');
    this._dimension = test.length;
  }

  /**
   * 非同步編碼文字為向量
   * @param {string|string[]} texts
   * @returns {Promise<number[]|number[][]>}
   */
  async encodeAsync(texts) {
    const single = typeof texts === 'string';
    const input = single ? [texts] : [...texts];

    const url = this.baseUrl.replace(/\/+$/, '') + '/embeddings';
    const headers = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: this.modelName, input }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`嵌入 REST 呼叫失敗: ${response.status} ${body}`);
    }

    const data = await response.json();
    // 期望結構：{"data": [{"embedding": [...]}]}
    const items = data.data || [];
    const vecs = items.map(item => item.embedding);

    return single ? vecs[0] : vecs;
  }

  /**
   * 同步介面（包裝非同步呼叫，不建議在熱路徑使用）
   * @param {string|string[]} texts
   * @returns {number[]|number[][]}
   */
  encode(texts) {
    // 注意：在非同步環境中應使用 encodeAsync
    throw new Error('RESTEmbedding 不支援同步 encode()，請使用 encodeAsync()');
  }

  /** @returns {number} 向量維度 */
  get dimension() { return this._dimension || 0; }
}

// ==================
// 工廠與回退
// ==================

/**
 * 建立嵌入模型實例
 * @param {string} modelType - "rest" | "tfidf"
 * @param {Object} kwargs - 額外參數
 * @returns {EmbeddingModel}
 */
export function createEmbeddingModel(modelType = 'tfidf', kwargs = {}) {
  if (modelType === 'rest') {
    return new RESTEmbedding(kwargs);
  } else if (modelType === 'tfidf') {
    return new TFIDFEmbedding(kwargs.maxFeatures);
  } else {
    throw new Error(`不支援的模型類型: ${modelType}`);
  }
}

/**
 * 帶回退的建立：rest -> tfidf
 * @param {string} preferredType - 首選模型類型
 * @param {Object} kwargs - 額外參數
 * @returns {EmbeddingModel}
 */
export function createEmbeddingModelWithFallback(preferredType = 'rest', kwargs = {}) {
  const fallback = ['rest', 'tfidf'];
  // 將首選放最前
  const idx = fallback.indexOf(preferredType);
  if (idx > 0) {
    fallback.splice(idx, 1);
    fallback.unshift(preferredType);
  }

  for (const t of fallback) {
    try {
      return createEmbeddingModel(t, kwargs);
    } catch {
      continue;
    }
  }
  throw new Error('所有嵌入模型都不可用，請檢查設定');
}

// ==================
// Provider（單例）
// ==================

/** @type {EmbeddingModel|null} */
let _embedder = null;

/**
 * 根據環境變數建構嵌入實例
 * @returns {EmbeddingModel}
 */
function _buildEmbedder() {
  const preferred = (process.env.EMBED_MODEL_TYPE || 'tfidf').trim();
  const defaultModel = preferred === 'rest' ? 'text-embedding-v3' : '';
  const modelName = (process.env.EMBED_MODEL_NAME || defaultModel).trim();

  const kwargs = {};
  if (modelName) kwargs.modelName = modelName;

  const apiKey = process.env.EMBED_API_KEY;
  if (apiKey) kwargs.apiKey = apiKey;

  const baseUrl = process.env.EMBED_BASE_URL;
  if (baseUrl) kwargs.baseUrl = baseUrl;

  return createEmbeddingModelWithFallback(preferred, kwargs);
}

/**
 * 獲取全域共用的文字嵌入實例（單例）
 * @returns {EmbeddingModel}
 */
export function getTextEmbedder() {
  if (_embedder !== null) return _embedder;
  _embedder = _buildEmbedder();
  return _embedder;
}

/**
 * 獲取統一向量維度（失敗回退預設值）
 * @param {number} fallback - 預設維度
 * @returns {number}
 */
export function getDimension(fallback = 384) {
  try {
    return getTextEmbedder().dimension || fallback;
  } catch {
    return fallback;
  }
}

/**
 * 強制重建嵌入實例（可用於動態切換環境變數）
 * @returns {EmbeddingModel}
 */
export function refreshEmbedder() {
  _embedder = _buildEmbedder();
  return _embedder;
}
