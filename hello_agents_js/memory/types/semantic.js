/**
 * 語義記憶實作
 *
 * 結合關鍵詞匹配和知識圖譜的語義記憶，提供：
 * - 抽象知識和概念儲存
 * - 實體和關係管理
 * - 混合檢索策略：關鍵詞 + 圖 + 語義推理
 *
 * 簡化的記憶體實作（Python版本使用 Qdrant + Neo4j + spaCy）
 */

import { BaseMemory, MemoryItem } from '../base.js';

/**
 * 實體類別
 */
export class Entity {
  /**
   * @param {Object} opts
   * @param {string} opts.entityId - 實體ID
   * @param {string} opts.name - 實體名稱
   * @param {string} opts.entityType - 實體類型（PERSON, ORG, CONCEPT 等）
   * @param {string} opts.description - 描述
   * @param {Object} opts.properties - 屬性
   */
  constructor({ entityId, name, entityType = 'MISC', description = '', properties = {} }) {
    this.entityId = entityId;
    this.name = name;
    this.entityType = entityType;
    this.description = description;
    this.properties = properties;
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.frequency = 1; // 出現頻率
  }

  toDict() {
    return {
      entityId: this.entityId,
      name: this.name,
      entityType: this.entityType,
      description: this.description,
      properties: this.properties,
      frequency: this.frequency,
    };
  }
}

/**
 * 關係類別
 */
export class Relation {
  /**
   * @param {Object} opts
   * @param {string} opts.fromEntity - 來源實體ID
   * @param {string} opts.toEntity - 目標實體ID
   * @param {string} opts.relationType - 關係類型
   * @param {number} opts.strength - 強度
   * @param {string} opts.evidence - 支持該關係的原文本
   * @param {Object} opts.properties - 屬性
   */
  constructor({ fromEntity, toEntity, relationType, strength = 1.0, evidence = '', properties = {} }) {
    this.fromEntity = fromEntity;
    this.toEntity = toEntity;
    this.relationType = relationType;
    this.strength = strength;
    this.evidence = evidence;
    this.properties = properties;
    this.createdAt = new Date();
    this.frequency = 1; // 關係出現頻率
  }

  toDict() {
    return {
      fromEntity: this.fromEntity,
      toEntity: this.toEntity,
      relationType: this.relationType,
      strength: this.strength,
      evidence: this.evidence,
      frequency: this.frequency,
    };
  }
}

export class SemanticMemory extends BaseMemory {
  /**
   * 增強語義記憶實作
   *
   * 特點：
   * - 關鍵詞匹配進行快速相似度配對
   * - 知識圖譜儲存實體和關係
   * - 混合檢索策略
   */
  constructor(config, storageBackend = null) {
    super(config, storageBackend);

    // 實體和關係快取（用於快速存取）
    this.entities = {};
    this.relations = [];

    // 記憶儲存
    this.semanticMemories = [];
  }

  /**
   * 添加語義記憶
   * @param {MemoryItem} memoryItem
   * @returns {string} 記憶ID
   */
  add(memoryItem) {
    // 提取實體和關係
    const entities = this._extractEntities(memoryItem.content);
    const relations = this._extractRelations(memoryItem.content, entities);

    // 更新知識圖譜快取
    for (const entity of entities) this._addOrUpdateEntity(entity);
    for (const relation of relations) this._addOrUpdateRelation(relation);

    // 添加實體資訊到中繼資料
    memoryItem.metadata.entities = entities.map(e => e.entityId);
    memoryItem.metadata.relations = relations.map(r => `${r.fromEntity}-${r.relationType}-${r.toEntity}`);

    // 儲存記憶
    this.semanticMemories.push(memoryItem);
    return memoryItem.id;
  }

  /**
   * 檢索語義記憶
   * @param {string} query - 查詢內容
   * @param {number} limit - 回傳數量限制
   * @param {Object} opts
   * @param {string} opts.userId - 使用者ID
   * @param {number} opts.minImportance - 最低重要性閾值
   * @returns {MemoryItem[]}
   */
  retrieve(query, limit = 5, { userId, minImportance = 0 } = {}) {
    // 過濾已遺忘的記憶
    let candidates = this.semanticMemories.filter(m => !m.metadata.forgotten);
    if (userId) candidates = candidates.filter(m => m.userId === userId);
    if (minImportance) candidates = candidates.filter(m => m.importance >= minImportance);
    if (!candidates.length) return [];

    const queryLower = query.toLowerCase();
    const queryWords = new Set(queryLower.split(/\s+/));

    // 1. 關鍵詞匹配分數
    const scored = candidates.map(m => {
      const contentLower = m.content.toLowerCase();
      const contentWords = new Set(contentLower.split(/\s+/));

      let overlap = 0;
      for (const w of queryWords) { if (contentWords.has(w)) overlap++; }
      const keywordScore = queryWords.size > 0 ? overlap / queryWords.size : 0;

      // 2. 圖相關性分數
      const queryEntities = this._extractEntities(query);
      const graphScore = this._calculateGraphRelevance(m, queryEntities);

      // 3. 混合分數：關鍵詞 + 圖
      const baseRelevance = keywordScore * 0.7 + graphScore * 0.3;

      // 重要性作為乘法加權因子
      const importanceWeight = 0.8 + (m.importance * 0.4);
      const combined = baseRelevance * importanceWeight;

      return { score: combined, memory: m };
    }).filter(s => s.score > 0);

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.memory);
  }

  /**
   * 添加實體
   * @param {Entity} entity
   */
  addEntity(entity) { this._addOrUpdateEntity(entity); }

  /**
   * 獲取實體
   * @param {string} entityId
   * @returns {Entity|null}
   */
  getEntity(entityId) { return this.entities[entityId] || null; }

  /**
   * 添加關係
   * @param {Relation} relation
   */
  addRelation(relation) { this._addOrUpdateRelation(relation); }

  /**
   * 搜尋實體
   * @param {string} query - 搜尋查詢
   * @param {number} limit
   * @returns {Entity[]}
   */
  searchEntities(query, limit = 10) {
    const queryLower = query.toLowerCase();
    const scored = [];

    for (const entity of Object.values(this.entities)) {
      let score = 0.0;

      // 名稱匹配
      if (entity.name.toLowerCase().includes(queryLower)) score += 2.0;
      // 類型匹配
      if (entity.entityType.toLowerCase().includes(queryLower)) score += 1.0;
      // 描述匹配
      if (entity.description.toLowerCase().includes(queryLower)) score += 0.5;
      // 頻率權重
      score *= Math.log(1 + entity.frequency);

      if (score > 0) scored.push({ score, entity });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.entity);
  }

  /**
   * 獲取相關實體
   * @param {string} entityId
   * @param {string[]|null} relationTypes
   * @param {number} maxHops
   * @returns {Object[]}
   */
  getRelatedEntities(entityId, relationTypes = null, maxHops = 2) {
    const related = [];
    const visited = new Set([entityId]);
    let frontier = [entityId];

    for (let hop = 0; hop < maxHops && frontier.length > 0; hop++) {
      const nextFrontier = [];
      for (const currentId of frontier) {
        for (const rel of this.relations) {
          let targetId = null;
          if (rel.fromEntity === currentId) targetId = rel.toEntity;
          else if (rel.toEntity === currentId) targetId = rel.fromEntity;
          if (!targetId || visited.has(targetId)) continue;
          if (relationTypes && !relationTypes.includes(rel.relationType)) continue;

          visited.add(targetId);
          nextFrontier.push(targetId);
          const entity = this.entities[targetId];
          if (entity) {
            related.push({
              entity: entity.toDict(),
              relation: rel.toDict(),
              hops: hop + 1,
            });
          }
        }
      }
      frontier = nextFrontier;
    }
    return related;
  }

  /**
   * 更新語義記憶
   * @param {string} memoryId
   * @param {string|null} content
   * @param {number|null} importance
   * @param {Object|null} metadata
   * @returns {boolean}
   */
  update(memoryId, content, importance, metadata) {
    const m = this.semanticMemories.find(m => m.id === memoryId);
    if (!m) return false;

    if (content != null) {
      // 清理舊的實體關係
      const oldEntities = m.metadata.entities || [];
      this._cleanupEntitiesAndRelations(oldEntities);

      m.content = content;

      // 提取新的實體和關係
      const entities = this._extractEntities(content);
      const relations = this._extractRelations(content, entities);
      for (const entity of entities) this._addOrUpdateEntity(entity);
      for (const relation of relations) this._addOrUpdateRelation(relation);

      m.metadata.entities = entities.map(e => e.entityId);
      m.metadata.relations = relations.map(r => `${r.fromEntity}-${r.relationType}-${r.toEntity}`);
    }
    if (importance != null) m.importance = importance;
    if (metadata) Object.assign(m.metadata, metadata);
    return true;
  }

  /**
   * 刪除語義記憶
   * @param {string} memoryId
   * @returns {boolean}
   */
  remove(memoryId) {
    const idx = this.semanticMemories.findIndex(m => m.id === memoryId);
    if (idx === -1) return false;
    const memory = this.semanticMemories[idx];

    // 清理實體和關係
    const entities = memory.metadata.entities || [];
    this._cleanupEntitiesAndRelations(entities);

    // 刪除記憶
    this.semanticMemories.splice(idx, 1);
    return true;
  }

  /**
   * 檢查記憶是否存在
   * @param {string} memoryId
   * @returns {boolean}
   */
  hasMemory(memoryId) { return this.semanticMemories.some(m => m.id === memoryId); }

  /**
   * 語義記憶遺忘機制（硬刪除）
   * @param {string} strategy
   * @param {number} threshold
   * @param {number} maxAgeDays
   * @returns {number}
   */
  forget(strategy = 'importance_based', threshold = 0.1, maxAgeDays = 30) {
    let forgottenCount = 0;
    const now = Date.now();
    const toRemove = [];

    for (const m of this.semanticMemories) {
      let shouldForget = false;

      if (strategy === 'importance_based') {
        if (m.importance < threshold) shouldForget = true;
      } else if (strategy === 'time_based') {
        const cutoffMs = maxAgeDays * 24 * 3600 * 1000;
        if ((now - m.timestamp.getTime()) >= cutoffMs) shouldForget = true;
      } else if (strategy === 'capacity_based') {
        if (this.semanticMemories.length > (this.config.maxCapacity || 100)) {
          const sorted = [...this.semanticMemories].sort((a, b) => a.importance - b.importance);
          const excess = this.semanticMemories.length - (this.config.maxCapacity || 100);
          if (sorted.indexOf(m) < excess) shouldForget = true;
        }
      }

      if (shouldForget) toRemove.push(m.id);
    }

    for (const id of toRemove) {
      if (this.remove(id)) forgottenCount++;
    }
    return forgottenCount;
  }

  /**
   * 清空所有語義記憶
   */
  clear() {
    this.semanticMemories = [];
    this.entities = {};
    this.relations = [];
  }

  /**
   * 獲取所有語義記憶
   * @returns {MemoryItem[]}
   */
  getAll() { return [...this.semanticMemories]; }

  /**
   * 獲取語義記憶統計資訊
   * @returns {Object}
   */
  getStats() {
    const active = this.semanticMemories;
    return {
      count: active.length,
      forgottenCount: 0,
      totalCount: this.semanticMemories.length,
      entitiesCount: Object.keys(this.entities).length,
      relationsCount: this.relations.length,
      avgImportance: active.length > 0
        ? active.reduce((s, m) => s + m.importance, 0) / active.length
        : 0.0,
      memoryType: 'semantic',
    };
  }

  // ─── 私有方法 ───

  /**
   * 簡單實體提取（基於空格分詞，取長度 > 1 的詞作為候選實體）
   * @param {string} text
   * @returns {Entity[]}
   */
  _extractEntities(text) {
    const entities = [];
    const words = text.split(/\s+/).filter(w => w.length > 1);
    const seen = new Set();
    for (const word of words) {
      const id = `entity_${this._simpleHash(word)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      entities.push(new Entity({
        entityId: id,
        name: word,
        entityType: 'MISC',
        description: `從文本中識別的實體`,
      }));
    }
    return entities.slice(0, 10); // 限制數量
  }

  /**
   * 提取關係（共現關係）
   * @param {string} text
   * @param {Entity[]} entities
   * @returns {Relation[]}
   */
  _extractRelations(text, entities) {
    const relations = [];
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        relations.push(new Relation({
          fromEntity: entities[i].entityId,
          toEntity: entities[j].entityId,
          relationType: 'CO_OCCURS',
          strength: 0.5,
          evidence: text.slice(0, 100),
        }));
      }
    }
    return relations;
  }

  /**
   * 添加或更新實體
   * @param {Entity} entity
   */
  _addOrUpdateEntity(entity) {
    if (entity.entityId in this.entities) {
      this.entities[entity.entityId].frequency++;
      this.entities[entity.entityId].updatedAt = new Date();
    } else {
      this.entities[entity.entityId] = entity;
    }
  }

  /**
   * 添加或更新關係
   * @param {Relation} relation
   */
  _addOrUpdateRelation(relation) {
    const existing = this.relations.find(r =>
      r.fromEntity === relation.fromEntity &&
      r.toEntity === relation.toEntity &&
      r.relationType === relation.relationType
    );
    if (existing) {
      existing.frequency++;
      existing.strength = Math.min(1.0, existing.strength + 0.1);
    } else {
      this.relations.push(relation);
    }
  }

  /**
   * 清理實體和關係
   * @param {string[]} entityIds
   */
  _cleanupEntitiesAndRelations(entityIds) {
    // 可實作更智能的清理邏輯
  }

  /**
   * 計算圖相關性分數
   * @param {MemoryItem} memory
   * @param {Entity[]} queryEntities
   * @returns {number}
   */
  _calculateGraphRelevance(memory, queryEntities) {
    const memoryEntities = memory.metadata.entities || [];
    if (!memoryEntities.length || !queryEntities.length) return 0.0;

    const queryEntityIds = new Set(queryEntities.map(e => e.entityId));
    const matching = memoryEntities.filter(id => queryEntityIds.has(id)).length;
    return queryEntityIds.size > 0 ? matching / queryEntityIds.size : 0;
  }

  /**
   * 簡單雜湊函數
   * @param {string} str
   * @returns {number}
   */
  _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }
}
