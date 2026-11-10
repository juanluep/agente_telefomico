"use client";

import { Moon, Sun } from "@phosphor-icons/react";

export function ThemeToggle() {
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      aria-label="Cambiar tema"
      onClick={() => {
        const next = !document.documentElement.classList.contains("dark");
        document.documentElement.classList.toggle("dark", next);
        try {
          localStorage.setItem("theme", next ? "dark" : "light");
        } catch {
          /* ignore */
        }
      }}
    >
      <Moon size={18} className="dark:hidden" />
      <Sun size={18} className="hidden dark:block" />
    </button>
  );
}