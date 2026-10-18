"use client";

import { ReactLenis } from "lenis/react";

// Lenis drives the landing page's scroll; the /app workspace keeps native scroll in its panes.
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  return (
    <ReactLenis root options={{ lerp: 0.085, smoothWheel: true, wheelMultiplier: 1 }}>
      {children}
    </ReactLenis>
  );
}
