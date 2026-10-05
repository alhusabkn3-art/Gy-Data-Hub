import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gydatahub.app',
  appName: 'GY DATA',

  webDir: 'dist',

  bundledWebRuntime: false,

  android: {
    backgroundColor: '#FFFFFF',
  },

  plugins: {
    SplashScreen: {
      /*
       * The Android system launch splash and the Capacitor splash
       * both use the same GY DATA resource.
       *
       * This prevents the default Capacitor splash from appearing
       * before the real GY DATA branding.
       */
      launchAutoHide: true,
      launchShowDuration: 0,
      launchFadeOutDuration: 0,

      backgroundColor: '#FFFFFF',

      androidSplashResourceName: 'gy_data_splash',
      androidScaleType: 'CENTER',

      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
  },
};

export default config;
