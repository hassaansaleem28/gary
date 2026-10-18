"use client";

import { Moon, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { ThemeToggler, type Resolved, type ThemeSelection } from "@/components/ui/theme-toggler";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className={cn("inline-block size-9", className)} />;

  return (
    <ThemeToggler theme={(theme ?? "dark") as ThemeSelection} resolvedTheme={(resolvedTheme ?? "dark") as Resolved} setTheme={setTheme} origin={() => origin.current}>
      {({ resolved, toggleTheme }) => (
        <button
          ref={btn}
          aria-label={`Switch to ${resolved === "dark" ? "light" : "dark"} mode`}
          onClick={() => {
            const b = btn.current?.getBoundingClientRect();
            if (b) origin.current = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
            toggleTheme(resolved === "dark" ? "light" : "dark");
          }}
          className={cn(
            "relative grid size-9 place-items-center overflow-hidden rounded-full border border-line bg-panel text-ink transition-colors hover:border-accent",
            className,
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={resolved}
              initial={{ y: 14, rotate: -90, opacity: 0 }}
              animate={{ y: 0, rotate: 0, opacity: 1 }}
              exit={{ y: -14, rotate: 90, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 22 }}
            >
              {resolved === "dark" ? <Moon size={16} /> : <Sun size={16} />}
            </motion.span>
          </AnimatePresence>
        </button>
      )}
    </ThemeToggler>
  );
}
