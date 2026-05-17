/**
 * Neo4j 圖資料庫儲存實作
 *
 * 提供實體節點和關係的管理，支援：
 * - 實體新增 / 搜尋 / 刪除
 * - 關係新增 / 查詢
 * - 相關實體的多跳搜尋
 * - 統計資訊與健康檢查
 *
 * 簡化的記憶體實作（Python 版本使用 neo4j driver 連接真實 Neo4j 服務）
 */

/**
 * Neo4j 圖資料庫儲存
 */
export class Neo4jGraphStore {
  /**
   * 初始化 Neo4j 圖儲存
   *
   * @param {Object} opts
   * @param {string} opts.uri - Neo4j 連線 URI
   * @param {string} opts.username - 使用者名稱
   * @param {string} opts.password - 密碼
   * @param {string} opts.database - 資料庫名稱
   */
  constructor({
    uri = 'bolt://localhost:7687',
    username = 'neo4j',
    password = 'hello-agents-password',
    database = 'neo4j',
  } = {}) {
    this.uri = uri;
    this.username = username;
    this.database = database;

    // 記憶體模擬儲存
    /** @type {Map<string, Object>} 實體表：entityId -> entity */
    this._entities = new Map();
    /** @type {Array<Object>} 關係列表 */
    this._relationships = [];

    console.log(`✅ Neo4jGraphStore 記憶體模擬已初始化（真實連線需安裝 neo4j-driver）`);
  }

  /**
   * 新增實體節點
   * @param {string} entityId - 實體ID
   * @param {string} name - 實體名稱
   * @param {string} entityType - 實體類型
   * @param {Object} properties - 附加屬性
   * @returns {boolean}
   */
  addEntity(entityId, name, entityType, properties = {}) {
    const now = new Date().toISOString();
    const existing = this._entities.get(entityId);

    if (existing) {
      // 合併更新
      Object.assign(existing, properties, { name, type: entityType, updatedAt: now });
    } else {
      this._entities.set(entityId, {
        id: entityId,
        name,
        type: entityType,
        ...properties,
        createdAt: now,
        updatedAt: now,
      });
    }
    return true;
  }

  /**
   * 新增實體間關係
   * @param {string} fromEntityId - 來源實體ID
   * @param {string} toEntityId - 目標實體ID
   * @param {string} relationshipType - 關係類型
   * @param {Object} properties - 關係屬性
   * @returns {boolean}
   */
  addRelationship(fromEntityId, toEntityId, relationshipType, properties = {}) {
    if (!this._entities.has(fromEntityId) || !this._entities.has(toEntityId)) {
      return false;
    }

    const now = new Date().toISOString();

    // 檢查是否已存在相同關係
    const existing = this._relationships.find(
      r => r.fromId === fromEntityId && r.toId === toEntityId && r.type === relationshipType
    );

    if (existing) {
      Object.assign(existing, properties, { updatedAt: now });
    } else {
      this._relationships.push({
        fromId: fromEntityId,
        toId: toEntityId,
        type: relationshipType,
        ...properties,
        createdAt: now,
        updatedAt: now,
      });
    }
    return true;
  }

  /**
   * 查詢相關實體（多跳搜尋）
   * @param {string} entityId - 起始實體ID
   * @param {string[]|null} relationshipTypes - 關係類型過濾
   * @param {number} maxDepth - 最大搜尋深度
   * @param {number} limit - 結果限制
   * @returns {Object[]} 相關實體列表
   */
  findRelatedEntities(entityId, relationshipTypes = null, maxDepth = 2, limit = 50) {
    const visited = new Set([entityId]);
    const results = [];
    let frontier = [entityId];

    for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
      const nextFrontier = [];

      for (const currentId of frontier) {
        for (const rel of this._relationships) {
          let targetId = null;
          if (rel.fromId === currentId) targetId = rel.toId;
          else if (rel.toId === currentId) targetId = rel.fromId;
          if (!targetId || visited.has(targetId)) continue;
          if (relationshipTypes && !relationshipTypes.includes(rel.type)) continue;

          visited.add(targetId);
          nextFrontier.push(targetId);

          const entity = this._entities.get(targetId);
          if (entity) {
            results.push({
              ...entity,
              distance: depth,
              relationshipPath: [rel.type],
            });
          }
        }
      }
      frontier = nextFrontier;
      if (results.length >= limit) break;
    }

    return results.slice(0, limit);
  }

  /**
   * 按名稱搜尋實體
   * @param {string} namePattern - 名稱模式（部分匹配）
   * @param {string[]|null} entityTypes - 實體類型過濾
   * @param {number} limit - 結果限制
   * @returns {Object[]}
   */
  searchEntitiesByName(namePattern, entityTypes = null, limit = 20) {
    const pattern = namePattern.toLowerCase();
    const results = [];

    for (const entity of this._entities.values()) {
      if (!entity.name.toLowerCase().includes(pattern)) continue;
      if (entityTypes && !entityTypes.includes(entity.type)) continue;
      results.push({ ...entity });
      if (results.length >= limit) break;
    }

    return results;
  }

  /**
   * 獲取實體的所有關係
   * @param {string} entityId
   * @returns {Object[]} 關係列表
   */
  getEntityRelationships(entityId) {
    const results = [];
    for (const rel of this._relationships) {
      if (rel.fromId === entityId) {
        results.push({
          relationship: { ...rel },
          otherEntity: this._entities.get(rel.toId) || null,
          direction: 'outgoing',
        });
      } else if (rel.toId === entityId) {
        results.push({
          relationship: { ...rel },
          otherEntity: this._entities.get(rel.fromId) || null,
          direction: 'incoming',
        });
      }
    }
    return results;
  }

  /**
   * 刪除實體及其所有關係
   * @param {string} entityId
   * @returns {boolean}
   */
  deleteEntity(entityId) {
    if (!this._entities.has(entityId)) return false;
    this._entities.delete(entityId);
    // 清理相關關係
    this._relationships = this._relationships.filter(
      r => r.fromId !== entityId && r.toId !== entityId
    );
    return true;
  }

  /**
   * 清空所有資料
   * @returns {boolean}
   */
  clearAll() {
    const nodeCount = this._entities.size;
    const relCount = this._relationships.length;
    this._entities.clear();
    this._relationships = [];
    console.log(`✅ 清空 Neo4j 模擬資料庫: 刪除 ${nodeCount} 個節點, ${relCount} 個關係`);
    return true;
  }

  /**
   * 獲取圖資料庫統計資訊
   * @returns {Object}
   */
  getStats() {
    // 統計實體類型
    const entityTypes = {};
    for (const e of this._entities.values()) {
      entityTypes[e.type] = (entityTypes[e.type] || 0) + 1;
    }

    // 統計關係類型
    const relTypes = {};
    for (const r of this._relationships) {
      relTypes[r.type] = (relTypes[r.type] || 0) + 1;
    }

    return {
      totalNodes: this._entities.size,
      totalRelationships: this._relationships.length,
      entityTypes,
      relationshipTypes: relTypes,
      storeType: 'neo4j_in_memory',
    };
  }

  /**
   * 健康檢查
   * @returns {boolean}
   */
  healthCheck() {
    // 記憶體模擬始終可用
    return true;
  }
}
