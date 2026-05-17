/**
 * ANP (Agent Network Protocol) - conceptual implementation
 */

import { v4 as uuidv4 } from 'uuid';

export class ServiceInfo {
  constructor({ serviceId = null, serviceType, endpoint, serviceName = null, capabilities = [], metadata = {} }) {
    this.serviceId = serviceId || uuidv4();
    this.serviceType = serviceType;
    this.endpoint = endpoint;
    this.serviceName = serviceName || this.serviceId;
    this.capabilities = capabilities;
    this.metadata = metadata;
    this.registeredAt = new Date();
    this.lastHeartbeat = new Date();
  }
}

export class ANPDiscovery {
  constructor() { this._services = new Map(); }

  registerService(service) {
    this._services.set(service.serviceId, service);
    return true;
  }

  unregisterService(serviceId) { return this._services.delete(serviceId); }

  discoverServices({ serviceType = null, capabilities = [] } = {}) {
    let results = [...this._services.values()];
    if (serviceType) results = results.filter(s => s.serviceType === serviceType);
    if (capabilities.length) {
      results = results.filter(s => capabilities.every(c => s.capabilities.includes(c)));
    }
    return results;
  }

  getService(serviceId) { return this._services.get(serviceId) || null; }
  listServices() { return [...this._services.values()]; }
}

export class ANPNetwork {
  constructor() {
    this.discovery = new ANPDiscovery();
  }

  registerAgent(serviceInfo) { return this.discovery.registerService(serviceInfo); }
  findAgents(serviceType) { return this.discovery.discoverServices({ serviceType }); }
  listAgents() { return this.discovery.listServices(); }
}

export function registerService(discovery, { service = null, serviceId, serviceType, endpoint, serviceName, capabilities, metadata } = {}) {
  if (service) return discovery.registerService(service);
  if (!serviceId || !serviceType || !endpoint) throw new Error('Must provide serviceId, serviceType, and endpoint');
  return discovery.registerService(new ServiceInfo({ serviceId, serviceType, endpoint, serviceName, capabilities, metadata }));
}

export function discoverService(discovery, serviceType = null) {
  return discovery.discoverServices({ serviceType });
}
