// Tiny web server (no dependencies) so you can open the player from your phone.
// Run it with:  node server.js   then open the "Celular" address on your phone.
// Phone and computer need to be on the same WiFi.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = __dirname;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return send(res, 400, 'Petición inválida');
  }
  if (pathname.endsWith('/')) pathname += 'index.html';

  // safety check: nobody gets out of this folder with tricks like /../../etc/passwd
  const file = path.join(ROOT, pathname);
  if (!file.startsWith(ROOT + path.sep)) return send(res, 403, 'Prohibido');

  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'No encontrado');
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',   // so the phone always gets the latest version
    });
    res.end(data);
  });
});

function send(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`El puerto ${PORT} está ocupado. Prueba con otro:  PORT=8081 node server.js`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter((net) => net.family === 'IPv4' && !net.internal)
    .map((net) => net.address);

  console.log('\n  Video Player funcionando\n');
  console.log(`  Compu:    http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  Celular:  http://${ip}:${PORT}`);
  console.log('\n  Ctrl+C para apagarlo\n');
});
