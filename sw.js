// Service Worker cho ứng dụng Bán Diều (Offline-First)
const CACHE_VERSION = 'kite-store-v1.0.2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/app.js',
  './js/config.js',
  './js/db.js',
  './js/utils.js',
  './js/vendor/jspdf.umd.min.js',
  './js/vendor/jspdf.plugin.autotable.min.js',
  './js/vendor/xlsx.full.min.js',
  './js/vendor/roboto-font.js',
  './js/modules/products.js',
  './js/modules/customers.js',
  './js/modules/sales.js',
  './js/modules/inventory.js',
  './js/modules/quotations.js',
  './js/modules/debts.js',
  './js/modules/reports.js',
  './js/modules/backup.js',
  './js/modules/settings.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-kite.svg'
];

// 1. Cài đặt SW và nạp toàn bộ tài nguyên vào Cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      console.log('[ServiceWorker] Đang lưu cache phiên bản:', CACHE_VERSION);
      // Nạp tất cả tài nguyên thiết yếu
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('[ServiceWorker] Cảnh báo nạp cache non-critical:', err);
      });
    })
  );
  // Không ép skipWaiting ngay để người dùng có thể bấm xác nhận cập nhật
});

// 2. Kích hoạt SW và dọn dẹp các cache phiên bản cũ
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_VERSION) {
            console.log('[ServiceWorker] Xóa cache cũ:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[ServiceWorker] Phiên bản', CACHE_VERSION, 'đã sẵn sàng hoạt động');
      return self.clients.claim();
    })
  );
});

// 3. Xử lý tin nhắn từ client (nhận lệnh SKIP_WAITING khi bấm Cập nhật)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 4. Chiến lược phục vụ tài nguyên: Cache First, Network Fallback
self.addEventListener('fetch', (event) => {
  // Chỉ bắt các request GET nội bộ hoặc tài nguyên cần cache
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        // Trả về từ cache ngay lập tức (offline hoạt động 100%)
        return cachedResponse;
      }

      // Nếu chưa có trong cache thì thử fetch từ mạng
      return fetch(event.request).then((networkResponse) => {
        // Chỉ lưu vào cache nếu response hợp lệ
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_VERSION).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Khi offline hoàn toàn và request trang html, trả về index.html
        if (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});
