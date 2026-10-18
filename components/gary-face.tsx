"use client";

import { animate } from "animejs";
import { motion, useReducedMotion, useSpring } from "motion/react";
import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

export type GaryState = "idle" | "thinking" | "happy" | "confused";

// Every mouth/brow shape uses the same path commands so motion can morph between them.
const MOUTH: Record<GaryState, string> = {
  idle: "M47 80 Q60 89 73 80",
  thinking: "M52 84 Q60 82 68 84",
  happy: "M43 77 Q60 99 77 77",
  confused: "M48 85 Q58 77 72 86",
};
const BROW_L: Record<GaryState, string> = {
  idle: "M33 39 Q43 34 52 38",
  thinking: "M33 35 Q43 29 52 34",
  happy: "M33 37 Q43 31 52 36",
  confused: "M33 33 Q43 26 52 33",
};
const BROW_R: Record<GaryState, string> = {
  idle: "M68 38 Q77 34 87 39",
  thinking: "M68 34 Q77 29 87 35",
  happy: "M68 36 Q77 31 87 37",
  confused: "M68 41 Q77 40 87 42",
};

export function GaryFace({ size = 120, state = "idle", track = true, className }: { size?: number; state?: GaryState; track?: boolean; className?: string }) {
  const id = useId().replace(/:/g, "");
  const root = useRef<SVGSVGElement>(null);
  const eyes = useRef<SVGGElement>(null);
  const reduce = useReducedMotion();
  const px = useSpring(0, { stiffness: 220, damping: 18 });
  const py = useSpring(0, { stiffness: 220, damping: 18 });

  // pupils follow the cursor (or look up while thinking)
  useEffect(() => {
    if (state === "thinking") {
      px.set(3.5);
      py.set(-4);
      return;
    }
    if (state === "confused") {
      px.set(-2.5);
      py.set(1.5);
      return;
    }
    if (!track) {
      px.set(0);
      py.set(0);
      return;
    }
    const onMove = (e: PointerEvent) => {
      const b = root.current?.getBoundingClientRect();
      if (!b) return;
      const dx = e.clientX - (b.left + b.width / 2);
      const dy = e.clientY - (b.top + b.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / 280);
      px.set((dx / d) * 4 * k);
      py.set((dy / d) * 4.5 * k);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [state, track, px, py]);

  // anime.js blink on a random cadence
  useEffect(() => {
    if (reduce) return;
    let timer: ReturnType<typeof setTimeout>;
    const blink = () => {
      const lids = eyes.current?.querySelectorAll<SVGGElement>(".lid");
      if (lids?.length) animate(lids, { scaleY: [1, 0.08, 1], duration: 200, ease: "inOutQuad" });
      timer = setTimeout(blink, 2200 + Math.random() * 3400);
    };
    timer = setTimeout(blink, 1200);
    return () => clearTimeout(timer);
  }, [reduce]);

  const ink = "#1b0f07";
  const squint = state === "happy" ? 0.62 : 1;

  return (
    <motion.svg
      ref={root}
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={cn("shrink-0 overflow-visible", className)}
      animate={reduce ? undefined : { y: [0, -3, 0] }}
      transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
      role="img"
      aria-label={`Gary is ${state}`}
    >
      <defs>
        <radialGradient id={`body-${id}`} cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#ff9a5c" />
          <stop offset="55%" stopColor="#ff5a1f" />
          <stop offset="100%" stopColor="#d9400f" />
        </radialGradient>
        <filter id={`shadow-${id}`} x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#ff5a1f" floodOpacity="0.35" />
        </filter>
      </defs>

      {/* thinking orbit */}
      <motion.circle
        cx="60"
        cy="60"
        r="58"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeDasharray="3 7"
        style={{ originX: "60px", originY: "60px" }}
        initial={false}
        animate={{ opacity: state === "thinking" ? 0.8 : 0, rotate: state === "thinking" ? 360 : 0 }}
        transition={{ opacity: { duration: 0.3 }, rotate: { duration: 6, repeat: Infinity, ease: "linear" } }}
      />

      <path d="M60 6 C97 6 114 23 114 60 C114 97 97 114 60 114 C23 114 6 97 6 60 C6 23 23 6 60 6 Z" fill={`url(#body-${id})`} filter={`url(#shadow-${id})`} />
      <ellipse cx="40" cy="26" rx="16" ry="8" fill="#fff" opacity="0.22" transform="rotate(-24 40 26)" />
      <ellipse cx="33" cy="72" rx="7" ry="4" fill="#ff2d6f" opacity={state === "happy" ? 0.45 : 0.22} />
      <ellipse cx="87" cy="72" rx="7" ry="4" fill="#ff2d6f" opacity={state === "happy" ? 0.45 : 0.22} />

      <motion.path initial={false} animate={{ d: BROW_L[state] }} transition={{ type: "spring", stiffness: 260, damping: 18 }} stroke={ink} strokeWidth="3.4" strokeLinecap="round" fill="none" />
      <motion.path initial={false} animate={{ d: BROW_R[state] }} transition={{ type: "spring", stiffness: 260, damping: 18 }} stroke={ink} strokeWidth="3.4" strokeLinecap="round" fill="none" />

      <g ref={eyes}>
        {[43, 77].map((cx) => (
          <g key={cx} className="lid" style={{ transformBox: "fill-box", transformOrigin: "center" }}>
            <motion.ellipse
              cx={cx}
              cy="55"
              rx="10.5"
              ry="12.5"
              fill="#fffaf3"
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
              initial={false}
              animate={{ scaleY: squint }}
            />
            <motion.g style={{ x: px, y: py }}>
              <motion.circle cx={cx} cy="56" r="5.6" fill={ink} initial={false} animate={{ scaleY: squint }} style={{ transformBox: "fill-box", transformOrigin: "center" }} />
              <circle cx={cx + 1.9} cy="53.8" r="1.7" fill="#fff" />
            </motion.g>
          </g>
        ))}
      </g>

      <motion.path
        initial={false}
        animate={{ d: MOUTH[state] }}
        transition={{ type: "spring", stiffness: 260, damping: 16 }}
        stroke={ink}
        strokeWidth="3.6"
        strokeLinecap="round"
        fill={state === "happy" ? "#5a1607" : "none"}
      />

      {/* thinking dots */}
      {state === "thinking" &&
        [0, 1, 2].map((i) => (
          <motion.circle
            key={i}
            cx={92 + i * 9}
            cy={12}
            r="3"
            fill="var(--accent)"
            animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
    </motion.svg>
  );
}
