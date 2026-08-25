export type ModelFailureStage =
  | 'model-network'
  | 'model-http-auth'
  | 'model-http-quota'
  | 'model-http-rate-limit'
  | 'model-http-request'
  | 'model-http-timeout'
  | 'model-http-upstream'
  | 'model-response-invalid';

export class ModelFailure extends Error {
  constructor(readonly stage: ModelFailureStage) {
    super('Model request failed');
    this.name = 'ModelFailure';
  }
}
