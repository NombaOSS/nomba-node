import type { HttpClient, RequestOptions } from "../internal/http.js";
import { encodePathSegment, randomUUID } from "../internal/utils.js";
import type { SubAccountOption } from "../types.js";

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

  /** `path` + `/{subAccountId}` (when given) + `suffix`. */
  protected withSubAccount(
    path: string,
    subAccountId: string | undefined,
    suffix = ""
  ): string {
    const sub =
      subAccountId === undefined
        ? ""
        : `/${encodePathSegment(subAccountId, "subAccountId")}`;
    return `${path}${sub}${suffix}`;
  }

  /**
   * Money-moving POST with a `merchantTxRef`: generate one if missing. The request
   * layer returns it on the result and attaches it to any error.
   */
  protected async withMerchantTxRef<T>(
    path: string,
    params: object,
    options: SubAccountOption = {}
  ): Promise<T & { merchantTxRef: string }> {
    const body = { ...params } as Record<string, unknown>;
    if (typeof body.merchantTxRef !== "string" || body.merchantTxRef === "") {
      body.merchantTxRef = await randomUUID();
    }
    return this.request({
      method: "POST",
      path: this.withSubAccount(path, options.subAccountId),
      body,
      reference: { field: "merchantTxRef", value: body.merchantTxRef as string },
    });
  }
}

export const seg = encodePathSegment;
