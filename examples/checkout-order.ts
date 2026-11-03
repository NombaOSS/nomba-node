// Create a hosted checkout order and send the customer to the payment page.
import Nomba from "@nombaoss/nomba-node";

const nomba = new Nomba();

const { checkoutLink, orderReference } = await nomba.checkout.createOrder({
  order: {
    amount: 5000,
    currency: "NGN",
    customerEmail: "customer@example.com",
    callbackUrl: "https://example.com/checkout/done",
  },
  tokenizeCard: true, // save the card for later charges
});

console.log(`Send the customer to ${checkoutLink}`);

// Later, after the callback or webhook:
const tx = await nomba.checkout.getTransaction({
  idType: "ORDER_REFERENCE",
  id: orderReference,
});
console.log(tx.transactionDetails?.status);
