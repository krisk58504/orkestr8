/**
 * perf.ts — lightweight, env-gated server-side timing instrumentation.
 *
 * No-op unless PERF_INSTRUMENTATION === "1": when the flag is unset,
 * perfStart() returns 0 and perfEnd() returns immediately — negligible cost.
 * When the flag is set, perfEnd() emits one line per span to stdout, which
 * Vercel captures into Runtime Logs.
 *
 * Diagnostic only. To remove entirely: delete this file and every callsite —
 * grep "@/lib/perf".
 */
const ENABLED = process.env.PERF_INSTRUMENTATION === "1";

/** Returns a high-resolution start mark, or 0 when instrumentation is off. */
export function perfStart(): number {
  return ENABLED ? performance.now() : 0;
}

/** Emits "[perf] <tag> <span>: <ms>" for the elapsed time since `start`. */
export function perfEnd(span: string, start: number, tag?: string): void {
  if (!ENABLED) return;
  const ms = (performance.now() - start).toFixed(1);
  console.log(`[perf]${tag ? ` ${tag}` : ""} ${span}: ${ms}ms`);
}
