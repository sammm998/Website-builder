"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import clsx from "clsx";

/** Accessible modal built on the native <dialog> element (focus trap + Escape for free). */
export function Dialog({ open, onClose, title, children, wide = false, bare = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; bare?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={clsx(
        "m-auto max-h-[92dvh] w-[calc(100vw-2rem)] overflow-hidden rounded-[1.75rem] bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/60 backdrop:backdrop-blur-sm",
        wide ? "max-w-[1400px]" : "max-w-2xl",
      )}
      aria-label={title}
    >
      <div className={clsx("flex items-center justify-between gap-4 border-b border-ink/10 px-6 py-4", bare && "hidden")}>
        <h2 className="text-lg font-medium">{title}</h2>
        <button onClick={onClose} className="rounded-full p-2 hover:bg-ink/5" aria-label="Stäng / Close"><X className="size-5" /></button>
      </div>
      <div className={clsx(!bare && "max-h-[calc(92dvh-4rem)] overflow-y-auto p-6")}>{children}</div>
    </dialog>
  );
}
