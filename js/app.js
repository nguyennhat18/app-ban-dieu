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
    const btnHeaderInv = document.getElementById('btn-header-inventory');
    if (btnHeaderInv) btnHeaderInv.addEventListener('click', () => this.navigateTo('inventory'));

    const btnHeaderRep = document.getElementById('btn-header-reports');
    if (btnHeaderRep) btnHeaderRep.addEventListener('click', () => this.navigateTo('reports'));

    const btnHeaderMenu = document.getElementById('btn-header-menu');
    if (btnHeaderMenu) btnHeaderMenu.addEventListener('click', () => this.showQuickToolsModal());

    const btnHeaderRestore = document.getElementById('btn-header-restore');
    if (btnHeaderRestore) {
      btnHeaderRestore.addEventListener('click', () => {
        this.backupModule.promptRestoreFile();
      });
    }

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

  // Bảng Quản Lý Tiện Ích Thông Minh (Quick Tools Sheet)
  showQuickToolsModal() {
    const modalHtml = `
      <div class="modal-backdrop" id="quick-tools-modal">
        <div class="modal-content modal-md">
          <div class="modal-header">
            <h2 class="modal-title">⚡ Bảng Quản Lý Tiện Ích</h2>
            <button class="modal-close" id="btn-close-quick-tools">&times;</button>
          </div>

          <div class="modal-body">
            <p class="text-xs text-muted mb-2">Truy cập nhanh các nghiệp vụ quản lý kho, doanh thu và dữ liệu cửa hàng:</p>

            <div class="quick-tools-list">
              <!-- 1. Quản lý kho & Nhập hàng -->
              <div class="quick-tool-card" id="qt-goto-inventory" style="border-left: 4px solid #0284c7;">
                <div class="quick-tool-icon-wrap" style="background: #e0f2fe; color: #0284c7;">📦</div>
                <div class="quick-tool-content">
                  <div class="quick-tool-title">Quản Lý Nhập Hàng & Lịch Sử Kho</div>
                  <div class="quick-tool-desc">Tạo phiếu nhập hàng, cân tồn kho, xem vết biến động kho</div>
                </div>
                <span class="text-muted text-xs">➔</span>
              </div>

              <!-- 2. Báo cáo doanh thu -->
              <div class="quick-tool-card" id="qt-goto-reports" style="border-left: 4px solid #10b981;">
                <div class="quick-tool-icon-wrap" style="background: #d1fae5; color: #059669;">📊</div>
                <div class="quick-tool-content">
                  <div class="quick-tool-title">Báo Cáo Doanh Thu & Lợi Nhuận</div>
                  <div class="quick-tool-desc">Xem doanh thu, tiền lãi gộp, mặt hàng bán chạy và xuất Excel</div>
                </div>
                <span class="text-muted text-xs">➔</span>
              </div>

              <!-- 3. Nạp file sao lưu dữ liệu -->
              <div class="quick-tool-card" id="qt-goto-restore" style="border-left: 4px solid #f59e0b;">
                <div class="quick-tool-icon-wrap" style="background: #fef3c7; color: #d97706;">📥</div>
                <div class="quick-tool-content">
                  <div class="quick-tool-title">Nạp File Sao Lưu Dữ Liệu (.json)</div>
                  <div class="quick-tool-desc">Khôi phục danh sách diều, khách hàng và đơn hàng khi chuyển máy</div>
                </div>
                <span class="text-muted text-xs">➔</span>
              </div>

              <!-- 4. Tải file mẫu Excel nhập hàng -->
              <div class="quick-tool-card" id="qt-download-excel-template" style="border-left: 4px solid #6366f1;">
                <div class="quick-tool-icon-wrap" style="background: #ede9fe; color: #6366f1;">📄</div>
                <div class="quick-tool-content">
                  <div class="quick-tool-title">Tải File Excel Mẫu Chuẩn</div>
                  <div class="quick-tool-desc">Tải file mẫu 13 cột chuẩn để tự điền và đẩy hàng loạt vào kho</div>
                </div>
                <span class="text-muted text-xs">⬇️</span>
              </div>

              <!-- 5. Xuất file sao lưu dự phòng -->
              <div class="quick-tool-card" id="qt-do-backup" style="border-left: 4px solid #06b6d4;">
                <div class="quick-tool-icon-wrap" style="background: #cffafe; color: #0891b2;">💾</div>
                <div class="quick-tool-content">
                  <div class="quick-tool-title">Xuất File Sao Lưu Dự Phòng</div>
                  <div class="quick-tool-desc">Tải ngay file .json lưu toàn bộ dữ liệu an toàn về máy</div>
                </div>
                <span class="text-muted text-xs">⬇️</span>
              </div>

              <!-- 6. Cài đặt cửa hàng & Bản quyền -->
              <div class="quick-tool-card" id="qt-goto-settings" style="border-left: 4px solid #64748b;">
                <div class="quick-tool-icon-wrap" style="background: #f1f5f9; color: #475569;">⚙️</div>
                <div class="quick-tool-content">
                  <div class="quick-tool-title">Cài Đặt Cửa Hàng & VietQR</div>
                  <div class="quick-tool-desc">Cấu hình ngân hàng, tên shop, loại diều, ĐVT và bản quyền</div>
                </div>
                <span class="text-muted text-xs">➔</span>
              </div>
            </div>
          </div>

          <div class="modal-footer" style="justify-content: flex-end;">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-close-quick-tools-footer">Đóng</button>
          </div>
        </div>
      </div>
    `;

    const old = document.getElementById('quick-tools-modal');
    if (old) old.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('quick-tools-modal');
    const close = () => modal?.remove();

    document.getElementById('btn-close-quick-tools')?.addEventListener('click', close);
    document.getElementById('btn-close-quick-tools-footer')?.addEventListener('click', close);

    document.getElementById('qt-goto-inventory')?.addEventListener('click', () => {
      close();
      this.navigateTo('inventory');
    });

    document.getElementById('qt-goto-reports')?.addEventListener('click', () => {
      close();
      this.navigateTo('reports');
    });

    document.getElementById('qt-goto-restore')?.addEventListener('click', () => {
      close();
      this.backupModule.promptRestoreFile();
    });

    document.getElementById('qt-download-excel-template')?.addEventListener('click', async () => {
      close();
      try {
        const { downloadProductExcelTemplate } = await import('./excel-importer.js');
        const warehouses = this.productModule?._cachedWarehouses || (await import('./config.js')).DEFAULT_WAREHOUSES;
        await downloadProductExcelTemplate(warehouses);
      } catch (err) {
        alert('Lỗi tải file mẫu: ' + err.message);
      }
    });

    document.getElementById('qt-do-backup')?.addEventListener('click', () => {
      close();
      this.backupModule.exportBackupFile();
    });

    document.getElementById('qt-goto-settings')?.addEventListener('click', () => {
      close();
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
