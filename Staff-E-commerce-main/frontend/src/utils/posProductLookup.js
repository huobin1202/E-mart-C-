export const POS_SUGGESTION_LIMIT = 5;
export const POS_SEARCH_DELAY = 300;

export function productSearchPath(query) {
  return `/products/search?${new URLSearchParams({ keyword: query.trim(), maxResults: String(POS_SUGGESTION_LIMIT) })}`;
}

export async function resolvePosProduct({ query, selected, request, signal }) {
  const load = async (path) => {
    signal?.throwIfAborted();
    const result = await request(path, { signal });
    signal?.throwIfAborted();
    return result;
  };
  if (selected) return { product: await load(`/products/${selected.id}`) };
  try {
    return { product: await load(`/products/barcode/${encodeURIComponent(query.trim())}`) };
  } catch (failure) {
    if (failure.status !== 404 || signal?.aborted) throw failure;
    const matches = await load(productSearchPath(query));
    if (matches.length === 1) return { product: await load(`/products/${matches[0].id}`) };
    return { matches: matches.slice(0, POS_SUGGESTION_LIMIT) };
  }
}

export function canAddPosProduct(product, cart = []) {
  const inCart = cart.filter((item) => item.id === product.id).reduce((sum, item) => sum + item.quantity, 0);
  return product.isActive !== false && (product.inventory?.quantity ?? 0) > inCart;
}

export function nextSuggestionIndex(products, cart, current, direction) {
  const available = products.map((product, index) => canAddPosProduct(product, cart) ? index : -1).filter((index) => index >= 0);
  if (!available.length) return -1;
  const position = available.indexOf(current);
  if (position < 0) return direction > 0 ? available[0] : available[available.length - 1];
  return available[(position + direction + available.length) % available.length];
}
