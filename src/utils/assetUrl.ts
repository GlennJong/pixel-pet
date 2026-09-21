/**
 * Resolve a public-folder path (e.g. "configs/system/core.json") against the
 * app's base URL.
 *
 * Bare relative paths resolve against the *current document path*, so any URL
 * other than the server root (a sub-path, an OAuth callback route, a PiP
 * document) turns "configs/x.json" into a miss — and a dev server answers a
 * miss with index.html, which then blows up as
 * `SyntaxError: Unexpected token '<', "<!doctype "... is not valid JSON`.
 * Resolving against BASE_URL keeps the request anchored to the app root.
 */
export function assetUrl(path: string): string {
  const clean = path.replace(/^\/+/, "");
  const base = import.meta.env.BASE_URL || "/";
  if (typeof window === "undefined") return `${base}${clean}`;
  return new URL(clean, new URL(base, window.location.href)).href;
}

/**
 * fetch() + JSON parse with an explicit failure message. Guards the HTML
 * fallback case: a dev/static server that answers a missing file with
 * index.html returns 200 + text/html, which `res.json()` reports as an opaque
 * syntax error.
 */
export async function fetchJson<T = unknown>(path: string): Promise<T> {
  const url = assetUrl(path);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load ${url} (HTTP ${res.status})`);
  }
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();
  if (contentType.includes("text/html") || /^\s*</.test(text)) {
    throw new Error(`Expected JSON at ${url} but the server returned HTML — the file is missing.`);
  }
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(
      `${url} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
