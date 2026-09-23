const sensitive =
    /password|secret|token|authorization|apikey|cookie|databaseurl/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object")
    return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          key,
          sensitive.test(key.replace(/[^a-z]/gi, ""))
              ? "[REDACTED]"
              : redact(entry),
        ]),
    );
  if (typeof value === "string") {
    let result = value.replace(
        /\b(?:sk-[A-Za-z0-9_-]+|Bearer\s+[^\s"']+|postgres(?:ql)?:\/\/[^\s"']+)/gi,
        "[REDACTED]",
    );
    for (const secret of [process.env.OPENAI_API_KEY, process.env.DATABASE_URL])
      if (secret) result = result.split(secret).join("[REDACTED]");
    return result;
  }
  return value;
}
