const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

// IMPORTANT: Check environment variables FIRST, don't require settings.json
const PRICE_ID = process.env.STRIPE_PRICE_ID;
const PUB_KEY = process.env.STRIPE_PUBLISHABLE_KEY;
const SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSctUfzNg7SzF029Z5jODt-dOF9qIm3MFyMAoSEsUzpfXYdqHA/viewform';
const SUCCESS_URL = FORM_URL;
const CANCEL_URL = process.env.CANCEL_URL || 'https://vehicle-sniper-production.up.railway.app/';
const PORT = process.env.PORT || 8080;

// Test that env vars exist
if (!PRICE_ID || !SECRET_KEY) {
  console.log('ERROR: Missing STRIPE_PRICE_ID or STRIPE_SECRET_KEY');
  console.log('STRIPE_PRICE_ID:', PRICE_ID);
  console.log('STRIPE_SECRET_KEY:', SECRET_KEY ? 'SET' : 'MISSING');
}

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

async function createCheckoutSession(priceId, customerEmail) {
  const params = new URLSearchParams();
  params.append('mode', 'subscription');
  params.append('line_items[0][price]', priceId);
  params.append('line_items[0][quantity]', '1');
  params.append('success_url', SUCCESS_URL);
  params.append('cancel_url', CANCEL_URL);
  params.append('allow_promotion_codes', 'true');
  if (customerEmail) params.append('customer_email', customerEmail);

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Stripe error: ${err}`);
  }
  return response.json();
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const params = new URLSearchParams(body);
      resolve(Object.fromEntries(params));
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API: Create Stripe Checkout Session
  if (req.method === 'POST' && pathname === '/api/create-checkout-session') {
    try {
      const { email } = await parseBody(req);
      if (!PRICE_ID) throw new Error('STRIPE_PRICE_ID not set');
      if (!SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not set');

      console.log('Creating checkout for price:', PRICE_ID);
      const session = await createCheckoutSession(PRICE_ID, email || undefined);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ url: session.url }));
    } catch (err) {
      console.error('Checkout error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API: Get config (pub key only — safe to expose)
  if (req.method === 'GET' && pathname === '/api/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      publishableKey: PUB_KEY || '',
      priceId: PRICE_ID || '',
    }));
    return;
  }

  // API: Waitlist signup
  if (req.method === 'POST' && pathname === '/api/waitlist') {
    try {
      const { email } = await parseBody(req);
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid email' }));
        return;
      }
      // Don't actually save waitlist in Railway - just respond
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'You\'re on the list!' }));
    } catch (err) {
      console.error('Waitlist error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server error' }));
    }
    return;
  }

  // Serve static files
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(__dirname, 'public', filePath);

  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        fs.readFile(path.join(__dirname, 'public', 'index.html'), (e2, d2) => {
          if (e2) {
            res.writeHead(404);
            res.end('Not found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(d2);
          }
        });
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Vehicle Sniper running on port ${PORT}`);
  console.log('STRIPE_PRICE_ID:', PRICE_ID);
  console.log('STRIPE_SECRET_KEY:', SECRET_KEY ? 'SET' : 'MISSING');
});