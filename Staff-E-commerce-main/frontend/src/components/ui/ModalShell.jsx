import { useEffect, useId } from "react";
import PanelCloseButton from "./PanelCloseButton";

const widths = { md: "max-w-2xl", lg: "max-w-3xl", xl: "max-w-4xl", "2xl": "max-w-5xl" };

/**
 * Centered dialog: fits the viewport height, scrolls only its body and keeps the
 * header and the action footer visible. Escape and the backdrop close it.
 */
export default function ModalShell({ title, subtitle, headerExtra, footer, onClose, size = "xl", children, busy = false, closeOnBackdrop = true }) {
  const titleId = useId();

  useEffect(() => {
    if (!onClose) return undefined;
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-1000 flex items-center justify-center bg-black/50 p-2 sm:p-4"
      onMouseDown={(event) => { if (closeOnBackdrop && onClose && event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy || undefined}
        className={`flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-xl bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)] ${widths[size] || widths.xl}`}>
        <header className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-gray-900">{title}</h2>
            {subtitle && <div className="mt-0.5 text-sm text-gray-500">{subtitle}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {headerExtra}
            {onClose && <PanelCloseButton onClick={onClose} label="Đóng" />}
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">{children}</div>
        {footer && <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t bg-gray-50 px-4 py-3 sm:px-5">{footer}</footer>}
      </div>
    </div>
  );
}
