export interface YOSGoogleTVRemotePlugin {
  startPairing(options: { host: string }): Promise<{ state: 'waitingCode' }>;
  finishPairing(options: { code: string }): Promise<{ state: 'paired' }>;
  sendText(options: { host: string; text: string }): Promise<{ sent: true }>;
  unpair(): Promise<void>;
}
export declare const YOSGoogleTVRemote: YOSGoogleTVRemotePlugin;
