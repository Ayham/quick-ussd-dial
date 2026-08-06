import { createRoot } from "react-dom/client";
import { useState, type ReactNode } from "react";
import App from "./App.tsx";
import "./index.css";
import { useTranslation } from "react-i18next";

function ErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [error, setError] = useState<Error | null>(null);

  if (error) {
    return (
      <div dir={document.documentElement.dir} style={{ padding: 32, textAlign: "center", fontFamily: "sans-serif" }}>
        <h2 style={{ marginBottom: 12 }}>{t("errors.boundaryTitle")}</h2>
        <p style={{ color: "#666", marginBottom: 16 }}>{error.message}</p>
        <button onClick={() => { setError(null); location.reload(); }} style={{ padding: "8px 24px", cursor: "pointer" }}>
          {t("errors.boundaryRetry")}
        </button>
      </div>
    );
  }

  return children;
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
