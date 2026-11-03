import { describe, expect, it } from "vitest";
import { type Nomba, ValidationError } from "../src/index.js";
import { client, FAKE, MockApi, ok } from "./helpers.js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

interface Case {
  name: string;
  call: (n: Nomba) => Promise<unknown>;
  method: string;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  production?: boolean;
}

const transfer = {
  amount: 1000,
  accountNumber: "0123456789",
  accountName: "JOHN DOE",
  bankCode: "058",
  merchantTxRef: "ref-1",
};
const order = {
  callbackUrl: "https://example.com/cb",
  customerEmail: "a@example.com",
  amount: 500,
  currency: "NGN" as const,
};

const cases: Case[] = [
  // accounts
  {
    name: "accounts.getParent",
    call: (n) => n.accounts.getParent(),
    method: "GET",
    path: "/v1/accounts/parent",
  },
  {
    name: "accounts.getBalance",
    call: (n) => n.accounts.getBalance(),
    method: "GET",
    path: "/v1/accounts/balance",
  },
  {
    name: "accounts.getBalance (sub)",
    call: (n) => n.accounts.getBalance({ subAccountId: "sub 1" }),
    method: "GET",
    path: "/v1/accounts/sub%201/balance",
  },
  {
    name: "accounts.getSubAccount",
    call: (n) => n.accounts.getSubAccount({ accountRef: "ref" }),
    method: "GET",
    path: "/v1/accounts/sub-account-details",
    query: { accountRef: "ref" },
  },
  {
    name: "accounts.listTerminals",
    call: (n) => n.accounts.listTerminals({ limit: 10, serialNumber: "SN1" }),
    method: "GET",
    path: "/v1/accounts/terminals",
    query: { limit: "10", serialNumber: "SN1" },
  },
  {
    name: "accounts.listTerminals (sub)",
    call: (n) => n.accounts.listTerminals({ subAccountId: "s1", cursor: "c" }),
    method: "GET",
    path: "/v1/accounts/s1/terminals",
    query: { cursor: "c" },
  },
  // virtual accounts
  {
    name: "virtualAccounts.create",
    call: (n) => n.virtualAccounts.create({ accountRef: "r", accountName: "N" }),
    method: "POST",
    path: "/v1/accounts/virtual",
    body: { accountRef: "r", accountName: "N" },
  },
  {
    name: "virtualAccounts.create (sub)",
    call: (n) =>
      n.virtualAccounts.create(
        { accountRef: "r", accountName: "N" },
        { subAccountId: "s1" }
      ),
    method: "POST",
    path: "/v1/accounts/virtual/s1",
    body: { accountRef: "r", accountName: "N" },
  },
  {
    name: "virtualAccounts.get",
    call: (n) => n.virtualAccounts.get("acc?1"),
    method: "GET",
    path: "/v1/accounts/virtual/acc%3F1",
  },
  {
    name: "virtualAccounts.update",
    call: (n) => n.virtualAccounts.update("r", { accountName: "M" }),
    method: "PUT",
    path: "/v1/accounts/virtual/r",
    body: { accountName: "M" },
  },
  {
    name: "virtualAccounts.expire",
    call: (n) => n.virtualAccounts.expire("r"),
    method: "DELETE",
    path: "/v1/accounts/virtual/r",
  },
  {
    name: "virtualAccounts.list",
    call: (n) => n.virtualAccounts.list({ expired: false }, { limit: 5 }),
    method: "POST",
    path: "/v1/accounts/virtual/list",
    query: { limit: "5" },
    body: { expired: false },
  },
  // checkout
  {
    name: "checkout.createOrder",
    call: (n) => n.checkout.createOrder({ order, tokenizeCard: true }),
    method: "POST",
    path: "/v1/checkout/order",
    body: { order, tokenizeCard: true },
  },
  {
    name: "checkout.getOrder",
    call: (n) => n.checkout.getOrder("ord-1"),
    method: "GET",
    path: "/v1/checkout/order/ord-1",
  },
  {
    name: "checkout.cancelOrder",
    call: (n) => n.checkout.cancelOrder({ orderReference: "o" }),
    method: "POST",
    path: "/v1/checkout/order/cancel",
    body: { orderReference: "o" },
  },
  {
    name: "checkout.getTransaction",
    call: (n) => n.checkout.getTransaction({ idType: "ORDER_REFERENCE", id: "o" }),
    method: "GET",
    path: "/v1/checkout/transaction",
    query: { idType: "ORDER_REFERENCE", id: "o" },
  },
  {
    name: "checkout.refund",
    call: (n) => n.checkout.refund({ transactionId: "t", amount: 10 }),
    method: "POST",
    path: "/v1/checkout/refund",
    body: { transactionId: "t", amount: 10 },
  },
  {
    name: "checkout.chargeSavedCard",
    call: (n) =>
      n.checkout.chargeSavedCard({
        order: { ...order, orderReference: "o1" },
        tokenKey: "tok",
      }),
    method: "POST",
    path: "/v1/checkout/tokenized-card-payment",
    body: { order: { ...order, orderReference: "o1" }, tokenKey: "tok" },
  },
  {
    name: "checkout.listSavedCards",
    call: (n) => n.checkout.listSavedCards({ customerEmail: "a@example.com", page: 2 }),
    method: "GET",
    path: "/v1/checkout/tokenized-card-data",
    query: { customerEmail: "a@example.com", page: "2" },
  },
  {
    name: "checkout.updateSavedCardEmail",
    call: (n) =>
      n.checkout.updateSavedCardEmail({
        tokenKey: "k",
        currentEmailAddress: "a@x.com",
        newEmailAddress: "b@x.com",
      }),
    method: "POST",
    path: "/v1/checkout/tokenized-card-data",
    body: { tokenKey: "k", currentEmailAddress: "a@x.com", newEmailAddress: "b@x.com" },
  },
  {
    name: "checkout.deleteSavedCard",
    call: (n) => n.checkout.deleteSavedCard({ tokenKey: "k" }),
    method: "DELETE",
    path: "/v1/checkout/tokenized-card-data",
    body: { tokenKey: "k" },
  },
  {
    name: "checkout.getTransferAccount",
    call: (n) => n.checkout.getTransferAccount("o"),
    method: "GET",
    path: "/v1/checkout/get-checkout-kta/o",
  },
  {
    name: "checkout.submitCardDetails",
    call: (n) =>
      n.checkout.submitCardDetails({
        cardDetails: "enc",
        key: "k",
        orderReference: "o",
        saveCard: false,
      }),
    method: "POST",
    path: "/v1/checkout/checkout-card-detail",
    body: { cardDetails: "enc", key: "k", orderReference: "o", saveCard: false },
  },
  {
    name: "checkout.submitCardOtp",
    call: (n) =>
      n.checkout.submitCardOtp({ otp: "1234", orderReference: "o", transactionId: "t" }),
    method: "POST",
    path: "/v1/checkout/checkout-card-otp",
    body: { otp: "1234", orderReference: "o", transactionId: "t" },
  },
  {
    name: "checkout.resendOtp",
    call: (n) => n.checkout.resendOtp({ orderReference: "o" }),
    method: "POST",
    path: "/v1/checkout/resend-otp",
    body: { orderReference: "o" },
  },
  {
    name: "checkout.confirmTransactionReceipt",
    call: (n) => n.checkout.confirmTransactionReceipt({ orderReference: "o" }),
    method: "POST",
    path: "/v1/checkout/confirm-transaction-receipt",
    body: { orderReference: "o" },
  },
  {
    name: "checkout.cancelTransaction",
    call: (n) => n.checkout.cancelTransaction({ transactionId: "t", forceCancel: false }),
    method: "POST",
    path: "/v1/checkout/transaction/cancel",
    body: { transactionId: "t", forceCancel: false },
  },
  {
    name: "checkout.requestSaveCardOtp",
    call: (n) =>
      n.checkout.requestSaveCardOtp({ orderReference: "o", phoneNumber: "080" }),
    method: "POST",
    path: "/v1/checkout/user-card/auth",
    body: { orderReference: "o", phoneNumber: "080" },
  },
  {
    name: "checkout.requestSavedCardsOtp",
    call: (n) => n.checkout.requestSavedCardsOtp({ orderReference: "o" }),
    method: "POST",
    path: "/v1/checkout/user-card/saved-card/auth",
    body: { orderReference: "o" },
  },
  {
    name: "checkout.submitUserOtp",
    call: (n) =>
      n.checkout.submitUserOtp({ orderReference: "o", phoneNumber: "080", otp: "1" }),
    method: "POST",
    path: "/v1/checkout/user-card",
    body: { orderReference: "o", phoneNumber: "080", otp: "1" },
  },
  {
    name: "checkout.getSavedCards",
    call: (n) => n.checkout.getSavedCards("o", { otp: "123" }),
    method: "GET",
    path: "/v1/checkout/user-card/o",
    query: { otp: "123" },
  },
  // transfers
  {
    name: "transfers.listBanks",
    call: (n) => n.transfers.listBanks(),
    method: "GET",
    path: "/v1/transfers/banks",
  },
  {
    name: "transfers.lookupAccount",
    call: (n) =>
      n.transfers.lookupAccount({ accountNumber: "0123456789", bankCode: "058" }),
    method: "POST",
    path: "/v1/transfers/bank/lookup",
    body: { accountNumber: "0123456789", bankCode: "058" },
  },
  {
    name: "transfers.toBank",
    call: (n) => n.transfers.toBank(transfer),
    method: "POST",
    path: "/v2/transfers/bank",
    body: transfer,
  },
  {
    name: "transfers.toBank (sub)",
    call: (n) => n.transfers.toBank(transfer, { subAccountId: "s1" }),
    method: "POST",
    path: "/v2/transfers/bank/s1",
    body: transfer,
  },
  {
    name: "transfers.toWallet",
    call: (n) =>
      n.transfers.toWallet({ amount: 5, receiverAccountId: "acc", merchantTxRef: "w1" }),
    method: "POST",
    path: "/v2/transfers/wallet",
    body: { amount: 5, receiverAccountId: "acc", merchantTxRef: "w1" },
  },
  {
    name: "transfers.toWallet (sub)",
    call: (n) =>
      n.transfers.toWallet(
        { amount: 5, receiverAccountId: "acc", merchantTxRef: "w1" },
        { subAccountId: "s1" }
      ),
    method: "POST",
    path: "/v2/transfers/wallet/s1",
    body: { amount: 5, receiverAccountId: "acc", merchantTxRef: "w1" },
  },
  // transactions
  {
    name: "transactions.list",
    call: (n) => n.transactions.list({ limit: 50, dateFrom: "2025-01-01" }),
    method: "GET",
    path: "/v1/transactions/accounts",
    query: { limit: "50", dateFrom: "2025-01-01" },
  },
  {
    name: "transactions.list (sub)",
    call: (n) => n.transactions.list({ subAccountId: "s1" }),
    method: "GET",
    path: "/v1/transactions/accounts/s1",
  },
  {
    name: "transactions.filter",
    call: (n) => n.transactions.filter({ status: "SUCCESS" }, { limit: 2 }),
    method: "POST",
    path: "/v1/transactions/accounts",
    query: { limit: "2" },
    body: { status: "SUCCESS" },
  },
  {
    name: "transactions.filter (sub)",
    call: (n) => n.transactions.filter({ rrn: "1" }, { subAccountId: "s1" }),
    method: "POST",
    path: "/v1/transactions/accounts/s1",
    body: { rrn: "1" },
  },
  {
    name: "transactions.get",
    call: (n) => n.transactions.get({ merchantTxRef: "m1" }),
    method: "GET",
    path: "/v1/transactions/accounts/single",
    query: { merchantTxRef: "m1" },
  },
  {
    name: "transactions.get (sub)",
    call: (n) => n.transactions.get({ orderId: "o", subAccountId: "s1" }),
    method: "GET",
    path: "/v1/transactions/accounts/s1/single",
    query: { orderId: "o" },
  },
  {
    name: "transactions.listBankTransactions",
    call: (n) => n.transactions.listBankTransactions({ dateTo: "2025-02-01" }),
    method: "GET",
    path: "/v1/transactions/bank",
    query: { dateTo: "2025-02-01" },
  },
  {
    name: "transactions.requery",
    call: (n) => n.transactions.requery("100004250929"),
    method: "GET",
    path: "/v1/transactions/requery/100004250929",
  },
  // terminals
  {
    name: "terminals.assign",
    call: (n) => n.terminals.assign({ serialNumber: "SN" }),
    method: "POST",
    path: "/v1/terminals/assign",
    body: { serialNumber: "SN" },
  },
  {
    name: "terminals.assign (sub)",
    call: (n) =>
      n.terminals.assign(
        { serialNumber: "SN", terminalLabel: "L" },
        { subAccountId: "s1" }
      ),
    method: "POST",
    path: "/v1/terminals/assign/s1",
    body: { serialNumber: "SN", terminalLabel: "L" },
  },
  {
    name: "terminals.unassign",
    call: (n) => n.terminals.unassign({ serialNumber: "SN" }),
    method: "POST",
    path: "/v1/terminals/unassign",
    body: { serialNumber: "SN" },
  },
  {
    name: "terminals.unassign (sub)",
    call: (n) => n.terminals.unassign({ serialNumber: "SN" }, { subAccountId: "s1" }),
    method: "POST",
    path: "/v1/terminals/unassign/s1",
    body: { serialNumber: "SN" },
  },
  {
    name: "terminals.sendPaymentRequest",
    call: (n) =>
      n.terminals.sendPaymentRequest("T1", {
        merchantTxRef: "m",
        amount: 100,
        currency: "NGN",
      }),
    method: "POST",
    path: "/v1/terminals/payment-request/T1",
    body: { merchantTxRef: "m", amount: 100, currency: "NGN" },
  },
  // direct debits
  {
    name: "directDebits.createMandate",
    call: (n) =>
      n.directDebits.createMandate({
        customerAccountNumber: "1",
        bankCode: "058",
        customerName: "J",
        customerAccountName: "J",
        amount: 100,
        frequency: "MONTHLY",
        merchantReference: "mr",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        customerEmail: "j@x.com",
      }),
    method: "POST",
    path: "/v1/direct-debits",
    body: {
      customerAccountNumber: "1",
      bankCode: "058",
      customerName: "J",
      customerAccountName: "J",
      amount: 100,
      frequency: "MONTHLY",
      merchantReference: "mr",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      customerEmail: "j@x.com",
    },
  },
  {
    name: "directDebits.debitMandate",
    call: (n) => n.directDebits.debitMandate({ mandateId: "m", amount: "100" }),
    method: "POST",
    path: "/v1/direct-debits/debit-mandate",
    body: { mandateId: "m", amount: "100" },
  },
  {
    name: "directDebits.getMandateStatus",
    call: (n) => n.directDebits.getMandateStatus("m1"),
    method: "GET",
    path: "/v1/direct-debits/status",
    query: { mandateId: "m1" },
  },
  {
    name: "directDebits.listMandates",
    call: (n) => n.directDebits.listMandates({ page: 1, pageSize: 20, status: "ACTIVE" }),
    method: "GET",
    path: "/v1/direct-debits/mandates",
    query: { page: "1", pageSize: "20", status: "ACTIVE" },
  },
  {
    name: "directDebits.updateMandateStatus",
    call: (n) =>
      n.directDebits.updateMandateStatus({ mandateId: "m", status: "SUSPEND" }),
    method: "PUT",
    path: "/v1/direct-debits/update-status",
    body: { mandateId: "m", status: "SUSPEND" },
  },
  // bills
  {
    name: "bills.buyAirtime",
    call: (n) =>
      n.bills.buyAirtime({
        amount: 100,
        phoneNumber: "080",
        network: "MTN",
        merchantTxRef: "b1",
      }),
    method: "POST",
    path: "/v2/bill/topup",
    body: { amount: 100, phoneNumber: "080", network: "MTN", merchantTxRef: "b1" },
  },
  {
    name: "bills.buyAirtime (sub)",
    call: (n) =>
      n.bills.buyAirtime(
        { amount: 100, phoneNumber: "080", network: "MTN", merchantTxRef: "b1" },
        { subAccountId: "s1" }
      ),
    method: "POST",
    path: "/v2/bill/topup/s1",
    body: { amount: 100, phoneNumber: "080", network: "MTN", merchantTxRef: "b1" },
  },
  {
    name: "bills.buyData",
    call: (n) =>
      n.bills.buyData({
        productId: "p",
        phoneNumber: "080",
        network: "GLO",
        merchantTxRef: "b2",
      }),
    method: "POST",
    path: "/v2/bill/data",
    body: { productId: "p", phoneNumber: "080", network: "GLO", merchantTxRef: "b2" },
  },
  {
    name: "bills.buyData (sub)",
    call: (n) =>
      n.bills.buyData(
        { productId: "p", phoneNumber: "080", network: "GLO", merchantTxRef: "b2" },
        { subAccountId: "s1" }
      ),
    method: "POST",
    path: "/v2/bill/data/s1",
    body: { productId: "p", phoneNumber: "080", network: "GLO", merchantTxRef: "b2" },
  },
  {
    name: "bills.listDataPlans",
    call: (n) => n.bills.listDataPlans("MTN"),
    method: "GET",
    path: "/v1/bill/data-plan/mtn",
  },
  {
    name: "bills.buyElectricity",
    call: (n) =>
      n.bills.buyElectricity({
        disco: "IKEDC",
        customerId: "c",
        amount: 1000,
        meterType: "PREPAID",
        merchantTxRef: "e1",
      }),
    method: "POST",
    path: "/v2/bill/electricity",
    body: {
      disco: "IKEDC",
      customerId: "c",
      amount: 1000,
      meterType: "PREPAID",
      merchantTxRef: "e1",
    },
  },
  {
    name: "bills.buyElectricity (sub)",
    call: (n) => n.bills.buyElectricity({ merchantTxRef: "e1" }, { subAccountId: "s1" }),
    method: "POST",
    path: "/v2/bill/electricity/s1",
    body: { merchantTxRef: "e1" },
  },
  {
    name: "bills.listElectricityProviders",
    call: (n) => n.bills.listElectricityProviders(),
    method: "GET",
    path: "/v1/bill/electricity/discos",
  },
  {
    name: "bills.lookupElectricityCustomer",
    call: (n) => n.bills.lookupElectricityCustomer({ disco: "IKEDC", customerId: "c" }),
    method: "GET",
    path: "/v2/bill/electricity/lookup",
    query: { disco: "IKEDC", customerId: "c" },
  },
  {
    name: "bills.payCableTv",
    call: (n) =>
      n.bills.payCableTv({
        cableTvType: "dstv",
        customerId: "c",
        amount: 1,
        merchantTxRef: "c1",
      }),
    method: "POST",
    path: "/v2/bill/cabletv",
    body: { cableTvType: "dstv", customerId: "c", amount: 1, merchantTxRef: "c1" },
  },
  {
    name: "bills.payCableTv (sub)",
    call: (n) => n.bills.payCableTv({ merchantTxRef: "c1" }, { subAccountId: "s1" }),
    method: "POST",
    path: "/v2/bill/cabletv/s1",
    body: { merchantTxRef: "c1" },
  },
  {
    name: "bills.listCableTvPlans",
    call: (n) => n.bills.listCableTvPlans("gotv"),
    method: "GET",
    path: "/v1/bill/cableTvProduct",
    query: { cableTvType: "gotv" },
  },
  {
    name: "bills.lookupCableTvCustomer",
    call: (n) => n.bills.lookupCableTvCustomer({ customerId: "c", cableTvType: "dstv" }),
    method: "GET",
    path: "/v1/bill/cabletv/lookup",
    query: { customerId: "c", cableTvType: "dstv" },
  },
  {
    name: "bills.fundBetting",
    call: (n) =>
      n.bills.fundBetting({
        bettingProvider: "bet9ja",
        customerId: "c",
        amount: 1,
        merchantTxRef: "f1",
      }),
    method: "POST",
    path: "/v2/bill/betting",
    body: { bettingProvider: "bet9ja", customerId: "c", amount: 1, merchantTxRef: "f1" },
  },
  {
    name: "bills.fundBetting (sub)",
    call: (n) => n.bills.fundBetting({ merchantTxRef: "f1" }, { subAccountId: "s1" }),
    method: "POST",
    path: "/v2/bill/betting/s1",
    body: { merchantTxRef: "f1" },
  },
  {
    name: "bills.listBettingProviders",
    call: (n) => n.bills.listBettingProviders(),
    method: "GET",
    path: "/v1/bill/betting/providers",
  },
  {
    name: "bills.lookupBettingCustomer",
    call: (n) => n.bills.lookupBettingCustomer({ providerId: "p", customerId: "c" }),
    method: "GET",
    path: "/v1/bill/betting/lookup",
    query: { providerId: "p", customerId: "c" },
  },
  // global payout
  {
    name: "globalPayout.listAccounts (sandbox)",
    call: (n) => n.globalPayout.listAccounts(),
    method: "GET",
    path: "/v1/sandbox/global-payout/accounts",
  },
  {
    name: "globalPayout.getAccount (sandbox)",
    call: (n) => n.globalPayout.getAccount("ga1"),
    method: "GET",
    path: "/v1/sandbox/global-payout/accounts/ga1",
  },
  {
    name: "globalPayout.listAccounts (production)",
    call: (n) => n.globalPayout.listAccounts(),
    method: "GET",
    path: "/v1/global-payout/accounts",
    production: true,
  },
  {
    name: "globalPayout.getAccount (production)",
    call: (n) => n.globalPayout.getAccount("ga1"),
    method: "GET",
    path: "/v1/global-payout/accounts/ga1",
    production: true,
  },
  {
    name: "globalPayout.listBankProviders",
    call: (n) =>
      n.globalPayout.listBankProviders({ isMobileMoney: true, countryIsoCode: "CD" }),
    method: "GET",
    path: "/v1/global-payout/bank/providers",
    query: { isMobileMoney: "true", countryIsoCode: "CD" },
  },
  {
    name: "globalPayout.getExchangeRates",
    call: (n) => n.globalPayout.getExchangeRates({ from: "NGN", to: "USD" }),
    method: "GET",
    path: "/v1/global-payout/exchange-rates",
    query: { from: "NGN", to: "USD" },
  },
  {
    name: "globalPayout.listPaymentMethods",
    call: (n) => n.globalPayout.listPaymentMethods({ destinationCurrency: "CAD" }),
    method: "GET",
    path: "/v1/global-payout/payment-methods",
    query: { destinationCurrency: "CAD" },
  },
  {
    name: "globalPayout.getTransaction",
    call: (n) => n.globalPayout.getTransaction("gt1"),
    method: "GET",
    path: "/v1/global-payout/transactions/gt1",
  },
  {
    name: "globalPayout.authorizeExchange",
    call: (n) =>
      n.globalPayout.authorizeExchange({
        amount: 1,
        sourceCurrency: "NGN",
        destinationCurrency: "USD",
        senderName: "A",
        receiverName: "B",
        sourceCountryIsoCode: "NG",
        destinationCountryIsoCode: "US",
        idempotencyKey: "k",
      }),
    method: "POST",
    path: "/v1/global-payout/exchange/authorize",
    body: {
      amount: 1,
      sourceCurrency: "NGN",
      destinationCurrency: "USD",
      senderName: "A",
      receiverName: "B",
      sourceCountryIsoCode: "NG",
      destinationCountryIsoCode: "US",
      idempotencyKey: "k",
    },
  },
  {
    name: "globalPayout.convertMoney",
    call: (n) =>
      n.globalPayout.convertMoney({
        amount: 1,
        currency: "NGN",
        destinationCurrency: "USD",
        transactionType: "BUY",
      }),
    method: "POST",
    path: "/v1/global-payout/money/convert",
    body: {
      amount: 1,
      currency: "NGN",
      destinationCurrency: "USD",
      transactionType: "BUY",
    },
  },
  {
    name: "globalPayout.authorizeTransfer",
    call: (n) =>
      n.globalPayout.authorizeTransfer({
        amount: 1,
        sourceCurrency: "NGN",
        destinationCurrency: "CAD",
        receiverName: "B",
        sourceCountryIsoCode: "NG",
        destinationCountryIsoCode: "CA",
        paymentMethod: "INTERAC",
        accountType: "INDIVIDUAL",
      }),
    method: "POST",
    path: "/v1/global-payout/transfer/authorize",
    body: {
      amount: 1,
      sourceCurrency: "NGN",
      destinationCurrency: "CAD",
      receiverName: "B",
      sourceCountryIsoCode: "NG",
      destinationCountryIsoCode: "CA",
      paymentMethod: "INTERAC",
      accountType: "INDIVIDUAL",
    },
  },
  // global collection
  {
    name: "globalCollection.listDrcProviders",
    call: (n) => n.globalCollection.listDrcProviders(),
    method: "GET",
    path: "/v1/global-collection/drc/inflow/providers",
  },
  {
    name: "globalCollection.initiateInflow",
    call: (n) =>
      n.globalCollection.initiateInflow({
        phoneNumber: "243",
        callbackUrl: "https://example.com",
        amount: 1,
        currency: "CDF",
        topupVendor: "ORANGE",
      }),
    method: "POST",
    path: "/v1/global-collection/inflow/initiate",
    body: {
      phoneNumber: "243",
      callbackUrl: "https://example.com",
      amount: 1,
      currency: "CDF",
      topupVendor: "ORANGE",
    },
  },
  {
    name: "globalCollection.getTransaction",
    call: (n) => n.globalCollection.getTransaction("gc1"),
    method: "GET",
    path: "/v1/global-collection/transactions/gc1",
  },
];

describe("every resource method sends the right request", () => {
  it.each(cases.map((c) => [c.name, c] as const))("%s", async (_name, c) => {
    const m = new MockApi();
    const responder = () => ok({ id: "x" });
    m.on(c.method, c.path, responder);
    const base = c.production ? "https://api.nomba.com" : "https://sandbox.nomba.com";
    await c.call(client(m, c.production ? { environment: "production" } : {}));
    const api = m.apiCalls;
    expect(api).toHaveLength(1);
    const call = api[0]!;
    expect(call.method).toBe(c.method);
    expect(`${call.url.origin}${call.url.pathname}`).toBe(`${base}${c.path}`);
    expect(Object.fromEntries(call.url.searchParams)).toEqual(c.query ?? {});
    expect(call.body).toEqual(c.body);
    expect(call.headers.accountId).toBe(FAKE.accountId);
    expect(call.headers.Authorization).toBe("Bearer test-access-token-1");
    expect(call.headers["Content-Type"]).toBe("application/json");
  });

  it("covers every public resource method", () => {
    const nomba = client(new MockApi());
    const resources = [
      "accounts",
      "virtualAccounts",
      "checkout",
      "transfers",
      "transactions",
      "terminals",
      "directDebits",
      "bills",
      "globalPayout",
      "globalCollection",
    ] as const;
    const pagers = new Set([
      "listAllTerminals",
      "listAll",
      "filterAll",
      "listAllBankTransactions",
    ]);
    const tested = new Set(cases.map((c) => c.name.split(" ")[0]));
    for (const r of resources) {
      const proto = Object.getPrototypeOf(nomba[r]);
      for (const method of Object.getOwnPropertyNames(proto)) {
        if (method === "constructor" || pagers.has(method)) continue;
        expect(tested, `${r}.${method} has no request test`).toContain(`${r}.${method}`);
      }
    }
  });
});

describe("path parameter validation", () => {
  const bad = ["", "   ", ".", "..", "a/b", "../transfers", "a\\b"];
  it.each(bad)("rejects %j before sending", async (value) => {
    const m = new MockApi();
    const n = client(m);
    for (const call of [
      () => n.virtualAccounts.get(value),
      () => n.checkout.getOrder(value),
      () => n.transactions.requery(value),
      () => n.accounts.getBalance({ subAccountId: value }),
      () => n.transfers.toBank(transfer, { subAccountId: value }),
      () =>
        n.terminals.sendPaymentRequest(value, {
          merchantTxRef: "m",
          amount: 1,
          currency: "NGN",
        }),
      () => n.bills.listDataPlans(value),
    ]) {
      await expect(call()).rejects.toBeInstanceOf(ValidationError);
    }
    expect(m.calls).toHaveLength(0);
  });

  it("rejects non-string values", async () => {
    const n = client(new MockApi());
    await expect(n.virtualAccounts.get(undefined as unknown as string)).rejects.toThrow(
      /non-empty string/
    );
    await expect(n.virtualAccounts.get({} as unknown as string)).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it("client-side validation errors have httpStatus null", async () => {
    const err = (await client(new MockApi())
      .checkout.getOrder("..")
      .catch((e: unknown) => e)) as ValidationError;
    expect(err.httpStatus).toBeNull();
    expect(err.message).toMatch(/^Nomba validation error: orderReference/);
  });
});

describe("required arguments", () => {
  const n = () => client(new MockApi());
  it.each([
    ["accounts.getSubAccount with none", () => n().accounts.getSubAccount({})],
    [
      "accounts.getSubAccount with both",
      () => n().accounts.getSubAccount({ accountId: "a", accountRef: "b" }),
    ],
    ["transactions.get with none", () => n().transactions.get({})],
    [
      "transactions.get with two",
      () => n().transactions.get({ transactionRef: "a", orderId: "b" }),
    ],
    [
      "transfers.toBank without bankCode",
      () => n().transfers.toBank({ ...transfer, bankCode: "" }),
    ],
    [
      "transfers.toWallet without receiver",
      () => n().transfers.toWallet({ amount: 1 } as never),
    ],
    [
      "transfers.lookupAccount",
      () => n().transfers.lookupAccount({ accountNumber: "1" } as never),
    ],
    [
      "bills.lookupElectricityCustomer",
      () => n().bills.lookupElectricityCustomer({ disco: "x" } as never),
    ],
    [
      "bills.lookupCableTvCustomer",
      () => n().bills.lookupCableTvCustomer({ customerId: "x" } as never),
    ],
    [
      "bills.lookupBettingCustomer",
      () => n().bills.lookupBettingCustomer({ customerId: "x" } as never),
    ],
    ["bills.listCableTvPlans", () => n().bills.listCableTvPlans("")],
    ["bills.buyAirtime", () => n().bills.buyAirtime({ amount: 1 } as never)],
    ["bills.buyData", () => n().bills.buyData({ phoneNumber: "1" } as never)],
    ["checkout.createOrder", () => n().checkout.createOrder({} as never)],
    ["checkout.getSavedCards", () => n().checkout.getSavedCards("o", {} as never)],
    ["checkout.chargeSavedCard", () => n().checkout.chargeSavedCard({ order } as never)],
    [
      "checkout.getTransaction",
      () => n().checkout.getTransaction({ idType: "ORDER_ID" } as never),
    ],
    ["directDebits.getMandateStatus", () => n().directDebits.getMandateStatus("")],
    [
      "globalPayout.getExchangeRates",
      () => n().globalPayout.getExchangeRates({ from: "NGN" } as never),
    ],
    [
      "virtualAccounts.create",
      () => n().virtualAccounts.create({ accountRef: "r" } as never),
    ],
    ["terminals.assign", () => n().terminals.assign({} as never)],
    ["limit above 50", () => n().transactions.list({ limit: 51 })],
    ["limit 0", () => n().accounts.listTerminals({ limit: 0 })],
    ["fractional limit", () => n().virtualAccounts.list({}, { limit: 2.5 })],
  ])("%s → ValidationError", async (_name, call) => {
    await expect(call()).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("merchantTxRef idempotency", () => {
  const moneyCalls: Array<
    [string, string, (n: Nomba) => Promise<{ merchantTxRef: string }>]
  > = [
    [
      "transfers.toBank",
      "/v2/transfers/bank",
      (n) =>
        n.transfers.toBank({
          amount: 1,
          accountNumber: "1",
          accountName: "A",
          bankCode: "1",
        }),
    ],
    [
      "transfers.toWallet",
      "/v2/transfers/wallet",
      (n) => n.transfers.toWallet({ amount: 1, receiverAccountId: "r" }),
    ],
    [
      "bills.buyAirtime",
      "/v2/bill/topup",
      (n) => n.bills.buyAirtime({ amount: 1, phoneNumber: "1", network: "MTN" }),
    ],
    [
      "bills.buyData",
      "/v2/bill/data",
      (n) => n.bills.buyData({ productId: "p", phoneNumber: "1", network: "MTN" }),
    ],
    [
      "bills.buyElectricity",
      "/v2/bill/electricity",
      (n) => n.bills.buyElectricity({ disco: "d" }),
    ],
    [
      "bills.payCableTv",
      "/v2/bill/cabletv",
      (n) => n.bills.payCableTv({ cableTvType: "dstv" }),
    ],
    [
      "bills.fundBetting",
      "/v2/bill/betting",
      (n) => n.bills.fundBetting({ bettingProvider: "b" }),
    ],
  ];

  it.each(moneyCalls)(
    "%s generates a UUID v4 and returns it",
    async (_name, path, call) => {
      const m = new MockApi().on(
        "POST",
        path,
        ok({ id: "t1", status: "PENDING_BILLING" })
      );
      const res = await call(client(m));
      const sent = (m.apiCalls[0]!.body as { merchantTxRef: string }).merchantTxRef;
      expect(sent).toMatch(UUID_V4);
      expect(res.merchantTxRef).toBe(sent);
      expect(res).toMatchObject({ id: "t1", status: "PENDING_BILLING" });
    }
  );

  it("generates a different reference per call", async () => {
    const m = new MockApi().on("POST", "/v2/transfers/wallet", ok({}), ok({}));
    const n = client(m);
    const a = await n.transfers.toWallet({ amount: 1, receiverAccountId: "r" });
    const b = await n.transfers.toWallet({ amount: 1, receiverAccountId: "r" });
    expect(a.merchantTxRef).not.toBe(b.merchantTxRef);
  });

  it("uses the caller's reference and does not mutate params", async () => {
    const m = new MockApi().on("POST", "/v2/transfers/bank", ok({ id: "t" }));
    const params = { amount: 1, accountNumber: "1", accountName: "A", bankCode: "1" };
    const res = await client(m).transfers.toBank({ ...params, merchantTxRef: "mine-1" });
    expect((m.apiCalls[0]!.body as { merchantTxRef: string }).merchantTxRef).toBe(
      "mine-1"
    );
    expect(res.merchantTxRef).toBe("mine-1");
    const p2 = { ...params };
    await client(new MockApi().on("POST", "/v2/transfers/bank", ok({}))).transfers.toBank(
      p2
    );
    expect(p2).not.toHaveProperty("merchantTxRef");
  });

  it("keeps a merchantTxRef the API returns", async () => {
    const m = new MockApi().on(
      "POST",
      "/v2/bill/topup",
      ok({ merchantTxRef: "from-api" })
    );
    const res = await client(m).bills.buyAirtime({
      amount: 1,
      phoneNumber: "1",
      network: "MTN",
      merchantTxRef: "sent",
    });
    expect(res.merchantTxRef).toBe("from-api");
  });

  it("returns an object with the reference when data is null", async () => {
    const m = new MockApi().on("POST", "/v2/bill/topup", ok(null));
    const res = await client(m).bills.buyAirtime({
      amount: 1,
      phoneNumber: "1",
      network: "MTN",
      merchantTxRef: "r",
    });
    expect(res).toEqual({ merchantTxRef: "r" });
  });

  it("chargeSavedCard generates order.orderReference and returns it", async () => {
    const m = new MockApi().on(
      "POST",
      "/v1/checkout/tokenized-card-payment",
      ok({ status: true, otpRequired: false })
    );
    const input = { order: { ...order }, tokenKey: "tok" };
    const res = await client(m).checkout.chargeSavedCard(input);
    const body = m.apiCalls[0]!.body as {
      order: { orderReference: string };
      tokenKey: string;
    };
    expect(body.order.orderReference).toMatch(UUID_V4);
    expect(body.tokenKey).toBe("tok");
    expect(res.orderReference).toBe(body.order.orderReference);
    expect(res).not.toHaveProperty("merchantTxRef");
    expect(input.order).not.toHaveProperty("orderReference");
  });

  it("chargeSavedCard keeps a caller orderReference and the API's value", async () => {
    const m = new MockApi().on(
      "POST",
      "/v1/checkout/tokenized-card-payment",
      ok({ orderReference: "api-ref" })
    );
    const res = await client(m).checkout.chargeSavedCard({
      order: { ...order, orderReference: "mine" },
      tokenKey: "tok",
    });
    expect(
      (m.apiCalls[0]!.body as { order: { orderReference: string } }).order.orderReference
    ).toBe("mine");
    expect(res.orderReference).toBe("api-ref");
  });

  it("chargeSavedCard without an order sends the body unchanged", async () => {
    const m = new MockApi().on(
      "POST",
      "/v1/checkout/tokenized-card-payment",
      ok({ status: false })
    );
    const res = await client(m).checkout.chargeSavedCard({ tokenKey: "tok" } as never);
    expect(m.apiCalls[0]!.body).toEqual({ tokenKey: "tok" });
    expect(res).toEqual({ status: false });
  });

  it("falls back to node:crypto when globalThis.crypto.randomUUID is unavailable", async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    try {
      const m = new MockApi().on("POST", "/v2/transfers/wallet", ok({}));
      const res = await client(m).transfers.toWallet({
        amount: 1,
        receiverAccountId: "r",
      });
      expect(res.merchantTxRef).toMatch(UUID_V4);
    } finally {
      if (original) Object.defineProperty(globalThis, "crypto", original);
    }
  });
});
