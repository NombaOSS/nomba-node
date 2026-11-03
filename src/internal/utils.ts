import { ValidationError } from "../errors.js";

export type QueryValue = string | number | boolean | null | undefined;
export type Query = Record<string, QueryValue>;

/**
 * Validate and URL-encode one path segment. Rejects empty values, `.`/`..` and
 * anything containing `/`, so a caller-supplied ID can never reach another endpoint.
 */
export function encodePathSegment(value: unknown, name = "path parameter"): string {
  if (typeof value !== "string" && typeof value !== "number") {
    throw ValidationError.client(`${name} must be a non-empty string`);
  }
  const s = String(value);
  if (s.trim() === "") throw ValidationError.client(`${name} must not be empty`);
  if (s === "." || s === "..") throw ValidationError.client(`${name} must not be "${s}"`);
  if (s.includes("/") || s.includes("\\")) {
    throw ValidationError.client(`${name} must not contain "/" or "\\"`);
  }
  return encodeURIComponent(s);
}

/** Build `?a=1&b=true` from a record, dropping null/undefined. */
export function buildQuery(query: Query | undefined): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue;
    params.append(
      key,
      typeof value === "boolean" ? (value ? "true" : "false") : String(value)
    );
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** Throw a client-side ValidationError if any of `keys` is missing or empty. */
export function requireFields(
  obj: Record<string, unknown> | undefined,
  keys: readonly string[],
  context: string
): void {
  for (const key of keys) {
    const v = obj?.[key];
    if (v === undefined || v === null || v === "") {
      throw ValidationError.client(`${context}: "${key}" is required`);
    }
  }
}

/** Throw unless exactly one of `keys` is set. */
export function requireExactlyOne(
  obj: Record<string, unknown> | undefined,
  keys: readonly string[],
  context: string
): void {
  const set = keys.filter((k) => {
    const v = obj?.[k];
    return v !== undefined && v !== null && v !== "";
  });
  if (set.length !== 1) {
    throw ValidationError.client(
      `${context}: pass exactly one of ${keys.map((k) => `"${k}"`).join(", ")}`
    );
  }
}

export const MAX_PAGE_LIMIT = 50;

export function validateLimit(limit: unknown): void {
  if (limit === undefined || limit === null) return;
  if (
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_PAGE_LIMIT
  ) {
    throw ValidationError.client(
      `"limit" must be an integer between 1 and ${MAX_PAGE_LIMIT}`
    );
  }
}

/** Cryptographically random UUID v4, without importing node-only modules at top level. */
export async function randomUUID(): Promise<string> {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // Node 18 without the global Web Crypto object.
  const nodeCrypto = await import("node:crypto");
  return nodeCrypto.randomUUID();
}

/** Indirection so tests can skip real waits. */
export const timing = {
  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },
};

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Read an env var without assuming `process` exists (edge runtimes). */
export function readEnv(name: string): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process;
  const v = proc?.env?.[name];
  return v === undefined || v === "" ? undefined : v;
}

export function runtimeVersion(): string {
  const proc = (globalThis as { process?: { version?: string } }).process;
  return proc?.version ? `node/${proc.version}` : "runtime/unknown";
}
