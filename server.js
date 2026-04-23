const url = require('url');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PRICE_ID = process.env.STRIPE_PRICE_ID;
const PUB_KEY = process.env.STRIPE_PUBLISHABLE_KEY;
const SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_Ei01Lm2V4RlTLfRoQ4YBF8dr1LSiQi1S';
const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSctUfzNg7SzF029Z5jODt-dOF9qIm3MFyMAoSEsUzpfXYdqHA/viewform';
const SUCCESS_URL = FORM_URL;
const CANCEL_URL = process.env.CANCEL_URL || 'https://vehicle-sniper-production.up.railway.app/';
const PORT = process.env.PORT || 8080;

const mimeTypes = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const SUBSCRIBERS_FILE = path.join(__dirname, 'data', 'subscribers.json');

function loadSubscribers() { try { if (fs.existsSync(SUBSCRIBERS_FILE)) return JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, 'utf8')); } catch (e) { console.error('Error:', e.message); } return []; }
function saveSubscriber(email, tier, customerId, subscriptionId) { const subs = loadSubscribers(); const existing = subs.find(s => s.email === email); if (existing) { existing.tier = tier; existing.customerId = customerId; existing.subscriptionId = subscriptionId; existing.updatedAt = new Date().toISOString(); } else { subs.push({ email, tier, customerId, subscriptionId, createdAt: new Date().toISOString(), filters: {} }); } fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(subs, null, 2)); console.log(`Subscriber: ${email} (${tier})`); }

async function createCheckoutSession(priceId, customerEmail) {
  const params = new URLSearchParams();
  params.append('mode', 'subscription');
  params.append('subscription_data[trial_period_days]', '7');
  params.append('line_items[0][price]', priceId);
  params.append('line_items[0][quantity]', '1');
  params.append('success_url', SUCCESS_URL);
  params.append('cancel_url', CANCEL_URL);
  params.append('allow_promotion_codes', 'true');
  if (customerEmail) params.append('customer_email', customerEmail);
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { 'Authorization': `Bearer ${SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
  if (!response.ok) throw new Error(`Stripe error: ${await response.text()}`);
  return response.json();
}

function parseBody(req) { return new Promise((resolve, reject) => { let body = ''; req.on('data', chunk => body += chunk); req.on('end', () => { resolve(Object.fromEntries(new URLSearchParams(body))); }); req.on('error', reject); }); }

const server = http.createServer(async (req, res) => {
  const { pathname } = url.parse(req.url, true);
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Stripe-Signature');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Stripe Webhook
  if (req.method === 'POST' && pathname === '/api/stripe-webhook') {
    let rawBody = ''; req.on('data', chunk => rawBody += chunk); req.on('end', async () => {
      try { const event = JSON.parse(rawBody); console.log('Webhook:', event.type); if (event.type === 'checkout.session.completed') { const session = event.data.object; const email = session.customer_email || session.customer_details?.email; const customerId = session.customer; const subscriptionId = session.subscription; let tier = 'essential'; const priceId = session.line_items?.data?.[0]?.price?.id; if (priceId === 'price_1TOsPFHe9iTCk9aJAy5NajpB' || priceId === 'price_1TOn4GHe9iTCk9aJ3oeq8Idv') tier = 'instant'; if (email) saveSubscriber(email, tier, customerId, subscriptionId); } res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ received: true })); } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    }); return;
  }

  // Create Checkout
  if (req.method === 'POST' && pathname === '/api/create-checkout-session') {
    const { email, price_id } = await parseBody(req); const selectedPriceId = price_id || PRICE_ID;
    try { const session = await createCheckoutSession(selectedPriceId, email || undefined); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ url: session.url })); } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: err.message })); }
    return;
  }

  // Get config
  if (req.method === 'GET' && pathname === '/api/config') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ publishableKey: PUB_KEY || '', priceId: PRICE_ID || '' })); return; }

  // Get subscribers
  if (req.method === 'GET' && pathname === '/api/subscribers') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ subscribers: loadSubscribers() })); return; }

  // Waitlist
  if (req.method === 'POST' && pathname === '/api/waitlist') { const { email } = await parseBody(req); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ message: 'You\'re on the list!' })); return; }

  // Static files
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(__dirname, 'public', filePath);
  fs.readFile(filePath, (err, data) => { if (err) { res.writeHead(404); res.end('Not found'); } else { res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'text/plain' }); res.end(data); } });
});

server.listen(PORT, () => { console.log(`Vehicle Sniper on ${PORT}`); });
