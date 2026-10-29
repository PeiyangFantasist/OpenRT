"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

type AnimatedDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

/** Keep the native modal mounted until its closing animation has completed. */
export function AnimatedDialog({ open, onClose, title, children }: AnimatedDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
      return;
    }
    if (!dialog.open) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const close = () => { if (dialog.open) dialog.close(); };
    if (motion.matches) {
      close();
      return;
    }
    const timer = setTimeout(close, 180);
    const motionChange = () => { if (motion.matches) { clearTimeout(timer); close(); } };
    motion.addEventListener("change", motionChange);
    // Reopening during the fade cancels the pending native close and retains focus.
    return () => {
      clearTimeout(timer);
      motion.removeEventListener("change", motionChange);
    };
  }, [open]);

  return <dialog
    ref={dialogRef}
    className={`stats-dialog${open ? "" : " closing"}`}
    aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClose={() => { if (open) onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const outside = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
      if (outside) onClose();
    }}
  >
    <div className="dialog-heading">
      <h2 id={titleId}>{title}</h2>
      <button type="button" aria-label={`关闭${title}`} onClick={onClose}>×</button>
    </div>
    {children}
  </dialog>;
}

