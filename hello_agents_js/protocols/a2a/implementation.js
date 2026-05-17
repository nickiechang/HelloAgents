/**
 * A2A (Agent-to-Agent Protocol) - simplified implementation
 * Python version uses official a2a SDK
 */

import { v4 as uuidv4 } from 'uuid';

export const MessageType = Object.freeze({
  REQUEST: 'request',
  RESPONSE: 'response',
  NOTIFICATION: 'notification',
  ERROR: 'error',
});

export class A2AMessage {
  constructor({ id = null, type = MessageType.REQUEST, from, to, content, metadata = {} }) {
    this.id = id || uuidv4();
    this.type = type;
    this.from = from;
    this.to = to;
    this.content = content;
    this.metadata = metadata;
    this.timestamp = new Date();
  }
}

export class AgentRegistry {
  constructor() { this._agents = new Map(); }
  register(agentId, info) { this._agents.set(agentId, { ...info, registeredAt: new Date() }); }
  unregister(agentId) { return this._agents.delete(agentId); }
  get(agentId) { return this._agents.get(agentId) || null; }
  list() { return [...this._agents.entries()].map(([id, info]) => ({ id, ...info })); }
}

export class A2AServer {
  constructor(agentId, { name = null, capabilities = [] } = {}) {
    this.agentId = agentId;
    this.name = name || agentId;
    this.capabilities = capabilities;
    this._handlers = new Map();
  }

  onMessage(type, handler) { this._handlers.set(type, handler); }

  async handleMessage(message) {
    const handler = this._handlers.get(message.type);
    if (handler) return await handler(message);
    return new A2AMessage({ type: MessageType.ERROR, from: this.agentId, to: message.from, content: `No handler for ${message.type}` });
  }
}

export class A2AClient {
  constructor(agentId) {
    this.agentId = agentId;
    this._servers = new Map();
  }

  connect(serverId, server) { this._servers.set(serverId, server); }

  async send(to, content, type = MessageType.REQUEST) {
    const msg = new A2AMessage({ type, from: this.agentId, to, content });
    const server = this._servers.get(to);
    if (!server) throw new Error(`Not connected to agent: ${to}`);
    return await server.handleMessage(msg);
  }
}

export class AgentNetwork {
  constructor() {
    this.registry = new AgentRegistry();
    this.agents = new Map();
  }

  addAgent(agentId, server) {
    this.agents.set(agentId, server);
    this.registry.register(agentId, { name: server.name, capabilities: server.capabilities });
  }

  removeAgent(agentId) { this.agents.delete(agentId); this.registry.unregister(agentId); }

  async send(from, to, content) {
    const server = this.agents.get(to);
    if (!server) throw new Error(`Agent not found: ${to}`);
    const msg = new A2AMessage({ type: MessageType.REQUEST, from, to, content });
    return await server.handleMessage(msg);
  }

  listAgents() { return this.registry.list(); }
}

export function createMessage(params) { return new A2AMessage(params); }
export function parseMessage(data) {
  if (typeof data === 'string') data = JSON.parse(data);
  return new A2AMessage(data);
}

// Alias
export const A2AAgent = A2AServer;
