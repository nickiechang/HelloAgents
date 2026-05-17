/**
 * MCP Server - placeholder (Python version uses fastmcp)
 */

export class MCPServer {
  constructor(name, description = null) {
    this.name = name;
    this.description = description || `${name} MCP Server`;
    this._tools = new Map();
    this._resources = new Map();
    this._prompts = new Map();
  }

  addTool(func, name = null, description = null) {
    const toolName = name || func.name;
    this._tools.set(toolName, { func, name: toolName, description: description || '' });
  }

  addResource(func, uri = null, name = null, description = null) {
    const resourceName = name || func.name;
    this._resources.set(uri || resourceName, { func, uri, name: resourceName, description });
  }

  addPrompt(func, name = null, description = null) {
    const promptName = name || func.name;
    this._prompts.set(promptName, { func, name: promptName, description });
  }

  run(transport = 'stdio') {
    console.warn('MCPServer.run: placeholder. Use @modelcontextprotocol/sdk for real MCP server in Node.js');
    console.log(`MCP Server "${this.name}" would start with transport: ${transport}`);
    console.log(`Tools: ${[...this._tools.keys()].join(', ')}`);
    console.log(`Resources: ${[...this._resources.keys()].join(', ')}`);
  }
}
