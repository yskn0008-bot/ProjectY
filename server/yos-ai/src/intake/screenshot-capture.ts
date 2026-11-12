/**
 * Screenshot intake validation. Pure validation only: this module does not
 * upload images, create Notion records, or mutate a user's clipboard.
 *
 * Accepting a payload does NOT establish that it was the screenshot which
 * triggered an iOS automation. That requires a separate device-side check.
 */
export interface ScreenshotCapture {
  captureId: string;
  capturedAt: string;
  source: 'ios-screenshot';
  saveLocation: 'photos' | 'files' | 'clipboard';
  mimeType: 'image/png' | 'image/jpeg' | 'image/heic';
  imageBase64: string;
}

export type ScreenshotParseResult =
  | {ok: true; value: ScreenshotCapture; byteLength: number}
  | {ok: false; error: string};

const MAX_IMAGE_BYTES = 5_000_000;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

export function parseScreenshotCapture(input: unknown): ScreenshotParseResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {ok: false, error: 'Screenshot payload must be an object'};
  }
  const data = input as Record<string, unknown>;
  if (data.source !== 'ios-screenshot') return {ok: false, error: 'Invalid screenshot source'};
  if (data.saveLocation !== 'photos' && data.saveLocation !== 'files' && data.saveLocation !== 'clipboard') {
    return {ok: false, error: 'Invalid save location'};
  }
  if (typeof data.captureId !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/u.test(data.captureId)) {
    return {ok: false, error: 'Stable captureId is required'};
  }
  if (typeof data.capturedAt !== 'string' || data.capturedAt.length > 80 || !Number.isFinite(Date.parse(data.capturedAt))) {
    return {ok: false, error: 'Valid capturedAt is required'};
  }
  if (data.mimeType !== 'image/png' && data.mimeType !== 'image/jpeg' && data.mimeType !== 'image/heic') {
    return {ok: false, error: 'Unsupported image format'};
  }
  if (typeof data.imageBase64 !== 'string' || !data.imageBase64 || !BASE64_PATTERN.test(data.imageBase64)) {
    return {ok: false, error: 'Invalid base64 image'};
  }
  const padding = data.imageBase64.endsWith('==') ? 2 : data.imageBase64.endsWith('=') ? 1 : 0;
  const byteLength = (data.imageBase64.length / 4) * 3 - padding;
  if (byteLength > MAX_IMAGE_BYTES) return {ok: false, error: 'Image exceeds size limit'};
  if (byteLength < 8) return {ok: false, error: 'Image is too small'};
  return {
    ok: true,
    value: {
      captureId: data.captureId,
      capturedAt: data.capturedAt,
      source: 'ios-screenshot',
      saveLocation: data.saveLocation,
      mimeType: data.mimeType,
      imageBase64: data.imageBase64
    },
    byteLength
  };
}
