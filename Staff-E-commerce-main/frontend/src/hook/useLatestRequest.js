import { useCallback, useEffect, useRef } from "react";

/**
 * Runs async requests where only the newest one may update the screen.
 * Starting a request aborts the previous one; a superseded request resolves to `{ stale: true }`
 * so an older, slower response can never overwrite the data of a newer filter selection.
 *
 *   const run = useLatestRequest();
 *   const { result, error, stale } = await run((signal) => api(filters, { signal }));
 */
export function useLatestRequest() {
  const current = useRef(null);
  useEffect(() => () => current.current?.abort(), []);
  return useCallback(async (fn) => {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    try {
      const result = await fn(controller.signal);
      return controller.signal.aborted || current.current !== controller ? { stale: true } : { result };
    } catch (error) {
      if (controller.signal.aborted || current.current !== controller) return { stale: true };
      return { error };
    }
  }, []);
}
