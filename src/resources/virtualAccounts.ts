import { autoPage } from "../internal/pagination.js";
import { requireFields, validateLimit } from "../internal/utils.js";
import type {
  CreateVirtualAccountParams,
  CursorPage,
  ExpireVirtualAccountResult,
  PageOptions,
  SubAccountOption,
  UpdateVirtualAccountParams,
  UpdateVirtualAccountResult,
  VirtualAccount,
  VirtualAccountFilters,
} from "../types.js";
import { Resource, seg } from "./base.js";

export class VirtualAccounts extends Resource {
  /** Create a virtual account on the parent account or a sub account. */
  async create(
    params: CreateVirtualAccountParams,
    options: SubAccountOption = {}
  ): Promise<VirtualAccount> {
    requireFields(
      params as unknown as Record<string, unknown>,
      ["accountRef", "accountName"],
      "virtualAccounts.create"
    );
    return this.request({
      method: "POST",
      path: this.withSubAccount("/v1/accounts/virtual", options.subAccountId),
      body: params,
    });
  }

  /** Fetch a virtual account by its account reference or number. */
  async get(identifier: string): Promise<VirtualAccount> {
    return this.request({
      method: "GET",
      path: `/v1/accounts/virtual/${seg(identifier, "identifier")}`,
    });
  }

  async update(
    identifier: string,
    params: UpdateVirtualAccountParams
  ): Promise<UpdateVirtualAccountResult> {
    return this.request({
      method: "PUT",
      path: `/v1/accounts/virtual/${seg(identifier, "identifier")}`,
      body: params,
    });
  }

  /** Expire (close) a virtual account. */
  async expire(identifier: string): Promise<ExpireVirtualAccountResult> {
    return this.request({
      method: "DELETE",
      path: `/v1/accounts/virtual/${seg(identifier, "identifier")}`,
    });
  }

  /** One page of virtual accounts matching `filters`. */
  async list(
    filters: VirtualAccountFilters = {},
    options: PageOptions = {}
  ): Promise<CursorPage<VirtualAccount>> {
    validateLimit(options.limit);
    return this.request({
      method: "POST",
      path: "/v1/accounts/virtual/list",
      query: { limit: options.limit, cursor: options.cursor },
      body: filters,
    });
  }

  /** Every virtual account matching `filters`, across pages. */
  async *listAll(
    filters: VirtualAccountFilters = {},
    options: Omit<PageOptions, "cursor"> = {}
  ): AsyncGenerator<VirtualAccount> {
    validateLimit(options.limit);
    yield* autoPage((cursor) => this.list(filters, { limit: options.limit, cursor }));
  }
}
