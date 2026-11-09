export function resolveApiUrl(configuredUrl, location) {
  const configured = String(configuredUrl || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (location?.hostname) {
    if (location.protocol === "https:") return `${location.origin}/api`;
    const host = location.hostname.includes(":") && !location.hostname.startsWith("[") ? `[${location.hostname}]` : location.hostname;
    return `http://${host}:5099/api`;
  }
  return "http://10.0.2.2:5099/api";
}
