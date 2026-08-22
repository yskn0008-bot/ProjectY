import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'jp.yos.onlysystem',
  appName: 'YOS',
  webDir: 'www',
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile'
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  }
};

export default config;
