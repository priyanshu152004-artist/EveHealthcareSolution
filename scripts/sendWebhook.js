// Plays the payment provider: sends a signed webhook and retries with
// exponential backoff on network errors / 5xx, like real providers do.
//
//   node scripts/sendWebhook.js <payment_reference> <SUCCESS|FAILED> <amount> [--event-id ID] [--repeat N]
//
// --repeat sends the *same* event N times to demonstrate idempotency.
const crypto = require('crypto');
const config = require('../src/config');
const { signWebhook } = require('../src/routes/payments');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function deliver(url, body, maxAttempts = 5) {
  let delay = 1000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': signWebhook(body) },
        body,
      });
      // 2xx = done; 4xx = permanent, retrying won't help.
      if (res.status < 500) return res;
      console.log(`attempt ${attempt}: HTTP ${res.status}`);
    } catch (err) {
      console.log(`attempt ${attempt}: ${err.message}`);
    }
    if (attempt < maxAttempts) {
      await sleep(delay);
      delay *= 2;
    }
  }
  throw new Error('webhook delivery failed after retries');
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name, fallback) => {
    const i = args.indexOf(name);
    return i === -1 ? fallback : args.splice(i, 2)[1];
  };
  const eventId = flag('--event-id', `evt_${crypto.randomUUID().replace(/-/g, '')}`);
  const repeat = Number(flag('--repeat', 1));
  const url = flag('--url', `http://localhost:${config.port}/payments/webhook/`);
  const [paymentReference, status, amount] = args;
  if (!paymentReference || !['SUCCESS', 'FAILED'].includes(status) || !amount) {
    console.error('usage: node scripts/sendWebhook.js <payment_reference> <SUCCESS|FAILED> <amount> [--event-id ID] [--repeat N]');
    process.exit(2);
  }

  const body = JSON.stringify({ event_id: eventId, payment_reference: paymentReference, status, amount });
  for (let i = 0; i < repeat; i++) {
    const res = await deliver(url, body);
    console.log(res.status, await res.text());
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
