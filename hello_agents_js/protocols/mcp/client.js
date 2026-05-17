/**
 * MCP Client - placeholder (Python version uses fastmcp Client)
 */

export class MCPClient {
  constructor(serverSource, { serverArgs = [], transportType = null, env = {} } = {}) {
    this.serverSource = serverSource;
    this.serverArgs = serverArgs;
    this.transportType = transportType;
    this.env = env;
    this.client = null;
    console.warn('MCPClient: placeholder. Use @modelcontextprotocol/sdk for real MCP client in Node.js');
  }

  async connect() {
    console.warn('MCPClient.connect: no-op placeholder');
  }

  async listTools() { return []; }
  async callTool(name, args = {}) { throw new Error(`MCPClient.callTool: placeholder. Cannot call ${name}`); }
  async listResources() { return []; }
  async readResource(uri) { throw new Error(`MCPClient.readResource: placeholder`); }
  async close() { this.client = null; }
}
