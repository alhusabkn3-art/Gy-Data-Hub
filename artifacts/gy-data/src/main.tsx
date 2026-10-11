import "./lib/apiBase";

import React from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App";

import "./index.css";


const rootElement =
  document.getElementById("root");

if (!rootElement) {
  throw new Error(
    "GY DATA: #root element was not found.",
  );
}

const root =
  createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

