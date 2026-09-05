import type {ModelRequestStatus} from './model-request-status.js';

export type ModelFailureStage = 'model-request' | 'model-output-validate';

export class ModelFailure extends Error {
  readonly stage: ModelFailureStage;
  readonly requestStatus?: ModelRequestStatus;

  constructor(stage: ModelFailureStage, requestStatus?: ModelRequestStatus) {
    super('Model operation failed');
    this.stage = stage;
    if (stage === 'model-request' && requestStatus) this.requestStatus = requestStatus;
    this.name = 'ModelFailure';
  }
}
