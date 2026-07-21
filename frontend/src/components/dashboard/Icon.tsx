"use client";

import { useEffect, useState } from "react";

// Icons ship as static SVG files (public/icons/<Category>/<Name>.svg, see
// lib/icon-manifest.ts) rather than one React component per icon — 436 of
// them, so importing each as its own module would mean bundling all of them
// into every page that touches a note. Fetched on demand and cached by name
// (a module-level Map survives across every Icon instance on the page, so
// the same icon fetched from a tree row and a picker grid only hits the
// network once) — safe to inline via dangerouslySetInnerHTML since the
// content is always one of our own bundled static files, never anything
// user-supplied.
const svgCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

export function Icon({
  name,
  size = 16,
  className,
  style,
}: {
  name: string;
  size?: number;
  className?: string;
  // For the common case (a Tailwind text-color class) prefer `className`;
  // this exists for the handful of call sites that colored their old inline
  // SVG via a CSS custom property (e.g. `var(--brand-purple)`), which has no
  // Tailwind utility.
  style?: React.CSSProperties;
}) {
  const [svg, setSvg] = useState<string | null>(svgCache.get(name) ?? null);

  useEffect(() => {
    const cached = svgCache.get(name);
    if (cached) {
      setSvg(cached);
      return;
    }
    let cancelled = false;
    let promise = inflight.get(name);
    if (!promise) {
      promise = fetch(`/icons/${name}.svg`).then((r) => r.text());
      inflight.set(name, promise);
    }
    promise.then((text) => {
      svgCache.set(name, text);
      inflight.delete(name);
      if (!cancelled) setSvg(text);
    });
    return () => {
      cancelled = true;
    };
  }, [name]);

  const markup = svg ? svg.replace('width="24"', `width="${size}"`).replace('height="24"', `height="${size}"`) : "";

  return (
    <span
      className={className}
      style={{ width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1, ...style }}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
