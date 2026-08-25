export type ModelFailureStage = 'model-request' | 'model-output-validate';

export class ModelFailure extends Error {
  constructor(readonly stage: ModelFailureStage) {
    super('Model operation failed');
    this.name = 'ModelFailure';
  }
}
