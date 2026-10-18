// ============================================================
// Universal POS Webhook Receiver (Serverless Function)
// Endpoint: https://stampup-cards.vercel.app/api/pos-webhook?key=<API_KEY>
// Automatically parses Square, Loyverse, Clover, Shopify POS, Toast,
// WooCommerce, or custom POS bill payloads -> awards stamp -> sends WhatsApp.
// ============================================================

const SUPABASE_URL = 'https://leoleteiwpirmdtfoufa.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxlb2xldGVpd3Bpcm1kdGZvdWZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5MzE0MjQsImV4cCI6MjEwNjUwNzQyNH0.ijyVogbCxLllDgf_4EgoYyMFZ9QqCayiUi3OxuEWrhk';

function extractPhone(body, query) {
  if (!body && !query) return null;
  const b = body || {};
  const q = query || {};
  return (
    b.p_phone ||
    b.phone ||
    b.customer_phone ||
    b.mobile ||
    (b.customer && (b.customer.phone || b.customer.phone_number || b.customer.mobile)) ||
    (b.billing_address && b.billing_address.phone) ||
    (b.shipping_address && b.shipping_address.phone) ||
    (b.receipt && (b.receipt.customer_phone || (b.receipt.customer && b.receipt.customer.phone))) ||
    (b.data && b.data.object && b.data.object.customer_phone) ||
    q.phone ||
    q.p_phone ||
    null
  );
}

function extractAmount(body, query) {
  const b = body || {};
  const q = query || {};
  const raw =
    b.p_amount ??
    b.amount ??
    b.total ??
    b.total_price ??
    b.bill_amount ??
    (b.total_money && b.total_money.amount ? Number(b.total_money.amount) / 100 : undefined) ??
    (b.receipt && b.receipt.total_money) ??
    q.amount ??
    q.p_amount ??
    0;
  const parsed = parseFloat(raw);
  return isNaN(parsed) ? 0 : parsed;
}

function extractOrderId(body, query) {
  const b = body || {};
  const q = query || {};
  return String(
    b.p_order_id ||
      b.order_id ||
      b.receipt_number ||
      b.id ||
      q.order_id ||
      'POS-' + Date.now()
  );
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, apikey');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const query = req.query || {};

    const apiKey =
      query.key ||
      query.api_key ||
      body.p_api_key ||
      body.api_key ||
      req.headers['x-api-key'] ||
      '';

    const phone = extractPhone(body, query);
    const amount = extractAmount(body, query);
    const orderId = extractOrderId(body, query);

    if (!apiKey) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing POS API key (?key=sp_live_... or p_api_key in body).',
      });
    }

    if (!phone) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing customer phone number in POS payload.',
      });
    }

    // Call Supabase pos_add_stamp RPC
    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/pos_add_stamp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        p_api_key: apiKey,
        p_phone: String(phone),
        p_amount: amount,
        p_order_id: orderId,
      }),
    });

    const data = await rpcRes.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      message: err?.message || 'POS webhook processing error',
    });
  }
}

