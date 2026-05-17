/**
 * RL Datasets - placeholder (requires Python datasets library)
 */

export class GSM8KDataset {
  constructor(config = {}) {
    this.config = config;
    console.warn('GSM8KDataset: requires Python datasets library. Placeholder.');
  }
  async load() { return []; }
}

export function createMathDataset(config = {}) { return new GSM8KDataset(config); }
export function createSftDataset(config = {}) { console.warn('createSftDataset: placeholder'); return []; }
export function createRlDataset(config = {}) { console.warn('createRlDataset: placeholder'); return []; }
export function previewDataset(dataset, count = 5) { console.log('Dataset preview: placeholder'); return []; }
export function formatMathDataset(dataset) { return dataset; }
