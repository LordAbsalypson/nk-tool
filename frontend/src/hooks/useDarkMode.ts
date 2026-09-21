import { useEffect, useState } from "react";

export function useDarkMode() {
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem("nk-theme") === "dark";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("nk-theme", dark ? "dark" : "light");
    } catch {
      // localStorage nicht verfügbar (z. B. privater Modus) — Theme bleibt nur für diese Sitzung aktiv.
    }
  }, [dark]);

  return [dark, setDark] as const;
}
