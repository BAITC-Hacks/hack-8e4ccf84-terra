import Link from "next/link";
import type {SafeError} from "./types";

export function ErrorPanel({error}: { error: SafeError }) {
  return (
      <section className="error-card" role="alert">
        <span className="eyebrow">EXECUTION ISSUE</span>
        <h2>{error.message}</h2>
        <p className="mono">{error.code}</p>
        <Link href="/">Start a new objective →</Link>
      </section>
  );
}
