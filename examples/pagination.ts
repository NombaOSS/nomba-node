// Iterate every transaction in a date range, page by page.
import Nomba from "@nombaoss/nomba-node";

const nomba = new Nomba();

// Auto-paging: fetches the next page only when you reach it.
let total = 0;
for await (const tx of nomba.transactions.listAll({
  dateFrom: "2026-01-01T00:00:00",
  dateTo: "2026-01-31T23:59:59",
  limit: 50,
})) {
  total += tx.amount;
}
console.log(`January total: ${total}`);

// Or one page at a time.
const page = await nomba.transactions.list({ limit: 10 });
console.log(page.results?.length, page.cursor ? "more pages" : "last page");
