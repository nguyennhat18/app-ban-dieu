// scripts/verify-server.js
import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT = 8099;
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  const filePath = path.resolve('.' + reqPath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found: ' + reqPath);
    return;
  }

  const ext = path.extname(filePath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, async () => {
  console.log(`Server listening on http://localhost:${PORT}`);

  try {
    const urls = [
      '/',
      '/index.html',
      '/manifest.json',
      '/sw.js',
      '/css/app.css',
      '/js/app.js',
      '/js/config.js',
      '/js/db.js',
      '/js/utils.js',
      '/js/vendor/jspdf.umd.min.js',
      '/js/vendor/jspdf.plugin.autotable.min.js',
      '/js/vendor/xlsx.full.min.js',
      '/js/vendor/roboto-font.js',
      '/js/modules/products.js',
      '/js/modules/customers.js',
      '/js/modules/sales.js',
      '/js/modules/inventory.js',
      '/js/modules/quotations.js',
      '/js/modules/debts.js',
      '/js/modules/reports.js',
      '/js/modules/backup.js',
      '/js/modules/settings.js',
      '/icons/icon-192.png',
      '/icons/icon-512.png',
      '/icons/icon-kite.svg',
      '/tests/test-browser.html'
    ];

    let allOk = true;
    for (const u of urls) {
      const res = await fetch(`http://localhost:${PORT}${u}`);
      if (res.status !== 200) {
        console.error(`❌ Lỗi tải URL ${u}: HTTP ${res.status}`);
        allOk = false;
      }
    }

    if (allOk) {
      console.log(`✅ Toàn bộ ${urls.length} file tài nguyên đều nạp thành công (HTTP 200 OK)!`);
    } else {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Lỗi kiểm tra server:', err);
    process.exitCode = 1;
  } finally {
    server.close(() => {
      console.log('Server đã đóng.');
    });
  }
});
