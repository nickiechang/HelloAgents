/**
 * Protocol base classes
 */

export const ProtocolType = Object.freeze({
  MCP: 'mcp',
  A2A: 'a2a',
  ANP: 'anp',
});

export class Protocol {
  constructor(protocolType, version = '1.0.0') {
    this._protocolType = protocolType;
    this._version = version;
  }

  get protocolName() { return this._protocolType; }
  get version() { return this._version; }
  toString() { return `${this.constructor.name}(protocol=${this.protocolName}, version=${this.version})`; }
}
