import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.gydatahub.app",

  appName: "GY DATA",

  webDir: "dist",

  bundledWebRuntime: false,

  android: {
    backgroundColor: "#FFFFFF"
  },

  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 900,
      backgroundColor: "#FFFFFF",
      androidSplashResourceName: "gy_data_splash",
      androidScaleType: "CENTER",
      showSpinner: false
    }
  }
};

export default config;
