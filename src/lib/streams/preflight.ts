import { safeFetch as fetch } from "@/lib/safe-fetch";

const MIN_REAL_SIZE_BYTES = 5 * 1024 * 1024;
const PREFLIGHT_TIMEOUT_MS = 2500;

export type PreflightOk = { ok: true; sizeBytes: number | null };
export type PreflightFail = {
  ok: false;
  reason: "stub" | "unreachable" | "http-error";
  sizeBytes: number | null;
  status?: number;
};
export type PreflightResult = PreflightOk | PreflightFail;

const memo = new Map<string, PreflightResult>();
const inflight = new Map<string, Promise<PreflightResult>>();

export function readPreflightMemo(url: string): PreflightResult | null {
  return memo.get(url) ?? null;
}

export function preflightCheck(url: string, signal?: AbortSignal): Promise<PreflightResult> {
  const cached = memo.get(url);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(url);
  if (pending) return pending;
  const p = run(url, signal).then((r) => {
    inflight.delete(url);
    memo.set(url, r);
    return r;
  });
  inflight.set(url, p);
  return p;
}

const PROBE_ATTEMPTS = 3;
const PROBE_RETRY_MS = 1000;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = window.setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(t);
      resolve();
    });
  });
}

async function run(url: string, signal?: AbortSignal): Promise<PreflightResult> {
  let last: PreflightResult | null = null;
  for (let attempt = 0; attempt < PROBE_ATTEMPTS; attempt++) {
    if (signal?.aborted) break;
    const r = await probe(url, signal);
    if (r.ok) return r;
    if (r.reason === "stub" && r.sizeBytes != null && r.sizeBytes > 0) return r;
    if (r.reason === "unreachable") return r;
    last = r;
    if (attempt < PROBE_ATTEMPTS - 1) await sleep(PROBE_RETRY_MS, signal);
  }
  return { ok: false, reason: "unreachable", sizeBytes: last?.sizeBytes ?? null };
}

async function probe(url: string, signal?: AbortSignal): Promise<PreflightResult> {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  const timer = window.setTimeout(() => ctrl.abort(), PREFLIGHT_TIMEOUT_MS);
  try {
    const rangeRes = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-1" },
      redirect: "follow",
      signal: ctrl.signal,
    }).catch(() => null);
    if (!rangeRes) {
      return { ok: false, reason: "unreachable", sizeBytes: null };
    }
    if (rangeRes.status === 404 || rangeRes.status === 410) {
      return { ok: false, reason: "stub", sizeBytes: 0, status: rangeRes.status };
    }
    if (!rangeRes.ok && rangeRes.status !== 206 && rangeRes.status !== 200) {
      return { ok: false, reason: "http-error", sizeBytes: null, status: rangeRes.status };
    }
    const rangeTotal = parseRangeTotal(rangeRes.headers.get("Content-Range"));
    if (rangeTotal != null && rangeTotal > 0 && rangeTotal < MIN_REAL_SIZE_BYTES) {
      return { ok: false, reason: "stub", sizeBytes: rangeTotal };
    }
    if (rangeTotal != null && rangeTotal >= MIN_REAL_SIZE_BYTES) {
      return { ok: true, sizeBytes: rangeTotal };
    }
    const fullLen = parseLength(rangeRes.headers.get("Content-Length"));
    if (rangeRes.status === 200 && fullLen != null && fullLen < MIN_REAL_SIZE_BYTES) {
      return { ok: false, reason: "stub", sizeBytes: fullLen };
    }
    if (fullLen != null && fullLen >= MIN_REAL_SIZE_BYTES) {
      return { ok: true, sizeBytes: fullLen };
    }
    return { ok: true, sizeBytes: null };
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function parseLength(v: string | null): number | null {
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function parseRangeTotal(v: string | null): number | null {
  if (!v) return null;
  const m = v.match(/\/(\d+)\s*$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}
