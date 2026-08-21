export interface YOSSecureCredentialsPlugin {
  set(options: { key: 'braviaPSK'; value: string }): Promise<void>;
  get(options: { key: 'braviaPSK' }): Promise<{ value: string }>;
}
export declare const YOSSecureCredentials: YOSSecureCredentialsPlugin;
