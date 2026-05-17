/**
 * Evaluation module - placeholder
 * Python version contains BFCL and GAIA benchmark implementations
 */

export class BenchmarkRunner {
  constructor(name) {
    this.name = name;
    console.warn(`BenchmarkRunner(${name}): placeholder. Use Python version for actual benchmarks.`);
  }
  async run() { throw new Error('Benchmarks not available in JS. Use the Python version.'); }
}

export class BFCLBenchmark extends BenchmarkRunner {
  constructor() { super('BFCL'); }
}

export class GAIABenchmark extends BenchmarkRunner {
  constructor() { super('GAIA'); }
}
