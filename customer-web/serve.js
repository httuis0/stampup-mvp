// ============================================================
// Zero-Dependency Local Static Server for StampUp Customer Page
// Serves customer-web/index.html on http://localhost:5173
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5173;

// Load .env
let supabaseUrl = 'https://leoleteiwpirmdtfoufa.supabase.co';
let supabaseAnonKey = '';

try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const urlMatch = envContent.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/);
    const keyMatch = envContent.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
    if (urlMatch) supabaseUrl = urlMatch[1].trim();
    if (keyMatch) supabaseAnonKey = keyMatch[1].trim();
  }
} catch (e) {
  console.warn('Could not read .env file:', e.message);
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  // Dynamic config endpoint
  if (url === '/config.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(`
window.STAMPUP_CONFIG = {
  supabaseUrl: ${JSON.stringify(supabaseUrl)},
  supabaseAnonKey: ${JSON.stringify(supabaseAnonKey)},
  defaultCountryCode: '+971'
};
    `);
    return;
  }

  // Check if requesting an existing file (e.g. /manifest.json, /icon.svg, /flyer.html)
  const safeFilename = path.basename(url);
  const potentialFile = path.join(__dirname, safeFilename);
  if (safeFilename && fs.existsSync(potentialFile) && fs.statSync(potentialFile).isFile()) {
    const ext = path.extname(safeFilename).toLowerCase();
    const mimeTypes = {
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.png': 'image/png'
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(potentialFile).pipe(res);
    return;
  }

  // Fallback: Serve index.html for all /c/* and root routes
  const htmlPath = path.join(__dirname, 'index.html');
  fs.readFile(htmlPath, 'utf8', (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error loading customer page.');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 StampUp Customer Page is running!`);
  console.log(`📱 Local URL: http://localhost:${PORT}/c/YOUR-SHOP-SLUG`);
  console.log(`======================================================\n`);
});
