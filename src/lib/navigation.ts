// Never let a query parameter turn login into an open redirect.
export function safeReturnPath(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/history";
  try {
    const url = new URL(value, "https://terra.local");
    if (url.origin !== "https://terra.local" || !["/history", "/overview", "/forecast", "/sources", "/agent-log"].includes(url.pathname)) return "/history";
    return url.pathname + url.search;
  } catch { return "/history"; }
}
