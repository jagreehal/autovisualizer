import { useEffect, useState } from "react"

export type Theme = "light" | "dark"

const KEY = "autovisualizer:theme"

const stored = (): Theme =>
  localStorage.getItem(KEY) === "light" ||
  (!localStorage.getItem(KEY) && matchMedia("(prefers-color-scheme: light)").matches)
    ? "light"
    : "dark"

/** Theme lives on `<html class="dark">` and in localStorage. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(stored)
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    localStorage.setItem(KEY, theme)
  }, [theme])
  return [theme, () => setTheme((current) => (current === "dark" ? "light" : "dark"))] as const
}
