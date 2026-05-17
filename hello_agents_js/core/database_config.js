// 数据库配置管理
import 'dotenv/config';

export class QdrantConfig {
  constructor({
    url = null,
    apiKey = null,
    collectionName = 'hello_agents_vectors',
    vectorSize = 384,
    distance = 'cosine',
    timeout = 30,
  } = {}) {
    this.url = url;
    this.apiKey = apiKey;
    this.collectionName = collectionName;
    this.vectorSize = vectorSize;
    this.distance = distance;
    this.timeout = timeout;
  }

  static fromEnv() {
    return new QdrantConfig({
      url: process.env.QDRANT_URL || null,
      apiKey: process.env.QDRANT_API_KEY || null,
      collectionName: process.env.QDRANT_COLLECTION || 'hello_agents_vectors',
      vectorSize: parseInt(process.env.QDRANT_VECTOR_SIZE || '384'),
      distance: process.env.QDRANT_DISTANCE || 'cosine',
      timeout: parseInt(process.env.QDRANT_TIMEOUT || '30'),
    });
  }

  toDict() {
    const result = {};
    for (const [k, v] of Object.entries(this)) {
      if (v != null) result[k] = v;
    }
    return result;
  }
}

export class Neo4jConfig {
  constructor({
    uri = 'bolt://localhost:7687',
    username = 'neo4j',
    password = 'hello-agents-password',
    database = 'neo4j',
    maxConnectionLifetime = 3600,
    maxConnectionPoolSize = 50,
    connectionAcquisitionTimeout = 60,
  } = {}) {
    this.uri = uri;
    this.username = username;
    this.password = password;
    this.database = database;
    this.maxConnectionLifetime = maxConnectionLifetime;
    this.maxConnectionPoolSize = maxConnectionPoolSize;
    this.connectionAcquisitionTimeout = connectionAcquisitionTimeout;
  }

  static fromEnv() {
    return new Neo4jConfig({
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'hello-agents-password',
      database: process.env.NEO4J_DATABASE || 'neo4j',
      maxConnectionLifetime: parseInt(process.env.NEO4J_MAX_CONNECTION_LIFETIME || '3600'),
      maxConnectionPoolSize: parseInt(process.env.NEO4J_MAX_CONNECTION_POOL_SIZE || '50'),
      connectionAcquisitionTimeout: parseInt(process.env.NEO4J_CONNECTION_TIMEOUT || '60'),
    });
  }

  toDict() {
    return { ...this };
  }
}

export class DatabaseConfig {
  constructor({ qdrant = null, neo4j = null } = {}) {
    this.qdrant = qdrant || new QdrantConfig();
    this.neo4j = neo4j || new Neo4jConfig();
  }

  static fromEnv() {
    return new DatabaseConfig({
      qdrant: QdrantConfig.fromEnv(),
      neo4j: Neo4jConfig.fromEnv(),
    });
  }

  getQdrantConfig() {
    return this.qdrant.toDict();
  }

  getNeo4jConfig() {
    return this.neo4j.toDict();
  }
}

export const dbConfig = DatabaseConfig.fromEnv();

export function getDatabaseConfig() {
  return dbConfig;
}
