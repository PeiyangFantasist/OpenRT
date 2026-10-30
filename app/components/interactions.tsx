"use client";

import { useEffect } from "react";

type Reflection = { x: number; y: number; targetX: number; targetY: number; timer?: ReturnType<typeof setTimeout> };

/** Pointer reflections use one delegated listener and an idle-aware animation frame. */
export function InteractionEffects() {
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reflections = new Map<HTMLElement, Reflection>();
    let frame: number | null = null;
    let pending: { x: number; y: number; elements: HTMLElement[]; touch: boolean } | null = null;
    let hovered: HTMLElement[] = [];
    let pressed: { elements: HTMLElement[]; pointerId: number } | null = null;

    const elementsAt = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return [];
      const button = target.closest<HTMLButtonElement>("button");
      const surface = target.closest<HTMLElement>(".liquid-surface");
      return [surface, button && !button.disabled && button.getAttribute("aria-disabled") !== "true" ? button : null]
        .filter((element): element is HTMLElement => element !== null);
    };
    const remove = (element: HTMLElement) => {
      const state = reflections.get(element);
      if (state?.timer) clearTimeout(state.timer);
      reflections.delete(element);
      element.removeAttribute("data-reflect");
      element.removeAttribute("data-pressed");
      for (const key of ["--pointer-x", "--pointer-y", "--tilt-x", "--tilt-y"]) element.style.removeProperty(key);
    };
    const fade = (element: HTMLElement, delay = 0) => {
      const state = reflections.get(element);
      if (!state) return;
      if (state.timer) clearTimeout(state.timer);
      state.timer = setTimeout(() => {
        element.removeAttribute("data-reflect");
        element.removeAttribute("data-pressed");
        element.style.setProperty("--tilt-x", "0deg");
        element.style.setProperty("--tilt-y", "0deg");
        state.timer = setTimeout(() => remove(element), 240);
      }, delay);
    };
    const render = () => {
      frame = null;
      const position = pending;
      pending = null;
      if (position) {
        // Read geometry together, then write the interpolated highlights below.
        const positions = position.elements.map(element => ({ element, rect: element.getBoundingClientRect() }));
        for (const { element, rect } of positions) {
          if (!rect.width || !rect.height) continue;
          let state = reflections.get(element);
          const x = Math.max(0, Math.min(100, ((position.x - rect.left) / rect.width) * 100));
          const y = Math.max(0, Math.min(100, ((position.y - rect.top) / rect.height) * 100));
          if (!state) {
            state = { x, y, targetX: x, targetY: y };
            reflections.set(element, state);
          }
          if (state.timer) clearTimeout(state.timer);
          state.timer = undefined;
          state.targetX = x;
          state.targetY = y;
          element.setAttribute("data-reflect", "true");
          if (position.touch && !pressed?.elements.includes(element)) fade(element, 80);
        }
      }
      let moving = false;
      for (const [element, state] of reflections) {
        if (!element.isConnected) { remove(element); continue; }
        if (!element.hasAttribute("data-reflect")) continue;
        state.x += (state.targetX - state.x) * 0.24;
        state.y += (state.targetY - state.y) * 0.24;
        element.style.setProperty("--pointer-x", `${state.x.toFixed(2)}%`);
        element.style.setProperty("--pointer-y", `${state.y.toFixed(2)}%`);
        if (element instanceof HTMLButtonElement) {
          element.style.setProperty("--tilt-x", `${((50 - state.y) * 0.015).toFixed(2)}deg`);
          element.style.setProperty("--tilt-y", `${((state.x - 50) * 0.015).toFixed(2)}deg`);
        }
        if (Math.abs(state.targetX - state.x) + Math.abs(state.targetY - state.y) > 0.08) moving = true;
      }
      if (moving && !motion.matches) frame = requestAnimationFrame(render);
    };
    const track = (event: PointerEvent) => {
      if (motion.matches) return;
      const elements = elementsAt(event.target);
      for (const old of hovered) if (!elements.includes(old)) fade(old);
      hovered = elements;
      if (!elements.length) return;
      pending = { x: event.clientX, y: event.clientY, elements, touch: event.pointerType === "touch" };
      if (frame === null) frame = requestAnimationFrame(render);
    };
    const pointerDown = (event: PointerEvent) => {
      if (motion.matches || (event.pointerType === "mouse" && event.button !== 0)) return;
      const elements = elementsAt(event.target);
      pressed = { elements, pointerId: event.pointerId };
      for (const element of elements) element.setAttribute("data-pressed", "true");
      track(event);
    };
    const pointerUp = (event: PointerEvent) => {
      if (pressed?.pointerId !== event.pointerId) return;
      for (const element of pressed.elements) {
        element.removeAttribute("data-pressed");
        if (event.pointerType === "touch") fade(element, 80);
      }
      pressed = null;
    };
    const pointerOut = (event: PointerEvent) => {
      if (event.relatedTarget !== null) return;
      for (const element of hovered) fade(element);
      hovered = [];
    };
    const clear = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      pending = null;
      hovered = [];
      for (const element of pressed?.elements ?? []) element.removeAttribute("data-pressed");
      pressed = null;
      for (const element of reflections.keys()) remove(element);
    };
    const onVisibility = () => { if (document.hidden) clear(); };
    const onMotion = () => { if (motion.matches) clear(); };
    const options = { capture: true, passive: true };
    document.addEventListener("pointermove", track, options);
    document.addEventListener("pointerdown", pointerDown, options);
    document.addEventListener("pointerup", pointerUp, options);
    document.addEventListener("pointerout", pointerOut, options);
    document.addEventListener("pointercancel", clear, options);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", clear);
    motion.addEventListener("change", onMotion);
    return () => {
      document.removeEventListener("pointermove", track, true);
      document.removeEventListener("pointerdown", pointerDown, true);
      document.removeEventListener("pointerup", pointerUp, true);
      document.removeEventListener("pointerout", pointerOut, true);
      document.removeEventListener("pointercancel", clear, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", clear);
      motion.removeEventListener("change", onMotion);
      clear();
    };
  }, []);
  return null;
}
