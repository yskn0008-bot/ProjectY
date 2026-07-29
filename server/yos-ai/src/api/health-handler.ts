import { allowedOrigin, secureJson, type CorsOptions } from './shared.js';

export interface HealthHandlerOptions extends CorsOptions {
  version?: string;
  clock?: () => string;
}

export function createHealthHandler(options: HealthHandlerOptions): (request: Request) => Promise<Response> {
  const version = options.version ?? '0.1.0';
  const clock = options.clock ?? (() => new Date().toISOString());

  return async (request: Request): Promise<Response> => {
    const origin = allowedOrigin(request, options);
    if (origin === null) return secureJson({ status: 'denied' }, 403, null);
    if (request.method !== 'GET') {
      return secureJson({ error: 'Method not allowed' }, 405, origin, { Allow: 'GET' });
    }
    return secureJson({
      status: 'ok',
      service: 'yos-ai',
      version,
      time: clock()
    }, 200, origin);
  };
}
