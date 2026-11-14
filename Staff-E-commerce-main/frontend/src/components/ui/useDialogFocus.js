import { useLayoutEffect, useRef } from "react";

export default function useDialogFocus(dialogRef, { active = true, onClose } = {}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const lastFocusRef = useRef(null);

  useLayoutEffect(() => {
    if (!active) return undefined;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const focusable = () => [...dialog.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
      .filter((element) => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
    const focusInside = () => {
      const target = lastFocusRef.current;
      if (target && dialog.contains(target) && !target.disabled) target.focus();
      else (dialog.querySelector('[data-dialog-autofocus]') || focusable()[0] || dialog).focus();
    };
    focusInside();
    const onFocus = (event) => {
      if (dialog.contains(event.target)) lastFocusRef.current = event.target;
      else focusInside();
    };
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current?.();
      } else if (event.key === "Tab") {
        const elements = focusable();
        const index = elements.indexOf(document.activeElement);
        if (!elements.length || (event.shiftKey ? index <= 0 : index === elements.length - 1 || index < 0)) {
          event.preventDefault();
          (event.shiftKey ? elements.at(-1) : elements[0] || dialog)?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocus);
      queueMicrotask(() => {
        if (previousFocus?.isConnected && !previousFocus.closest('[inert]')) previousFocus.focus();
      });
    };
  }, [active, dialogRef]);
}
