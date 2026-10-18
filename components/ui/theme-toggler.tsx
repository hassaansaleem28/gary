'use client';

// Vendored from Animate UI (animate-ui.com) registry: primitives-effects-theme-toggler

import * as React from 'react';
import { flushSync } from 'react-dom';

type ThemeSelection = 'light' | 'dark' | 'system';
type Resolved = 'light' | 'dark';
type Direction = 'btt' | 'ttb' | 'ltr' | 'rtl';

type ChildrenRender =
  | React.ReactNode
  | ((state: {
      resolved: Resolved;
      effective: ThemeSelection;
      toggleTheme: (theme: ThemeSelection) => void;
    }) => React.ReactNode);

function getSystemEffective(): Resolved {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function getClipKeyframes(direction: Direction): [string, string] {
  switch (direction) {
    case 'ltr':
      return ['inset(0 100% 0 0)', 'inset(0 0 0 0)'];
    case 'rtl':
      return ['inset(0 0 0 100%)', 'inset(0 0 0 0)'];
    case 'ttb':
      return ['inset(0 0 100% 0)', 'inset(0 0 0 0)'];
    case 'btt':
      return ['inset(100% 0 0 0)', 'inset(0 0 0 0)'];
    default:
      return ['inset(0 100% 0 0)', 'inset(0 0 0 0)'];
  }
}

type ThemeTogglerProps = {
  /** Gary addition: when set, the new theme is revealed as a circle growing from this viewport point. */
  origin?: () => { x: number; y: number } | null;
  theme: ThemeSelection;
  resolvedTheme: Resolved;
  setTheme: (theme: ThemeSelection) => void;
  direction?: Direction;
  onImmediateChange?: (theme: ThemeSelection) => void;
  children?: ChildrenRender;
};

function ThemeToggler({
  origin,
  theme,
  resolvedTheme,
  setTheme,
  onImmediateChange,
  direction = 'ltr',
  children,
  ...props
}: ThemeTogglerProps) {
  const [preview, setPreview] = React.useState<null | {
    effective: ThemeSelection;
    resolved: Resolved;
  }>(null);
  const [current, setCurrent] = React.useState<{
    effective: ThemeSelection;
    resolved: Resolved;
  }>({
    effective: theme,
    resolved: resolvedTheme,
  });

  React.useEffect(() => {
    if (
      preview &&
      theme === preview.effective &&
      resolvedTheme === preview.resolved
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- vendored: clears the preview once next-themes catches up
      setPreview(null);
    }
  }, [theme, resolvedTheme, preview]);

  const [fromClip, toClip] = getClipKeyframes(direction);

  const toggleTheme = React.useCallback(
    async (theme: ThemeSelection) => {
      const resolved = theme === 'system' ? getSystemEffective() : theme;

      setCurrent({ effective: theme, resolved });
      onImmediateChange?.(theme);

      if (theme === 'system' && resolved === resolvedTheme) {
        setTheme(theme);
        return;
      }

      if (!document.startViewTransition) {
        flushSync(() => {
          setPreview({ effective: theme, resolved });
        });
        setTheme(theme);
        return;
      }

      await document.startViewTransition(() => {
        flushSync(() => {
          setPreview({ effective: theme, resolved });
          document.documentElement.classList.toggle(
            'dark',
            resolved === 'dark',
          );
        });
      }).ready;

      const o = origin?.();
      const keyframes = o
        ? [`circle(0px at ${o.x}px ${o.y}px)`, `circle(${Math.hypot(Math.max(o.x, innerWidth - o.x), Math.max(o.y, innerHeight - o.y))}px at ${o.x}px ${o.y}px)`]
        : [fromClip, toClip];
      document.documentElement
        .animate(
          { clipPath: keyframes },
          {
            duration: 700,
            easing: 'ease-in-out',
            pseudoElement: '::view-transition-new(root)',
          },
        )
        .finished.finally(() => {
          setTheme(theme);
        });
    },
    [onImmediateChange, resolvedTheme, fromClip, toClip, setTheme, origin],
  );

  return (
    <React.Fragment {...props}>
      {typeof children === 'function'
        ? children({
            effective: current.effective,
            resolved: current.resolved,
            toggleTheme,
          })
        : children}
      <style>{`::view-transition-old(root), ::view-transition-new(root){animation:none;mix-blend-mode:normal;}`}</style>
    </React.Fragment>
  );
}

export {
  ThemeToggler,
  type ThemeTogglerProps,
  type ThemeSelection,
  type Resolved,
  type Direction,
};
