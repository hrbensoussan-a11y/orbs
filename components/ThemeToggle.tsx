"use client";

import { useState } from "react";
import { THEME_COOKIE, type ThemeName } from "@/lib/constants";

export function ThemeToggle({ initial }: { initial: ThemeName }) {
  const [theme, setTheme] = useState<ThemeName>(initial);

  function toggle() {
    const next: ThemeName = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn-ghost !px-2.5"
      aria-label={theme === "dark" ? "Passer en clair" : "Passer en sombre"}
      title={theme === "dark" ? "Thème clair" : "Thème sombre"}
    >
      <span aria-hidden className="text-base leading-none">
        {theme === "dark" ? "☀" : "☾"}
      </span>
    </button>
  );
}
