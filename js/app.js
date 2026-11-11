// Ứng dụng Quản Lý Bán Diều (App Controller & Router)
import { db } from './db.js';
import { APP_CONFIG, DEFAULT_SHOP_SETTINGS } from './config.js';
import { ProductModule } from './modules/products.js';
import { CustomersModule } from './modules/customers.js';
import { SalesModule } from './modules/sales.js';
import { InventoryModule } from './modules/inventory.js';
import { QuotationsModule } from './modules/quotations.js';
import { DebtsModule } from './modules/debts.js';
import { ReportsModule } from './modules/reports.js';
import { BackupModule } from './modules/backup.js';
import { SettingsModule } from './modules/settings.js';
import { licenseService } from './modules/license.js';
import { formatDateTime } from './utils.js';

class KiteApp {
  constructor() {
    this.currentView = 'sales'; // Mặc định mở ngay màn hình Bán hàng (POS)
    this.modules = {};
    this.swRegistration = null;
    this.licenseService = licenseService;
  }

  async init() {
    console.log(`[App] Khởi động ${APP_CONFIG.APP_NAME} v${APP_CONFIG.APP_VERSION}`);

    try {
      // 1. Khởi tạo cơ sở dữ liệu IndexedDB
      await db.init();
      console.log('[App] DB khởi tạo thành công');
    } catch (err) {
      console.error('[App] Lỗi khởi tạo DB:', err);
    }

    try {
      // 2. Kiểm tra bản quyền thiết bị (Device-Locked License)
      const licStatus = await this.licenseService.checkStatus();
      console.log('[License] Trạng thái bản quyền:', licStatus);
      if (licStatus.status === 'expired') {
        this.licenseService.showLockModal(() => {
          this.navigateTo(this.currentView);
        });
      }
    } catch (err) {
      console.warn('[License] Lỗi kiểm tra bản quyền:', err);
    }

    try {
      // 2. Tự động xin cấp quyền lưu trữ bền vững khi khởi động
      this.requestStoragePersistenceOnStart();
    } catch (err) {
      console.warn('[App] Lỗi persist:', err);
    }

    // 3. Khởi tạo các mô-đun nghiệp vụ
    this.productModule = new ProductModule(this);
    this.customersModule = new CustomersModule(this);
    this.salesModule = new SalesModule(this);
    this.inventoryModule = new InventoryModule(this);
    this.quotationsModule = new QuotationsModule(this);
    this.debtsModule = new DebtsModule(this);
    this.reportsModule = new ReportsModule(this);
    this.backupModule = new BackupModule(this);
    this.settingsModule = new SettingsModule(this);

    // 4. Gán sự kiện điều hướng thanh Bottom Nav ngay để bấm được luôn
    this.bindNavigation();

    // 5. Hiển thị màn hình mặc định ngay lập tức (xóa loading spinner)
    this.navigateTo(this.currentView);

    // 6. Đăng ký Service Worker (chạy nền)
    this.registerServiceWorker();

    // 7. Cập nhật Banner cảnh báo sao lưu & Header shop
    try {
      await this.updateBackupBanner();
      await this.updateHeaderBrand();
    } catch (err) {
      console.warn('[App] Lỗi cập nhật banner/header:', err);
    }
  }

  // Xin quyền lưu trữ bền vững ngay khi mở app
  async requestStoragePersistenceOnStart() {
    if (navigator.storage && navigator.storage.persist) {
      try {
        const persisted = await navigator.storage.persisted();
        if (!persisted) {
          console.log('[Storage] Đang xin quyền lưu trữ bền vững...');
          const granted = await navigator.storage.persist();
          console.log('[Storage] Kết quả xin lưu trữ bền vững:', granted);
        } else {
          console.log('[Storage] Bộ nhớ đã được bảo vệ bền vững.');
        }
      } catch (err) {
        console.warn('[Storage] Không thể gọi persist():', err);
      }
    }
  }

  // Đăng ký Service Worker và thông báo "Có bản mới, bấm để cập nhật"
  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then((registration) => {
          this.swRegistration = registration;
          console.log('[SW] Đã đăng ký thành công:', registration.scope);

          // Lắng nghe khi có worker mới đang chờ kích hoạt
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  this.showUpdateBanner(registration);
                }
              });
            }
          });

          if (registration.waiting) {
            this.showUpdateBanner(registration);
          }
        }).catch((err) => {
          console.warn('[SW] Đăng ký thất bại:', err);
        });

        // Tự động tải lại khi worker mới chiếm quyền kiểm soát
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.location.reload();
        });
      });
    }
  }

  showUpdateBanner(registration) {
    const banner = document.getElementById('sw-update-banner');
    if (banner) {
      banner.style.display = 'flex';
      const btn = document.getElementById('btn-apply-update');
      if (btn) {
        btn.addEventListener('click', () => {
          if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      }
    }
  }

  // Cập nhật Banner cảnh báo sao lưu ở đầu trang
  async updateBackupBanner() {
    const banner = document.getElementById('backup-reminder-banner');
    if (!banner) return;

    const shop = (await db.getSetting('shop_info')) || { ...DEFAULT_SHOP_SETTINGS };
    const lastBackup = shop.lastBackupTime ? new Date(shop.lastBackupTime) : null;
    const now = new Date();

    let needsReminder = false;
    let reason = '';

    if (!lastBackup) {
      needsReminder = true;
      reason = 'Bạn chưa sao lưu dữ liệu lần nào!';
    } else {
      const daysDiff = (now - lastBackup) / (1000 * 60 * 60 * 24);
      if (daysDiff >= APP_CONFIG.BACKUP_REMINDER_DAYS) {
        needsReminder = true;
        reason = `Đã ${Math.floor(daysDiff)} ngày bạn chưa sao lưu dữ liệu ra Zalo/Drive!`;
      } else if ((shop.unbackedChangesCount || 0) >= APP_CONFIG.BACKUP_REMINDER_CHANGES) {
        needsReminder = true;
        reason = `Có hơn ${shop.unbackedChangesCount} đơn và thay đổi mới chưa được sao lưu!`;
      }
    }

    if (needsReminder) {
      banner.style.display = 'flex';
      banner.innerHTML = `
        <div class="banner-text">
          <span>⚠️ <b>CẢNH BÁO:</b> ${reason}</span>
          <span class="banner-subtext">Sao lưu gần nhất: ${shop.lastBackupTime ? formatDateTime(shop.lastBackupTime) : 'Chưa có'}</span>
        </div>
        <button id="btn-quick-backup-banner" class="btn btn-warning btn-xs">💾 Sao Lưu Ngay</button>
      `;

      const backupBtn = document.getElementById('btn-quick-backup-banner');
      if (backupBtn) {
        backupBtn.addEventListener('click', () => {
          this.backupModule.exportBackupFile();
        });
      }
    } else {
      banner.style.display = 'none';
    }
  }

  async updateHeaderBrand() {
    const shop = (await db.getSetting('shop_info')) || { ...DEFAULT_SHOP_SETTINGS };
    const brandName = document.getElementById('header-shop-name');
    const brandLogo = document.getElementById('header-shop-logo');

    if (brandName) brandName.textContent = shop.shopName || APP_CONFIG.APP_NAME;
    if (brandLogo) {
      if (shop.logo) {
        brandLogo.src = shop.logo;
        brandLogo.style.display = 'block';
      } else {
        brandLogo.style.display = 'none';
      }
    }
  }

  // Điều hướng giữa các màn hình
  navigateTo(viewName) {
    this.currentView = viewName;

    // Cập nhật trạng thái active trên Bottom Nav
    document.querySelectorAll('.bottom-nav-item').forEach(btn => {
      const target = btn.dataset.view;
      if (target === viewName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Cuộn lên đầu trang
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Render mô-đun tương ứng
    this.renderCurrentView();
  }

  renderCurrentView() {
    switch (this.currentView) {
      case 'sales':
        this.salesModule.render();
        break;
      case 'products':
        this.productModule.render();
        break;
      case 'quotations':
        this.quotationsModule.render();
        break;
      case 'customers':
        this.customersModule.render();
        break;
      case 'inventory':
        this.inventoryModule.render();
        break;
      case 'debts':
        this.debtsModule.render();
        break;
      case 'reports':
        this.reportsModule.render();
        break;
      case 'settings':
        this.settingsModule.render();
        break;
      default:
        this.salesModule.render();
    }
  }

  bindNavigation() {
    document.querySelectorAll('.bottom-nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        this.navigateTo(view);
      });
    });

    // Lối tắt từ Header cố định trên cùng
    const btnHeaderRestore = document.getElementById('btn-header-restore');
    if (btnHeaderRestore) {
      btnHeaderRestore.addEventListener('click', () => {
        this.backupModule.promptRestoreFile();
      });
    }

    const btnHeaderInv = document.getElementById('btn-header-inventory');
    if (btnHeaderInv) btnHeaderInv.addEventListener('click', () => this.navigateTo('inventory'));

    const btnHeaderRep = document.getElementById('btn-header-reports');
    if (btnHeaderRep) btnHeaderRep.addEventListener('click', () => this.navigateTo('reports'));

    const btnHeaderSet = document.getElementById('btn-header-settings');
    if (btnHeaderSet) btnHeaderSet.addEventListener('click', () => this.navigateTo('settings'));

    // Logo & tên shop click -> về màn hình Cài đặt
    const brandWrap = document.getElementById('header-brand-wrap');
    if (brandWrap) {
      brandWrap.addEventListener('click', () => {
        this.navigateTo('settings');
      });
    }
  }
}

// Khởi chạy khi DOM sẵn sàng
document.addEventListener('DOMContentLoaded', () => {
  window.app = new KiteApp();
  window.app.init();
});
