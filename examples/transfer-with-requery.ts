// Send a bank transfer, then confirm its final status.
import { randomUUID } from "node:crypto";
import Nomba, {
  ApiError,
  ConnectionError,
  TransactionStatus,
} from "@nombaoss/nomba-node";

const nomba = new Nomba();

// 1. Resolve the account name first.
const recipient = await nomba.transfers.lookupAccount({
  accountNumber: "0123456789",
  bankCode: "058",
});

// 2. Use your own reference and store it before sending, so a retry reuses it.
const merchantTxRef = randomUUID();

try {
  const transfer = await nomba.transfers.toBank({
    amount: 1000,
    accountNumber: "0123456789",
    accountName: recipient.accountName ?? "",
    bankCode: "058",
    narration: "Invoice 42",
    merchantTxRef,
  });
  console.log(`Transfer ${transfer.id}: ${transfer.status}`);
} catch (err) {
  // A timeout or connection error does NOT mean the transfer failed. Requery
  // with the same merchantTxRef before trying again.
  if (!(err instanceof ConnectionError) && !(err instanceof ApiError)) throw err;
  console.error(`Transfer outcome unknown: ${err.message}`);
}

// 3. Requery by your reference. Only refund your customer on REFUND.
const tx = await nomba.transactions.get({ merchantTxRef });
switch (tx.status) {
  case TransactionStatus.SUCCESS:
    console.log("Delivered");
    break;
  case TransactionStatus.REFUND:
    console.log("Funds returned to your wallet: refund the customer");
    break;
  default:
    console.log(`Still ${tx.status}: wait for the webhook`);
}
