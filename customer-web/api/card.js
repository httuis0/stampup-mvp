import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://leoleteiwpirmdtfoufa.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxlb2xldGVpd3Bpcm1kdGZvdWZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5MzE0MjQsImV4cCI6MjEwNjUwNzQyNH0.ijyVogbCxLllDgf_4EgoYyMFZ9QqCayiUi3OxuEWrhk';

export default async function handler(req, res) {
  const rawSlug = req.query.slug || '';
  let html = '';
  try {
    const htmlPath = path.join(process.cwd(), 'index.html');
    html = fs.readFileSync(htmlPath, 'utf8');
  } catch (e) {
    return res.status(500).send('Error loading page template');
  }

  if (!rawSlug) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  }

  try {
    const cleanSlug = String(rawSlug).split('?')[0].replace(/^\/c\//, '').replace(/\/$/, '');
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/shops?slug=eq.${encodeURIComponent(cleanSlug)}&select=name,logo_url,reward_text&limit=1`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );
    const data = await r.json();
    if (Array.isArray(data) && data[0]) {
      const shop = data[0];
      const shopName = shop.name || 'Digital Loyalty Pass';
      const logoUrl = shop.logo_url || '';
      const metaTags = `
  <title>${shopName}</title>
  <meta property="og:site_name" content="${shopName}">
  <meta property="og:title" content="${shopName}">
  <meta property="og:description" content="Digital Stamp Card — Collect stamps & earn rewards at ${shopName}">
  ${logoUrl ? `<meta property="og:image" content="${logoUrl}"><meta name="twitter:image" content="${logoUrl}">` : ''}
  <meta name="twitter:title" content="${shopName}">
  <meta name="twitter:card" content="summary">
`;
      html = html.replace('<title>Digital Loyalty Pass</title>', metaTags);
    }
  } catch (err) {
    // fallback cleanly to default html
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(html);
}
