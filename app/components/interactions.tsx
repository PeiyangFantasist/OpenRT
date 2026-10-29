"use client";

import { useEffect } from "react";

/** Delegated button reflections stay outside React's rendering path. */
export function InteractionEffects() {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const touched = new Set<HTMLButtonElement>();
    const timers = new Map<HTMLButtonElement, ReturnType<typeof setTimeout>>();
    let active: HTMLButtonElement | null = null;
    let pressed: { button: HTMLButtonElement; pointerId: number } | null = null;
    let pending: { button: HTMLButtonElement; x: number; y: number; touch: boolean } | null = null;
    let frame: number | null = null;

    const buttonAt = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null;
      const button = target.closest("button");
      return button instanceof HTMLButtonElement && !button.disabled && button.getAttribute("aria-disabled") !== "true" ? button : null;
    };
    const stopTimer = (button: HTMLButtonElement) => {
      const timer = timers.get(button);
      if (timer !== undefined) clearTimeout(timer);
      timers.delete(button);
    };
    const removeVariables = (button: HTMLButtonElement) => {
      for (const property of ["--pointer-x", "--pointer-y", "--tilt-x", "--tilt-y"]) button.style.removeProperty(property);
      touched.delete(button);
    };
    const clearButton = (button: HTMLButtonElement, immediate = false) => {
      stopTimer(button);
      touched.add(button);
      button.removeAttribute("data-reflect");
      button.removeAttribute("data-pressed");
      button.style.setProperty("--tilt-x", "0deg");
      button.style.setProperty("--tilt-y", "0deg");
      if (active === button) active = null;
      if (pending?.button === button) pending = null;
      if (immediate) removeVariables(button);
      else timers.set(button, setTimeout(() => { timers.delete(button); removeVariables(button); }, 230));
    };
    const fadeLater = (button: HTMLButtonElement, delay: number) => {
      stopTimer(button);
      timers.set(button, setTimeout(() => { timers.delete(button); clearButton(button); }, delay));
    };
    const renderPointer = () => {
      frame = null;
      const position = pending;
      pending = null;
      if (!position) return;
      const { button, x, y, touch } = position;
      if (reducedMotion.matches || button.disabled || button.getAttribute("aria-disabled") === "true" || !button.isConnected) {
        clearButton(button, true);
        return;
      }
      // One geometry read per frame, regardless of pointer event frequency.
      const rect = button.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const relativeX = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
      const relativeY = Math.max(0, Math.min(1, (y - rect.top) / rect.height));
      stopTimer(button);
      if (active && active !== button) clearButton(active);
      active = button;
      touched.add(button);
      button.style.setProperty("--pointer-x", `${(relativeX * 100).toFixed(2)}%`);
      button.style.setProperty("--pointer-y", `${(relativeY * 100).toFixed(2)}%`);
      button.style.setProperty("--tilt-x", `${touch ? 0 : ((0.5 - relativeY) * 2.2).toFixed(2)}deg`);
      button.style.setProperty("--tilt-y", `${touch ? 0 : ((relativeX - 0.5) * 2.2).toFixed(2)}deg`);
      button.setAttribute("data-reflect", "true");
      if (touch && pressed?.button !== button) fadeLater(button, 90);
    };
    const track = (event: PointerEvent) => {
      if (reducedMotion.matches) return;
      const button = buttonAt(event.target);
      if (!button) {
        pending = null;
        if (active) clearButton(active);
        return;
      }
      pending = { button, x: event.clientX, y: event.clientY, touch: event.pointerType === "touch" };
      if (frame === null) frame = requestAnimationFrame(renderPointer);
    };
    const pointerDown = (event: PointerEvent) => {
      if (reducedMotion.matches || (event.pointerType === "mouse" && event.button !== 0)) return;
      const button = buttonAt(event.target);
      if (!button) return;
      if (pressed && pressed.button !== button) clearButton(pressed.button);
      pressed = { button, pointerId: event.pointerId };
      touched.add(button);
      stopTimer(button);
      button.setAttribute("data-pressed", "true");
      track(event);
    };
    const pointerUp = (event: PointerEvent) => {
      if (!pressed || pressed.pointerId !== event.pointerId) return;
      const button = pressed.button;
      pressed = null;
      button.removeAttribute("data-pressed");
      if (event.pointerType === "touch") fadeLater(button, 90);
      else if (buttonAt(event.target) !== button) clearButton(button);
    };
    const pointerOut = (event: PointerEvent) => {
      const button = buttonAt(event.target);
      if (!button) return;
      if (event.relatedTarget instanceof Node && button.contains(event.relatedTarget)) return;
      if (event.pointerType === "touch" && pressed?.button === button) return;
      clearButton(button);
    };
    const clearAll = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      pending = null;
      pressed = null;
      for (const button of touched) clearButton(button, true);
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      active = null;
    };
    const visibilityChange = () => { if (document.hidden) clearAll(); };
    const motionChange = () => { if (reducedMotion.matches) clearAll(); };
    const listenerOptions = { capture: true, passive: true };
    document.addEventListener("pointermove", track, listenerOptions);
    document.addEventListener("pointerdown", pointerDown, listenerOptions);
    document.addEventListener("pointerup", pointerUp, listenerOptions);
    document.addEventListener("pointerout", pointerOut, listenerOptions);
    document.addEventListener("pointercancel", clearAll, listenerOptions);
    document.addEventListener("visibilitychange", visibilityChange);
    window.addEventListener("blur", clearAll);
    reducedMotion.addEventListener("change", motionChange);
    return () => {
      document.removeEventListener("pointermove", track, true);
      document.removeEventListener("pointerdown", pointerDown, true);
      document.removeEventListener("pointerup", pointerUp, true);
      document.removeEventListener("pointerout", pointerOut, true);
      document.removeEventListener("pointercancel", clearAll, true);
      document.removeEventListener("visibilitychange", visibilityChange);
      window.removeEventListener("blur", clearAll);
      reducedMotion.removeEventListener("change", motionChange);
      clearAll();
    };
  }, []);

  return null;
}
