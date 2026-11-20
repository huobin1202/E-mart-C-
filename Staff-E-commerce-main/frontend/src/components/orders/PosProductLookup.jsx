import { useEffect, useRef, useState } from "react";
import { request } from "../../api/apiClient";
import PosProductPrice from "./PosProductPrice";
import { canAddPosProduct, nextSuggestionIndex, POS_SEARCH_DELAY, POS_SUGGESTION_LIMIT, productSearchPath, resolvePosProduct } from "../../utils/posProductLookup";

export default function PosProductLookup({ cart, disabled, onSelect }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState({ query: "", items: [], loading: false, error: "" });
  const [activeIndex, setActiveIndex] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const actionRequest = useRef(null);
  const searchRequest = useRef(null);
  const latest = useRef({ onSelect, disabled, cart });
  latest.current = { onSelect, disabled, cart };

  const items = results.query === query.trim() ? results.items : [];
  const showSuggestions = open && !!query.trim() && !disabled && !busy;

  useEffect(() => {
    if (!disabled) {
      const timer = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
  }, [disabled]);

  useEffect(() => {
    if (!open || !query.trim() || disabled || busy) return;
    const controller = new AbortController();
    searchRequest.current = controller;
    const value = query.trim();
    const timer = setTimeout(async () => {
      setResults({ query: value, items: [], loading: true, error: "" });
      try {
        const data = await request(productSearchPath(value), { signal: controller.signal });
        if (!controller.signal.aborted) setResults({ query: value, items: data.slice(0, POS_SUGGESTION_LIMIT), loading: false, error: "" });
      } catch {
        if (!controller.signal.aborted) setResults({ query: value, items: [], loading: false, error: "Không tải được gợi ý. Nhấn Enter để thử tìm lại." });
      }
    }, POS_SEARCH_DELAY);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, open, disabled, busy]);

  useEffect(() => {
    if (disabled) actionRequest.current?.abort();
    return () => actionRequest.current?.abort();
  }, [disabled]);

  const selectProduct = async (selected = null) => {
    if (actionRequest.current || latest.current.disabled || !query.trim()) return;
    const controller = new AbortController();
    actionRequest.current = controller;
    searchRequest.current?.abort();
    setBusy(true);
    setOpen(false);
    setError("");
    try {
      const { product, matches } = await resolvePosProduct({ query, selected, request, signal: controller.signal });
      if (controller.signal.aborted || latest.current.disabled) return;
      if (matches) {
        setResults({ query: query.trim(), items: matches, loading: false, error: "" });
        setActiveIndex(-1);
        setOpen(true);
        setError(matches.length ? "Chọn sản phẩm trong danh sách gợi ý." : "Không tìm thấy sản phẩm phù hợp.");
        return;
      }
      if (!canAddPosProduct(product, latest.current.cart)) {
        setError("Sản phẩm hết hàng, ngừng bán hoặc đã đạt số lượng tồn kho.");
        return;
      }
      if (latest.current.onSelect(product) !== false) {
        setQuery("");
        setResults({ query: "", items: [], loading: false, error: "" });
        setActiveIndex(-1);
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.status === 404 ? "Sản phẩm không còn tồn tại. Vui lòng tìm lại." : "Không thể tải sản phẩm. Vui lòng thử lại.");
    } finally {
      if (actionRequest.current === controller) {
        actionRequest.current = null;
        setBusy(false);
        if (!latest.current.disabled) requestAnimationFrame(() => inputRef.current?.focus());
      }
    }
  };

  const handleKeyDown = (event) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") { setOpen(false); setActiveIndex(-1); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => nextSuggestionIndex(items, cart, current, event.key === "ArrowDown" ? 1 : -1));
    }
    if (event.key === "Enter") {
      event.preventDefault();
      void selectProduct(showSuggestions && activeIndex >= 0 ? items[activeIndex] : null);
    }
  };

  return <div onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setActiveIndex(-1); }
  }}>
    <div className="relative">
      <input ref={inputRef} type="text" role="combobox" aria-label="Tìm sản phẩm bằng tên, mã sản phẩm hoặc mã vạch"
        aria-autocomplete="list" aria-expanded={showSuggestions} aria-controls="pos-product-suggestions"
        aria-activedescendant={showSuggestions && activeIndex >= 0 ? `pos-product-option-${activeIndex}` : undefined}
        autoComplete="off" value={query} disabled={disabled || busy}
        onFocus={() => { if (query.trim()) setOpen(true); }}
        onChange={(event) => {
          searchRequest.current?.abort();
          setQuery(event.target.value);
          setResults({ query: event.target.value.trim(), items: [], loading: !!event.target.value.trim(), error: "" });
          setOpen(true);
          setActiveIndex(-1);
          setError("");
        }} onKeyDown={handleKeyDown}
        placeholder="Nhập tên, mã sản phẩm hoặc quét mã vạch…"
        className="w-full rounded-xl bg-white py-3 pl-11 pr-28 text-sm font-semibold text-gray-900 shadow-inner focus:outline-none focus:ring-4 focus:ring-emerald-300" />
      <span aria-hidden="true" className="absolute left-3.5 top-3.5 text-base text-gray-400">🔍</span>
      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => void selectProduct(showSuggestions && activeIndex >= 0 ? items[activeIndex] : null)}
        disabled={disabled || busy || !query.trim()}
        className="absolute right-2 top-2 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50">
        {busy ? "Đang thêm…" : "Thêm vào giỏ"}
      </button>
      {showSuggestions && <div id="pos-product-suggestions" role="listbox" aria-label="Sản phẩm gợi ý"
        className="absolute inset-x-0 top-full z-30 mt-2 max-h-96 overflow-y-auto rounded-xl border bg-white text-gray-900 shadow-xl">
        {results.query !== query.trim() || results.loading ? <p role="status" className="p-3 text-sm text-gray-500">Đang tìm sản phẩm…</p>
          : results.error ? <p role="status" className="p-3 text-sm text-red-600">{results.error}</p>
            : items.length === 0 ? <p role="status" className="p-3 text-sm text-gray-500">Không tìm thấy sản phẩm phù hợp.</p>
              : items.map((product, index) => {
                const available = canAddPosProduct(product, cart);
                return <button type="button" role="option" id={`pos-product-option-${index}`} key={product.id}
                  aria-selected={activeIndex === index} disabled={!available}
                  onMouseDown={(event) => event.preventDefault()} onClick={() => void selectProduct(product)}
                  className={`flex w-full items-center justify-between gap-3 border-b p-3 text-left last:border-b-0 disabled:cursor-not-allowed disabled:opacity-50 ${activeIndex === index ? "bg-emerald-50" : "enabled:hover:bg-gray-50"}`}>
                  <span className="min-w-0"><span className="block break-words text-sm font-semibold">{product.productName}</span>
                    <span className="mt-1 block text-xs text-gray-500">{product.barcode || product.sku || "Chưa có mã"} · {product.isActive === false ? "Ngừng bán" : `Còn: ${product.inventory?.quantity ?? 0}`}{!available && product.isActive !== false ? " · Không thể thêm" : ""}</span></span>
                  <span className="shrink-0 text-right text-sm"><PosProductPrice product={product} /></span>
                </button>;
              })}
      </div>}
    </div>
    {error && <p role="alert" className="mt-2 text-sm font-medium text-white">{error}</p>}
  </div>;
}
