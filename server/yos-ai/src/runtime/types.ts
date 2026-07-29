import type {YosAnswer, YosRequest} from '../types.js';

export interface YosAnswerService {
  answer(request: YosRequest): Promise<YosAnswer>;
}

export interface RequestRuntimeContext {
  requestId: string;
  subjectHash: string;
  vercelOidcToken?: string;
}

export interface RequestRuntimeFactory {
  create(context: RequestRuntimeContext): Promise<YosAnswerService>;
}
