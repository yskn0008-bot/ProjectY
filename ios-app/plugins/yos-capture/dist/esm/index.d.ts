export type YOSCaptureInputMode = 'voice' | 'text';

export interface YOSCaptureRecord {
  captureID: string;
  schemaVersion: number;
  rawText: string;
  capturedAt: string;
  inputMode: YOSCaptureInputMode;
  status: 'captured' | 'classified' | 'applying' | 'applied' | 'needs_review' | 'failed';
  classificationCandidate?: { target: string; label: string; confidence: number };
  parsedDateTime?: { start: string; end?: string; timeZone: string; allDay: boolean };
  target?: string;
  confidence?: number;
  appliedRecordID?: string;
  applyAttemptID?: string;
  lastErrorCode?: string;
}

export interface YOSCapturePlugin {
  capture(options: { rawText: string; inputMode: YOSCaptureInputMode }): Promise<{ record: YOSCaptureRecord }>;
  list(options?: { limit?: number }): Promise<{ records: YOSCaptureRecord[]; storageScope: string }>;
  applyCalendar(options: { captureID: string; calendarIdentifier: string }): Promise<{ record: YOSCaptureRecord }>;
  applyReminder(options: { captureID: string; listIdentifier: string }): Promise<{ record: YOSCaptureRecord }>;
}

export declare const YOSCapture: YOSCapturePlugin;
