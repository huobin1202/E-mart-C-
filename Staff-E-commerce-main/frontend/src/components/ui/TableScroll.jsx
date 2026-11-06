import { useLayoutEffect, useRef } from "react";

/**
 * Scroll container for management tables.
 * - `resetKey`: when it changes (page, page size, filters) the list scrolls back to the top.
 *   Pages used to put this value in a React `key`, which unmounted and rebuilt the whole table
 *   on every page/filter change and made it flash.
 * - `busy`: a refresh is running while old rows are still shown. Rows are dimmed and not clickable
 *   so the table keeps its height instead of collapsing into a "loading" row and jumping back.
 */
export default function TableScroll({ resetKey, busy = false, className = "", children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [resetKey]);
  return (
    <div ref={ref} className={`management-table-scroll ${className}`} aria-busy={busy || undefined} data-busy={busy ? "true" : undefined}>
      {children}
    </div>
  );
}
