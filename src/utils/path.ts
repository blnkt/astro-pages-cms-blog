/** Prefix an absolute site path with Astro's `base` (needed for GitHub project Pages). */
export function withBase(path = "/"): string {
  const rawBase = import.meta.env.BASE_URL || "/";
  if (rawBase === "/") {
    return path.startsWith("/") ? path : `/${path}`;
  }

  const base = rawBase.replace(/\/+$/, "");
  if (path === "/" || path === "") return `${base}/`;
  return `${base}/${path.replace(/^\//, "")}`;
}
