import { resolveApiUrl } from "../utils/apiConfig";

export const API_URL = resolveApiUrl(
  process.env.EXPO_PUBLIC_API_URL,
  typeof window !== "undefined" ? window.location : undefined,
);
export const API_ORIGIN = API_URL.replace(/\/api$/, "");
