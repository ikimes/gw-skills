import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { publicAssetUrl } from "./utils/publicAsset";

document.documentElement.style.setProperty(
  "--app-background-image",
  `url("${publicAssetUrl("backgrounds/gw_loading_screen.png")}")`,
);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
