import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { isNativeApp } from "./lib/platform";

// Configure status bar & navigation bar for native app
if (isNativeApp()) {
  document.documentElement.classList.add("native-app");
  import("@capacitor/status-bar").then(({ StatusBar, Style }) => {
    StatusBar.setOverlaysWebView({ overlay: true });
    StatusBar.setStyle({ style: Style.Light });
    StatusBar.setBackgroundColor({ color: "#00000000" }); // transparent
  }).catch(() => {});
}

createRoot(document.getElementById("root")!).render(<App />);
