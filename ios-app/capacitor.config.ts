import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'jp.yos.onlysystem',
  appName: 'YOS',
  webDir: 'www',
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scheme: 'YOS'
  },
  server: {
    iosScheme: 'https'
  }
};

export default config;
