/**
 * RL Trainers - placeholder (requires Python TRL + PyTorch)
 */

class BaseTrainerWrapper {
  constructor(config = {}) {
    this.config = config;
    console.warn(`${this.constructor.name}: RL training requires Python (TRL + PyTorch). This is a placeholder.`);
  }
  async train() { throw new Error('RL training not available in JavaScript. Use the Python version.'); }
}

export class SFTTrainerWrapper extends BaseTrainerWrapper {}
export class GRPOTrainerWrapper extends BaseTrainerWrapper {}
export class PPOTrainerWrapper extends BaseTrainerWrapper {}
