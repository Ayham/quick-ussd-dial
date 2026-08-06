import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_ACCENT_ID,
  buildAccentCss,
  clearAccentId,
  getAccentId,
  getAccentPreset,
  saveAccentId,
  type AccentColorId,
  type AccentPreset,
} from "@/lib/accent-theme";

const ACCENT_STYLE_ID = "accent-theme-vars";
const ACCENT_ANIMATING_CLASS = "accent-animating";

interface AccentThemeContextValue {
  accentId: AccentColorId;
  accentPreset: AccentPreset;
  /** Persist + apply a new accent color immediately. */
  setAccentId: (id: AccentColorId) => void;
  /** Apply a color without persisting it (live preview). */
  previewAccentId: (id: AccentColorId) => void;
  /** Re-apply the persisted color (used when a preview is discarded). */
  cancelPreview: () => void;
  /** Restore the default accent color (Green). */
  resetAccent: () => void;
}

const AccentThemeContext = createContext<AccentThemeContextValue | null>(null);

function applyAccentStyle(id: AccentColorId): void {
  const preset = getAccentPreset(id);
  let style = document.getElementById(ACCENT_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = ACCENT_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = buildAccentCss(preset);
}

export function AccentThemeProvider({ children }: { children: ReactNode }) {
  const [accentId, setAccentIdState] = useState<AccentColorId>(() => getAccentId());
  const animationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    applyAccentStyle(accentId);
    document.documentElement.dataset.accent = accentId;
  }, [accentId]);

  useEffect(() => {
    const onStorage = () => {
      const next = getAccentId();
      setAccentIdState((prev) => (prev === next ? prev : next));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const startAccentAnimation = useCallback(() => {
    const root = document.documentElement;
    root.classList.add(ACCENT_ANIMATING_CLASS);
    if (animationTimer.current) clearTimeout(animationTimer.current);
    animationTimer.current = setTimeout(() => {
      root.classList.remove(ACCENT_ANIMATING_CLASS);
      animationTimer.current = null;
    }, 420);
  }, []);

  const setAccentId = useCallback(
    (id: AccentColorId) => {
      saveAccentId(id);
      setAccentIdState(id);
      startAccentAnimation();
    },
    [startAccentAnimation],
  );

  const previewAccentId = useCallback(
    (id: AccentColorId) => {
      setAccentIdState(id);
      startAccentAnimation();
    },
    [startAccentAnimation],
  );

  const cancelPreview = useCallback(() => {
    setAccentIdState(getAccentId());
  }, []);

  const resetAccent = useCallback(() => {
    clearAccentId();
    setAccentIdState(DEFAULT_ACCENT_ID);
    startAccentAnimation();
  }, [startAccentAnimation]);

  const value = useMemo<AccentThemeContextValue>(
    () => ({
      accentId,
      accentPreset: getAccentPreset(accentId),
      setAccentId,
      previewAccentId,
      cancelPreview,
      resetAccent,
    }),
    [accentId, setAccentId, previewAccentId, cancelPreview, resetAccent],
  );

  return <AccentThemeContext.Provider value={value}>{children}</AccentThemeContext.Provider>;
}

export function useAccentTheme(): AccentThemeContextValue {
  const context = useContext(AccentThemeContext);
  if (!context) {
    throw new Error("useAccentTheme must be used within an <AccentThemeProvider>");
  }
  return context;
}
