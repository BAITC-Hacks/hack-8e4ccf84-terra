/** Calls the protected Next.js tick endpoint. All job logic remains server-side. */
const endpoint = new URL('/api/internal/jobs/tick', process.env.JOB_DISPATCHER_BASE_URL ?? 'http://localhost:3000');
const secret = process.env.JOB_TICK_SECRET;
const intervalMs = Number(process.env.JOB_DISPATCHER_INTERVAL_MS ?? 1000);
if (!secret || !Number.isFinite(intervalMs) || intervalMs < 100) {
  throw new Error('JOB_TICK_SECRET and a valid JOB_DISPATCHER_INTERVAL_MS are required');
}

let stopped = false;
process.on('SIGINT', () => { stopped = true; });
process.on('SIGTERM', () => { stopped = true; });

while (!stopped) {
  try {
    const response = await fetch(endpoint, {
      method: 'POST', headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(Math.max(intervalMs, 30_000)),
    });
    if (!response.ok) console.error(`job tick returned ${response.status}`);
  } catch (error) {
    console.error('job tick failed:', error instanceof Error ? error.message : 'unknown error');
  }
  if (!stopped) await new Promise((resolve) => setTimeout(resolve, intervalMs));
}
