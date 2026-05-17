/**
 * RL Reward functions - placeholder
 */

export class MathRewardFunction {
  constructor() { console.warn('MathRewardFunction: placeholder'); }
  compute(prediction, reference) { return prediction === reference ? 1.0 : 0.0; }
}

export function createAccuracyReward() {
  return (pred, ref) => pred === ref ? 1.0 : 0.0;
}

export function createLengthPenaltyReward(maxLength = 512) {
  return (text) => Math.max(0, 1.0 - text.length / maxLength);
}

export function createStepReward() {
  return (steps) => Math.min(1.0, steps.length * 0.1);
}

export function evaluateRewards(predictions, references, rewardFn) {
  return predictions.map((pred, i) => rewardFn(pred, references[i]));
}
