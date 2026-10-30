"use client";

import { useEffect } from "react";
import type { LiquidGlass as GlassInstance } from "apple-liquid-glass-webgl";

/** Enhance the two primary controls; the DOM and CSS remain usable without WebGL. */
export function LiquidGlassEffects() {
  useEffect(() => {
    const surfaces = new Map<HTMLElement, GlassInstance>();
    const reducedTransparency = window.matchMedia("(prefers-reduced-transparency: reduce)");
    let Glass: typeof import("apple-liquid-glass-webgl").LiquidGlass | null = null;
    let disposed = false;
    let frame: number | null = null;
    let lastTheme = "";

    const reconcile = () => {
      frame = null;
      if (disposed) return;
      const dark = document.documentElement.dataset.theme === "dark";
      const theme = dark ? "dark" : "light";
      // The page is intentionally plain black/white. An explicit color source
      // avoids repainting hidden <details> text through the library's DOM scanner.
      const backdrop = { color: dark ? "#000000" : "#ffffff" };
      const candidates = Array.from(document.querySelectorAll<HTMLElement>(".liquid-surface"))
        .filter(element => element.isConnected && element.getClientRects().length > 0 && !element.closest("[hidden]"))
        .sort((a, b) => Number(b.dataset.glassPriority ?? 0) - Number(a.dataset.glassPriority ?? 0))
        .slice(0, 2);
      const selected = new Set(candidates);
      for (const [element, instance] of surfaces) {
        if (!selected.has(element) || reducedTransparency.matches || document.hidden) {
          instance.destroy();
          surfaces.delete(element);
        }
      }
      for (const element of candidates) {
        if (reducedTransparency.matches) {
          element.dataset.liquidGlass = "fallback";
          continue;
        }
        if (!Glass || document.hidden) continue;
        const existing = surfaces.get(element);
        if (existing) {
          if (lastTheme !== theme) existing.update({ backdrop, tintTone: theme, tint: dark ? 0.16 : 0.08 });
          continue;
        }
        try {
          let contextLost = false;
          const instance = new Glass(element, {
            backdrop,
            tint: dark ? 0.16 : 0.08,
            tintTone: theme,
            frost: 0.06,
            maxDpr: 1.5,
            live: false,
            fallback: "none",
            respectReducedTransparency: true,
            onContextLost: () => {
              contextLost = true;
              element.dataset.liquidGlass = "fallback";
              const canvas = element.querySelector<HTMLCanvasElement>(":scope > canvas[data-liquid-glass-layer]");
              if (canvas) canvas.style.opacity = "0";
            },
            onContextRestored: () => { contextLost = false; },
            onRender: surface => {
              // Keep the CSS surface visible until a restored context has repainted.
              if (!contextLost && surface.canvas?.style.opacity === "0") {
                surface.canvas.style.removeProperty("opacity");
                element.dataset.liquidGlass = "webgl";
              }
            },
            material: {
              refraction: 64,
              edgeReach: 0.12,
              edgeWidth: 0.2,
              dispersion: 0,
              body: 0.5,
              rim: 0.28,
              highlight: 0.4,
              reflection: 0.24,
              hairline: 0.6,
            },
          });
          surfaces.set(element, instance);
        } catch {
          Glass.from(element)?.destroy();
          element.dataset.liquidGlass = "fallback";
        }
      }
      lastTheme = theme;
    };
    const schedule = () => {
      if (!disposed && frame === null) frame = requestAnimationFrame(reconcile);
    };
    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    const themeObserver = new MutationObserver(schedule);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    reducedTransparency.addEventListener("change", schedule);
    document.addEventListener("visibilitychange", schedule);
    window.addEventListener("resize", schedule, { passive: true });

    // Loading the shader is optional: failures leave the transparent CSS material intact.
    void import("apple-liquid-glass-webgl").then(module => {
      if (disposed) return;
      Glass = module.LiquidGlass;
      schedule();
    }).catch(() => {
      if (disposed) return;
      document.querySelectorAll<HTMLElement>(".liquid-surface").forEach(element => { element.dataset.liquidGlass = "fallback"; });
    });
    schedule();
    return () => {
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      mutationObserver.disconnect();
      themeObserver.disconnect();
      reducedTransparency.removeEventListener("change", schedule);
      document.removeEventListener("visibilitychange", schedule);
      window.removeEventListener("resize", schedule);
      for (const instance of surfaces.values()) instance.destroy();
      surfaces.clear();
    };
  }, []);
  return null;
}
