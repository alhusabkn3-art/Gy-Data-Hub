import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";

import App from "./App";

import "./index.css";

async function hideNativeSplash() {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    await SplashScreen.hide({
      fadeOutDuration: 250
    });
  } catch {
    // Ignore splash errors on unsupported environments.
  }
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error(
    "GY DATA: #root element was not found."
  );
}

const root = createRoot(rootElement);

root.render(<App />);

void hideNativeSplash();
