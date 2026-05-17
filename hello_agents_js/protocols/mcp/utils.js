/**
 * MCP utility functions
 */

export function createContext({ messages = [], tools = [], resources = [], metadata = {} } = {}) {
  return { messages, tools, resources, metadata };
}

export function parseContext(context) {
  if (typeof context === 'string') {
    try { return JSON.parse(context); } catch { return { messages: [], tools: [], resources: [], metadata: {}, raw: context }; }
  }
  return {
    messages: context.messages || [],
    tools: context.tools || [],
    resources: context.resources || [],
    metadata: context.metadata || {},
  };
}
