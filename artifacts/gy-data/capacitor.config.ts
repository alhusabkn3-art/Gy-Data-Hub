import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gydatahub.app',
  appName: 'GY DATA',

  webDir: 'dist',

  bundledWebRuntime: false,

  android: {
    backgroundColor: '#FFFFFF',
  },
,
};

export default config;
