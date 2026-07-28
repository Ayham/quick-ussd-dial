import { createRoot } from "react-dom/client";
import { Component, type ReactNode } from "react";
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

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div dir="rtl" style={{ padding: 32, textAlign: "center", fontFamily: "sans-serif" }}>
          <h2 style={{ marginBottom: 12 }}>حدث خطأ غير متوقع</h2>
          <p style={{ color: "#666", marginBottom: 16 }}>{this.state.error.message}</p>
          <button onClick={() => { this.setState({ error: null }); location.reload(); }} style={{ padding: "8px 24px", cursor: "pointer" }}>
            أعد المحاولة
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
