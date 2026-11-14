"use client";

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from "react";
import type { ThemePreference } from "@/components/arc/user-menu/user-menu";

const KEY = "ccp-theme";
const listeners = new Set<() => void>();

const read = (): ThemePreference => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
};
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener("storage", cb); // other tabs
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
};

const systemTheme = () => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
const apply = (p: ThemePreference) => {
  document.documentElement.dataset.theme = p === "system" ? systemTheme() : p;
};

const ThemeContext = createContext<{ preference: ThemePreference; setPreference: (p: ThemePreference) => void }>({
  preference: "system",
  setPreference: () => {},
});

/**
 * Light / dark / system preference stored in localStorage. The script in app/layout.tsx applies it
 * before first paint; this keeps it in sync across tabs and follows the OS while on "system".
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const preference = useSyncExternalStore(subscribe, read, () => "system" as ThemePreference);

  useEffect(() => {
    apply(preference);
    if (preference !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((p: ThemePreference) => {
    try {
      localStorage.setItem(KEY, p);
    } catch {
      // Storage unavailable (private mode): apply for this visit only.
      apply(p);
    }
    listeners.forEach((l) => l());
  }, []);

  return <ThemeContext.Provider value={{ preference, setPreference }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
