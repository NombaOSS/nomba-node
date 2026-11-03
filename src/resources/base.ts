import { attachErrorReference } from "../errors.js";
import type { HttpClient, RequestOptions } from "../internal/http.js";
import { encodePathSegment, isRecord, randomUUID } from "../internal/utils.js";

export interface ResourceContext {
  http: HttpClient;
  environment: "sandbox" | "production";
}

export abstract class Resource {
  protected readonly ctx: ResourceContext;

  constructor(ctx: ResourceContext) {
    this.ctx = ctx;
  }

  protected request<T>(opts: RequestOptions): Promise<T> {
    return this.ctx.http.request<T>(opts);
  }

  /** `path` + `/{subAccountId}` when a sub account is given. */
  protected withSubAccount(path: string, subAccountId: string | undefined): string {
    return subAccountId === undefined
      ? path
      : `${path}/${encodePathSegment(subAccountId, "subAccountId")}`;
  }

  /**
   * Money-moving POST with a `merchantTxRef`: generate one if missing, and return
   * it on the result so the caller can requery.
   */
  protected async withMerchantTxRef<T>(
    path: string,
    params: object
  ): Promise<T & { merchantTxRef: string }> {
    const body = { ...params } as Record<string, unknown>;
    if (typeof body.merchantTxRef !== "string" || body.merchantTxRef === "") {
      body.merchantTxRef = await randomUUID();
    }
    const ref = body.merchantTxRef as string;
    let data: unknown;
    try {
      data = await this.request<unknown>({ method: "POST", path, body });
    } catch (err) {
      // The outcome may be unknown (timeout, 5xx): the caller needs the reference to requery.
      attachErrorReference(err, { field: "merchantTxRef", value: ref });
      throw err;
    }
    return attachRef(data, "merchantTxRef", ref) as T & { merchantTxRef: string };
  }
}

export function attachRef(data: unknown, key: string, ref: string): unknown {
  if (isRecord(data)) {
    if (data[key] === undefined || data[key] === null || data[key] === "") {
      return { ...data, [key]: ref };
    }
    return data;
  }
  if (data === null || data === undefined) return { [key]: ref };
  return data;
}

export const seg = encodePathSegment;
