/**
 * Request and response types, from the Nomba OpenAPI spec (NombaOSS/openapi v0.1.0).
 * Response types allow extra fields: Nomba adds fields without notice.
 */

/** Allows fields not (yet) described in the spec. */
export interface Extra {
  [key: string]: unknown;
}

/** Cursor-paginated list. An empty or absent `cursor` means this is the last page. */
export interface CursorPage<T> extends Extra {
  results?: T[];
  cursor?: string;
}

export interface PageOptions {
  /** Page size, 1–50. */
  limit?: number;
  /** Cursor from the previous page. */
  cursor?: string;
}

export interface DateRange {
  /** Start date, e.g. `2025-01-01T00:00:00`. */
  dateFrom?: string;
  dateTo?: string;
}

export interface SubAccountOption {
  /** Act on this sub account instead of the parent account. */
  subAccountId?: string;
}

export type TransactionStatusValue =
  | "SUCCESS"
  | "PENDING_BILLING"
  | "PROCESSING"
  | "REFUND"
  | "CANCELLED"
  | "PAYMENT_FAILED"
  | "REVERSED_BY_VENDOR";

export type TransactionSource = "api" | "pos" | "web" | "android_app" | "ios_app";

export type TransactionType =
  | "withdrawal"
  | "purchase"
  | "transfer"
  | "p2p"
  | "online_checkout"
  | "qrt_credit"
  | "qrt_debit";

/** String unions widened with `string` so new values don't break your build. */
type Open<T extends string> = T | (string & {});

// ---------------------------------------------------------------- auth

export interface RevokeTokenResult extends Extra {}

// ---------------------------------------------------------------- accounts

export interface Account extends Extra {
  createdAt: string;
  accountId: string;
  accountHolderId: string;
  accountRef: string;
  bvn: string;
  status: Open<"ACTIVE" | "INACTIVE" | "SUSPENDED" | "PND" | "BLACKLISTED">;
  type: Open<"virtual" | "outlet">;
  accountName: string;
  currency: Open<"NGN">;
  banks?: Array<{ bankAccountNumber: string; bankName: string; bankAccountName: string }>;
}

export interface Balance extends Extra {
  amount: string;
  currency: Open<"NGN">;
  timeCreated: string;
}

export interface GetBalanceParams extends SubAccountOption {}

export interface GetSubAccountParams {
  accountId?: string;
  accountRef?: string;
}

export interface Terminal extends Extra {
  terminalId: string;
  serialNumber: string;
  accountId: string;
  parentAccountId: string;
  merchantName: string;
  terminalLabel: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListTerminalsParams extends SubAccountOption, PageOptions {
  terminalId?: string;
  serialNumber?: string;
  terminalLabel?: string;
  merchantName?: string;
}

// ---------------------------------------------------------------- virtual accounts

export interface CreateVirtualAccountParams {
  /** Your unique reference for the account. */
  accountRef: string;
  accountName: string;
  bvn?: string;
  nin?: string;
  expiryDate?: string;
  expectedAmount?: number;
  restrictInflowToAccountName?: boolean;
  callbackUrl?: string;
}

export interface VirtualAccount extends Extra {
  createdAt: string;
  accountHolderId: string;
  accountRef: string;
  bvn: string;
  identifierType?: Open<"BVN" | "NIN" | "BVN_AND_NIN">;
  accountName: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  currency: Open<"NGN">;
  callbackUrl?: string;
  expired?: boolean;
  restrictInflowToAccountName?: boolean;
}

export interface UpdateVirtualAccountParams {
  newAccountRef?: string;
  accountName?: string;
  expectedAmount?: string;
}

export interface UpdateVirtualAccountResult extends Extra {
  updated: boolean;
}

export interface ExpireVirtualAccountResult extends Extra {
  expired: boolean;
}

export interface VirtualAccountFilters {
  accountName?: string;
  accountRef?: string;
  bvn?: string;
  bankAccountNumber?: string;
  dateCreatedFrom?: string;
  dateCreatedTo?: string;
  expired?: boolean;
  resourceAcquired?: boolean;
}

// ---------------------------------------------------------------- checkout

export type CheckoutCurrency = Open<"NGN" | "CDF" | "USD">;

export interface SplitRequest {
  splitType?: Open<"PERCENTAGE" | "AMOUNT">;
  splitList?: Array<{ accountId?: string; value?: number }>;
}

export interface CheckoutOrderInput {
  orderReference?: string;
  customerId?: string;
  callbackUrl: string;
  customerEmail: string;
  amount: number;
  currency: CheckoutCurrency;
  accountId?: string;
  allowedPaymentMethods?: string[];
  splitRequest?: SplitRequest;
  orderMetaData?: Record<string, unknown>;
}

export interface CreateOrderParams {
  order: CheckoutOrderInput;
  /** Save the customer's card for later charges with `chargeSavedCard`. */
  tokenizeCard?: boolean;
}

export interface CreateOrderResult extends Extra {
  checkoutLink: string;
  orderReference: string;
}

export interface CheckoutOrder extends Extra {
  orderId?: string;
  orderReference?: string;
  customerId?: string;
  accountId?: string;
  callbackUrl?: string;
  customerEmail?: string;
  amount?: number;
  currency?: string;
  businessName?: string;
  businessEmail?: string;
  businessLogo?: string;
}

export interface GetOrderResult extends Extra {
  order?: CheckoutOrder;
  hasSavedCards?: boolean;
  base64EncodedRsaPublicKey?: string;
}

export interface OrderReferenceParams {
  orderReference: string;
}

export interface SuccessMessage extends Extra {
  success: boolean;
  message: string;
}

export interface StatusMessage extends Extra {
  status?: boolean;
  message?: string;
}

export interface GetCheckoutTransactionParams {
  idType: Open<"ORDER_ID" | "ORDER_REFERENCE">;
  id: string;
}

export interface CheckoutTransaction extends Extra {
  success?: boolean;
  message?: string;
  order?: CheckoutOrder;
  transactionDetails?: Extra & {
    transactionDate?: string;
    paymentReference?: string;
    paymentVendorReference?: string;
    tokenizedCardPayment?: boolean;
    statusCode?: string;
    status?: Open<"PENDING" | "PAYMENT SUCCESSFUL" | "FAILED PAYMENT">;
  };
  transferDetails?: Extra & {
    sessionId?: string;
    beneficiaryAccountName?: string;
    beneficiaryAccountNumber?: string;
    originatorAccountName?: string;
    originatorAccountNumber?: string;
    narration?: string;
    destinationInstitutionCode?: string;
    paymentReference?: string;
  };
  cardDetails?: Extra & {
    cardPan?: string;
    cardType?: string;
    cardCurrency?: string;
    cardBank?: string;
  };
}

export interface RefundParams {
  transactionId: string;
  amount?: number;
  accountNumber?: string;
  bankCode?: string;
}

export interface ChargeSavedCardParams {
  /**
   * The order to charge. If `order.orderReference` is omitted the SDK generates one
   * (UUID v4) and returns it as `orderReference`; reuse it to requery.
   */
  order: CheckoutOrderInput;
  /** The card token from the `payment_success` webhook. */
  tokenKey: string;
}

export interface ChargeSavedCardResult extends Extra {
  status?: boolean;
  message?: string;
  orderId?: string;
  orderReference?: string;
  /** The customer's bank wants an OTP: submit it with `checkout.submitCardOtp`. */
  otpRequired?: boolean;
  transactionId?: string;
}

export interface SavedCard extends Extra {
  tokenKey?: string;
  customerEmail?: string;
  cardType?: string;
  cardPan?: string;
  tokenExpiryDate?: string;
}

export interface ListSavedCardsParams extends DateRange {
  customerEmail?: string;
  page?: number;
  limit?: number;
}

export interface SavedCardList extends Extra {
  hasNextPage?: boolean;
  nextPage?: number;
  tokenizedCardDataList?: SavedCard[];
}

export interface UpdateSavedCardEmailParams {
  tokenKey: string;
  currentEmailAddress: string;
  newEmailAddress: string;
}

export interface UpdateSavedCardEmailResult extends StatusMessage {
  tokenizedCardData?: SavedCard;
}

export interface DeleteSavedCardParams {
  tokenKey: string;
}

export interface TransferAccount extends Extra {
  accountNumber: string;
  accountName: string;
  bankName: string;
}

export interface DeviceInformation {
  httpBrowserLanguage?: string;
  httpBrowserJavaEnabled?: boolean;
  httpBrowserJavaScriptEnabled?: boolean;
  httpBrowserColorDepth?: string;
  httpBrowserScreenHeight?: string;
  httpBrowserScreenWidth?: string;
  httpBrowserTimeDifference?: string;
  userAgentBrowserValue?: string;
  deviceChannel?: string;
}

export interface SubmitCardDetailsParams {
  /** RSA-encrypted card details. */
  cardDetails?: string;
  key?: string;
  orderReference?: string;
  saveCard?: boolean;
  deviceInformation?: DeviceInformation;
}

export interface SubmitCardDetailsResult extends Extra {
  status?: boolean;
  message?: string;
  responseCode?: string;
  transactionId?: string;
  secureAuthenticationData?: Extra & {
    jwt?: string;
    md?: string;
    acsUrl?: string;
    termUrl?: string;
  };
}

export interface SubmitCardOtpParams {
  otp: string;
  orderReference: string;
  transactionId: string;
}

export interface SubmitCardOtpResult extends Extra {
  status: boolean;
  message: string;
}

export interface ConfirmTransactionReceiptResult extends Extra {
  status: boolean;
  message: string;
  order?: CheckoutOrder;
}

export interface CancelTransactionParams {
  transactionId: string;
  forceCancel: boolean;
}

export interface RequestSaveCardOtpParams {
  orderReference: string;
  phoneNumber: string;
}

export interface SubmitUserOtpParams {
  orderReference: string;
  phoneNumber: string;
  otp: string;
}

export interface GetSavedCardsParams {
  otp: string;
}

export interface UserSavedCards extends Extra {
  tokenizedCardData?: unknown;
}

// ---------------------------------------------------------------- transfers

export interface Bank extends Extra {
  code?: string;
  name?: string;
  nipCode?: string;
  logo?: string;
}

export interface LookupAccountParams {
  accountNumber: string;
  bankCode: string;
}

export interface AccountLookupResult extends Extra {
  accountNumber?: string;
  accountName?: string;
}

export interface MerchantTxRefOption {
  /**
   * Your unique reference for this transaction. If omitted the SDK generates one
   * (UUID v4) and returns it. Reuse the same value when retrying so Nomba can
   * deduplicate.
   */
  merchantTxRef?: string;
}

export interface BankTransferParams extends MerchantTxRefOption {
  amount: number;
  accountNumber: string;
  accountName: string;
  bankCode: string;
  senderName?: string;
  narration?: string;
}

export interface BankTransferResult extends Extra {
  id: string;
  amount: string;
  status: Open<TransactionStatusValue>;
  type: Open<TransactionType>;
  fee: number;
  timeCreated: string;
  source?: string;
  sourceUserId?: string;
  customerBillerId?: string;
  productId?: string;
  meta: Extra & {
    merchantTxRef?: string;
    sessionId?: string;
    narration?: string;
    recipientName?: string;
    accountNumber?: string;
    bankName?: string;
    bankCode?: string;
  };
  /** The reference sent (generated by the SDK if you did not pass one). */
  merchantTxRef: string;
}

export interface WalletTransferParams extends MerchantTxRefOption {
  amount: number;
  /** The Nomba account ID receiving the funds. */
  receiverAccountId: string;
  narration?: string;
}

export interface WalletTransferResult extends Extra {
  id: string;
  amount: number;
  status: Open<TransactionStatusValue>;
  type: Open<TransactionType>;
  fee: number;
  timeCreated: string;
  meta: Extra & {
    merchantTxRef?: string;
    api_client_id?: string;
    api_account_id?: string;
    rrn?: string;
  };
  /** The reference sent (generated by the SDK if you did not pass one). */
  merchantTxRef: string;
}

// ---------------------------------------------------------------- transactions

export interface Transaction extends Extra {
  id: string;
  status: Open<TransactionStatusValue>;
  amount: number;
  fixedCharge?: number;
  source: Open<TransactionSource>;
  type: Open<TransactionType>;
  gatewayMessage: string;
  customerBillerId?: string;
  timeCreated: string;
  posTid?: string;
  terminalId?: string;
  providerTerminalId?: string;
  rrn?: string;
  posSerialNumber?: string;
  posTerminalLabel?: string;
  stan?: string;
  paymentVendorReference?: string;
  userId?: string;
  posRrn?: string;
  merchantTxRef?: string;
}

export interface ListTransactionsParams
  extends SubAccountOption, PageOptions, DateRange {}

export interface TransactionFilters {
  transactionRef?: string;
  status?: Open<
    | "NEW"
    | "PENDING_PAYMENT"
    | "PAYMENT_SUCCESSFUL"
    | "PAYMENT_FAILED"
    | "PENDING_BILLING"
    | "SUCCESS"
    | "REFUND"
  >;
  source?: Open<TransactionSource>;
  type?: Open<TransactionType>;
  terminalId?: string;
  rrn?: string;
  merchantTxRef?: string;
  orderReference?: string;
  orderId?: string;
}

export interface GetTransactionParams extends SubAccountOption {
  transactionRef?: string;
  merchantTxRef?: string;
  orderReference?: string;
  orderId?: string;
}

export interface ListBankTransactionsParams extends PageOptions, DateRange {}

export interface BankTransaction extends Extra {
  amount: number;
  currency: Open<"NGN">;
  meta: Extra & {
    billerId?: string;
    terminalActionId?: string;
    productId?: string;
    fee?: number;
    type?: string;
    transactionId?: string;
    rrn?: string;
    parentAccountId?: string;
    terminalLabel?: string;
    accountId?: string;
    merchantTxRef?: string;
    transactionAmount?: number;
    mCollectionsId?: string;
  };
  status: Open<TransactionStatusValue>;
  timeUpdated: string;
  walletBalance: number;
  transactionType: Open<"CREDIT" | "DEBIT">;
}

// ---------------------------------------------------------------- terminals

export interface AssignTerminalParams {
  serialNumber: string;
  terminalLabel?: string;
}

export interface TerminalPaymentRequestParams {
  merchantTxRef: string;
  amount: number;
  currency: Open<"NGN" | "USD" | "CDF">;
}

export interface TerminalPaymentRequestResult extends Extra {
  paymentId: string;
  status: Open<"pending" | "completed" | "failed">;
  amount: number;
  currency: string;
  createdAt: string;
}

// ---------------------------------------------------------------- direct debits

export type MandateFrequency = Open<
  | "VARIABLE"
  | "WEEKLY"
  | "EVERY_TWO_WEEKS"
  | "MONTHLY"
  | "EVERY_TWO_MONTHS"
  | "EVERY_THREE_MONTHS"
  | "EVERY_FOUR_MONTHS"
  | "EVERY_FIVE_MONTHS"
  | "EVERY_SIX_MONTHS"
  | "EVERY_SEVEN_MONTHS"
  | "EVERY_EIGHT_MONTHS"
  | "EVERY_NINE_MONTHS"
  | "EVERY_TEN_MONTHS"
  | "EVERY_ELEVEN_MONTHS"
  | "EVERY_TWELVE_MONTHS"
>;

export interface CreateMandateParams {
  customerAccountNumber: string;
  bankCode: string;
  customerName: string;
  customerAddress?: string;
  customerAccountName: string;
  amount: number;
  frequency: MandateFrequency;
  narration?: string;
  customerPhoneNumber?: string;
  merchantReference: string;
  startDate: string;
  endDate: string;
  customerEmail: string;
  startImmediately?: boolean;
}

export interface CreateMandateResult extends Extra {
  mandateId: string;
  merchantReference: string;
  phoneNumber: string;
  description: string;
}

export interface DebitMandateParams {
  mandateId: string;
  amount: string;
}

export interface DebitMandateResult extends Extra {
  mandateId?: string;
  status?: string;
  amount?: string;
  message?: string;
}

export interface MandateStatus extends Extra {
  customerAccountName: string;
  mandateId: string;
  customerAccountNumber: string;
  mandateStatus: string;
  rejectionComment?: string;
  mandateAdviceStatus?: string;
}

export interface ListMandatesParams {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  status?: string;
}

export interface Mandate extends Extra {
  status?: string;
  customerAccountNumber?: string;
  customerAccountName?: string;
  bankCode?: string;
  amount?: number;
  customerName?: string;
  customerAddress?: string;
  customerEmail?: string;
  customerPhoneNumber?: string;
  merchantReference?: string;
  frequency?: string;
  startDate?: string;
  endDate?: string;
  mandateAdviceStatus?: string;
  mandateId?: string;
}

export interface MandateList extends Extra {
  /** The spec types this as an object; in practice it may be a list. */
  items?: Mandate | Mandate[];
  page?: number;
  pageSize?: number;
  totalItems?: number;
  totalPages?: number;
  hasMore?: boolean;
}

export interface UpdateMandateStatusParams {
  mandateId: string;
  status: Open<"SUSPEND" | "ACTIVE" | "DELETE">;
}

export interface UpdateMandateStatusResult extends Extra {
  mandateId?: string;
  mandateStatus?: string;
}

// ---------------------------------------------------------------- bills

export type Network = Open<"GLO" | "MTN" | "9MOBILE" | "AIRTEL">;

export interface BuyAirtimeParams extends MerchantTxRefOption {
  amount: number;
  phoneNumber: string;
  network: Network;
  senderName?: string;
}

export interface BuyDataParams extends MerchantTxRefOption {
  /** From `bills.listDataPlans`. */
  productId: string;
  amount?: number;
  phoneNumber: string;
  network: Network;
  senderName?: string;
}

export interface BuyElectricityParams extends MerchantTxRefOption {
  disco?: string;
  payerName?: string;
  amount?: number;
  customerId?: string;
  meterType?: string;
}

export interface PayCableTvParams extends MerchantTxRefOption {
  cableTvType?: string;
  payerName?: string;
  amount?: number;
  customerId?: string;
}

export interface FundBettingParams extends MerchantTxRefOption {
  bettingProvider?: string;
  phoneNumber?: string;
  payerName?: string;
  amount?: number;
  customerId?: string;
}

export interface BillPurchaseResult extends Extra {
  id: string;
  status: Open<TransactionStatusValue>;
  type: string;
  amount: number;
  source?: string;
  sourceUserId?: string;
  customerBillerId?: string;
  productId?: string;
  meta?: Extra;
  userId?: string;
  timeCreated: string;
  /** The reference sent (generated by the SDK if you did not pass one). */
  merchantTxRef: string;
}

export interface DataPlan extends Extra {
  amount?: number;
  productId?: string;
}

export interface LookupElectricityCustomerParams {
  disco: string;
  customerId: string;
}

export interface ElectricityCustomer extends Extra {
  name: string;
  address: string;
}

export type CableTvType = Open<"dstv" | "gotv" | "startimes" | "showmax">;

export interface CableTvPlan extends Extra {
  subScriptionType: string;
  amount: number;
}

export interface LookupCableTvCustomerParams {
  customerId: string;
  cableTvType: CableTvType;
}

export interface BettingProvider extends Extra {
  name: string;
  id: string;
}

export interface LookupBettingCustomerParams {
  providerId: string;
  customerId: string;
}

// ---------------------------------------------------------------- global payout

export interface GlobalPayoutAccount extends Extra {
  accountId?: string;
  name?: string;
  currency?: string;
  balance?: number;
  availableBalance?: number;
  status?: Open<"ACTIVE" | "UNAVAILABLE">;
  operationRegion?: string;
}

export interface ListBankProvidersParams {
  isMobileMoney?: boolean;
  countryIsoCode?: string;
}

export interface Provider extends Extra {
  code?: string;
  displayName?: string;
}

export interface GetExchangeRatesParams {
  from: string;
  to: string;
  region?: string;
}

export interface ExchangeRates extends Extra {
  rates?: Array<
    Extra & {
      exchangeRateId?: string;
      currencyPairName?: string;
      bidRate?: string;
      askRate?: string;
      midRate?: string;
      createdAt?: string;
    }
  >;
}

export interface ListPaymentMethodsParams {
  destinationCountryIsoCode?: string;
  destinationCurrency?: string;
  code?: string;
  name?: string;
}

export interface PaymentMethod extends Extra {
  code?: string;
  displayName?: string;
  purposeOfPaymentRequired?: boolean;
  purposeOfPayments?: Provider[];
  requiredFields?: string[];
  optionalFields?: string[];
  accountTypes?: string[];
  bankAccountTypes?: string[];
  supportedCorridors?: Array<Extra & { countryIsoCode?: string; currency?: string }>;
}

export interface GlobalPayoutTransaction extends Extra {
  transactionId?: string;
  status?: Open<"PROCESSING" | "COMPLETED" | "FAILED" | "PENDING">;
  coreStatus?: string;
  type?: string;
  createdAt?: string;
  idempotencyKey?: string;
}

export interface AuthorizeExchangeParams {
  amount: number;
  sourceCurrency: string;
  destinationCurrency: string;
  senderName: string;
  receiverName: string;
  sourceCountryIsoCode: string;
  destinationCountryIsoCode: string;
  narration?: string;
  lockedExchangeRateId?: string;
  /** Reuse the same key when retrying so Nomba can deduplicate. */
  idempotencyKey?: string;
}

export interface AuthorizeExchangeResult extends Extra {
  wtTransactionId?: string;
  coreTransactionId?: string;
  status?: string;
  coreStatus?: string;
  type?: string;
  idempotencyKey?: string;
  idempotentReplay?: boolean;
}

export interface ConvertMoneyParams {
  amount: number;
  currency: string;
  destinationCurrency: string;
  transactionType: string;
}

export interface ConvertMoneyResult extends Extra {
  fromAmount?: number;
  fromCurrency?: string;
  fromFormatted?: string;
  toAmount?: number;
  toCurrency?: string;
  toFormatted?: string;
  spreadAmount?: number;
  spreadCurrency?: string;
  exchangeRateId?: string;
  currencyPairName?: string;
  feeAmount?: number;
  feeCurrency?: string;
}

export interface AuthorizeTransferParams {
  amount: number;
  sourceCurrency: string;
  destinationCurrency: string;
  receiverName: string;
  sourceCountryIsoCode: string;
  destinationCountryIsoCode: string;
  paymentMethod: Open<
    "BANK" | "MobileMoney" | "INTERAC" | "FASTER_PAYMENTS" | "SEPA" | "ACH" | "WIRE"
  >;
  accountNumber?: string;
  institutionCode?: string;
  institutionName?: string;
  accountType: Open<"INDIVIDUAL" | "CORPORATE">;
  bankAccountType?: Open<"CHECKING" | "SAVINGS">;
  purposeOfPayment?: string;
  narration?: string;
  lockedExchangeRateId?: string;
  /** Reuse the same key when retrying so Nomba can deduplicate. */
  idempotencyKey?: string;
  bankAddress?: string;
  bankCity?: string;
  bankState?: string;
  bankZipCode?: string;
  beneficiary?: {
    beneficiaryEmail?: string;
    securityQuestion?: string;
    securityQuestionAnswer?: string;
    transitNumber?: string;
    beneficiaryAddress?: string;
    beneficiaryCity?: string;
    beneficiaryState?: string;
    beneficiaryPostCode?: string;
  };
}

export interface AuthorizeTransferResult extends AuthorizeExchangeResult {
  prettyStatus?: string;
  meta?: Extra;
}

// ---------------------------------------------------------------- global collection

export interface InitiateInflowParams {
  phoneNumber: string;
  callbackUrl: string;
  amount: number;
  currency: string;
  /** Provider code from `globalCollection.listDrcProviders`. */
  topupVendor: string;
  /** Reuse the same key when retrying so Nomba can deduplicate. */
  idempotencyKey?: string;
}

export interface InitiateInflowResult extends Extra {
  transactionReference?: string;
  status?: string;
  message?: string;
  idempotencyKey?: string;
}

export interface CollectionTransaction extends Extra {
  transactionId?: string;
  coreUserId?: string;
  account?: string;
  status?: Open<"PENDING" | "APPROVED" | "SUCCESS" | "FAILED" | "PENDING_APPROVAL">;
  amount?: number;
  currency?: string;
  vendor?: string;
  gatewayMessage?: string;
  gatewayCode?: string;
}

// ---------------------------------------------------------------- webhooks

export interface WebhookEvent extends Extra {
  event_type: string;
  requestId: string;
  data: Extra & {
    merchant: Extra & { userId?: string; walletId?: string; walletBalance?: number };
    transaction: Extra & {
      transactionId?: string;
      type?: string;
      time?: string;
      responseCode?: string | null;
      transactionAmount?: number;
      fee?: number;
      sessionId?: string;
      merchantTxRef?: string;
      narration?: string;
    };
    terminal?: Extra;
    customer?: Extra;
    order?: Extra;
    tokenizedCardData?: Extra;
  };
}
