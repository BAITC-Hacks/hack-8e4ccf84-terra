// Never let a query parameter turn login into an open redirect.
export function safeReturnPath(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/overview";
  try {
    const url = new URL(value, "https://terra.local");
    if (url.origin !== "https://terra.local" || !["/overview", "/forecast", "/sources", "/agent-log"].includes(url.pathname)) return "/overview";
    return url.pathname + url.search;
  } catch { return "/overview"; }
}
