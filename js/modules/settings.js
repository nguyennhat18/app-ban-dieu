// Quản lý Cài Đặt Cửa Hàng, Bảo Vệ Dữ Liệu, Hướng Dẫn Cài PWA & Dữ Liệu Mẫu
import { db } from '../db.js';
import {
  formatVND,
  formatDateTime,
  compressImage,
  escapeHTML
} from '../utils.js';
import { DEFAULT_SHOP_SETTINGS, normalizeWarehouseId } from '../config.js';
import { licenseService, LICENSE_CONFIG, generateLicenseKey, formatRemainingCountdown } from './license.js';
import {
  NAPAS_BANKS,
  hasVietQRConfig,
  resolveOrderQR,
  normalizeTransferContent
} from '../vietqr.js';

export class SettingsModule {
  constructor(app) {
    this.app = app;
    this.activeSettingSection = 'shop'; // 'shop' | 'catalog' | 'backup' | 'guide' | 'license'
    this.guidePlatform = 'ios'; // 'ios' | 'android'
    this.catalogTab = 'categories'; // 'categories' | 'products' | 'units' | 'warehouses'
    this.productSearchQuery = '';
    this.productCatFilter = 'all';
    this.isAdminKeygenUnlocked = false;
    this.storageStatus = {
      isPersisted: false,
      usageMB: 0,
      quotaMB: 0
    };
  }

  async checkStoragePersistence() {
    if (navigator.storage && navigator.storage.persisted) {
      try {
        this.storageStatus.isPersisted = await navigator.storage.persisted();
      } catch {
        // Ignored
      }
    }

    if (navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        this.storageStatus.usageMB = ((estimate.usage || 0) / (1024 * 1024)).toFixed(2);
        this.storageStatus.quotaMB = ((estimate.quota || 0) / (1024 * 1024)).toFixed(0);
      } catch {
        // Ignored
      }
    }
  }

  async requestPersistence() {
    if (navigator.storage && navigator.storage.persist) {
      try {
        const isGranted = await navigator.storage.persist();
        this.storageStatus.isPersisted = isGranted;
        if (isGranted) {
          alert('✅ Bộ nhớ đã được BẢO VỆ BỀN VỮNG!\nTrình duyệt điện thoại sẽ không tự ý dọn dẹp dữ liệu của bạn khi thiếu dung lượng.');
        } else {
          alert('Trình duyệt chưa cấp quyền bền vững. Hãy cài app ra màn hình chính (Add to Home Screen) để hệ thống tự động ưu tiên lưu trữ bền vững.');
        }
        await this.render();
      } catch (err) {
        alert('Lỗi yêu cầu lưu trữ bền vững: ' + err.message);
      }
    }
  }

  async render() {
    await this.checkStoragePersistence();
    const container = document.getElementById('view-container');
    const shop = (await db.getSetting('shop_info')) || { ...DEFAULT_SHOP_SETTINGS };
    const snapshotsHtml = await this.app.backupModule.renderSnapshotsSection();
    const categories = await db.getCategories();
    const units = await db.getUnits();
    const warehouses = await db.getWarehouses();
    const products = await db.getAll('products');
    const licStatus = await licenseService.checkStatus();

    container.innerHTML = `
      <div class="view-header mb-2">
        <div class="header-title-row" style="flex-wrap: wrap; gap: 8px;">
          <div style="min-width: 0; flex: 1 1 180px;">
            <h1 class="view-title">⚙️ Cài Đặt Ứng Dụng</h1>
            <p class="view-subtitle">${escapeHTML(shop.shopName || 'Cửa hàng diều')} • Cấu hình & Dữ liệu</p>
          </div>
          <span class="badge ${this.storageStatus.isPersisted ? 'badge-success' : 'badge-warning'} text-xs" style="flex-shrink: 0; white-space: nowrap;">
            ${this.storageStatus.isPersisted ? '🛡️ Bộ nhớ an toàn' : '⚠️ Bộ nhớ chưa khóa'}
          </span>
        </div>
      </div>

      <!-- THANH ĐIỀU HƯỚNG TAB PHÂN NHÓM HIỆN ĐẠI (SEGMENTED TABS) -->
      <div class="settings-tabs-scroll">
        <button type="button" class="settings-pill-tab ${this.activeSettingSection === 'shop' ? 'active' : ''}" data-section="shop" style="white-space: nowrap;">
          <span class="tab-icon">🏪</span> Cửa Hàng & QR
        </button>
        <button type="button" class="settings-pill-tab ${this.activeSettingSection === 'catalog' ? 'active' : ''}" data-section="catalog" style="white-space: nowrap;">
          <span class="tab-icon">🏷️</span> Loại Diều & Hàng (${products.length})
        </button>
        <button type="button" class="settings-pill-tab ${this.activeSettingSection === 'backup' ? 'active' : ''}" data-section="backup" style="white-space: nowrap;">
          <span class="tab-icon">📥</span> Nạp & Sao Lưu
        </button>
        <button type="button" class="settings-pill-tab ${this.activeSettingSection === 'guide' ? 'active' : ''}" data-section="guide" style="white-space: nowrap;">
          <span class="tab-icon">📲</span> Cài App & Trợ Giúp
        </button>
        <button type="button" class="settings-pill-tab ${this.activeSettingSection === 'license' ? 'active' : ''}" data-section="license" style="white-space: nowrap;">
          <span class="tab-icon">🔑</span> Bản Quyền & Key
        </button>
      </div>

      <!-- ================= MỤC 1: CỬA HÀNG & MÃ QR ================= -->
      <div id="settings-sec-shop" class="settings-section-pane" style="display: ${this.activeSettingSection === 'shop' ? 'block' : 'none'};">
        <form id="settings-shop-form">
          <!-- Cấu Hình VietQR Chuyển Khoản (Offline) -->
          <div class="card p-3 mb-3" style="border: 1px solid #bae6fd; background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);">
            <h3 class="card-title text-sm mb-1">🏦 Cấu Hình VietQR Chuyển Khoản (Offline)</h3>
            <p class="text-xs text-muted mb-3">Tạo mã VietQR động chuẩn NAPAS 247 tự động điền sẵn số tiền & nội dung ngay cả khi không có mạng.</p>

            <div class="form-group mb-2">
              <label class="form-label text-xs text-bold" for="setting-bank-bin">Ngân hàng nhận tiền (NAPAS)</label>
              <select id="setting-bank-bin" class="form-select">
                <option value="">-- Chọn ngân hàng NAPAS --</option>
                ${NAPAS_BANKS.map(b => `
                  <option value="${escapeHTML(b.bin)}" ${shop.bankBin === b.bin ? 'selected' : ''}>
                    ${escapeHTML(b.shortName)} - ${escapeHTML(b.name)} (${escapeHTML(b.bin)})
                  </option>
                `).join('')}
              </select>
            </div>

            <div class="form-row mb-2" style="flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
              <div class="form-group mb-0" style="flex: 0 1 135px; min-width: 115px; margin-bottom: 0;">
                <label class="form-label text-xs text-bold" for="setting-bank-bin-code">Mã BIN (6 số)</label>
                <input type="text" id="setting-bank-bin-code" class="form-input" inputmode="numeric" maxlength="6" placeholder="VD: 970436" value="${escapeHTML(shop.bankBin || '')}">
                <span class="text-xs text-muted" style="font-size: 11px;">Tự điền theo ngân hàng</span>
              </div>
              <div class="form-group flex-1 mb-0" style="flex: 1 1 180px; min-width: 0; margin-bottom: 0;">
                <label class="form-label text-xs text-bold" for="setting-bank-account">Số tài khoản</label>
                <input type="text" id="setting-bank-account" class="form-input" placeholder="VD: 0123456789" value="${escapeHTML(shop.bankAccount || '')}">
              </div>
            </div>

            <div class="form-group mb-2">
              <label class="form-label text-xs text-bold" for="setting-bank-account-name">Tên chủ tài khoản</label>
              <input type="text" id="setting-bank-account-name" class="form-input" placeholder="VD: NGUYEN VAN A" value="${escapeHTML(shop.bankAccountName || '')}">
            </div>

            <div id="vietqr-settings-preview" class="mt-2" style="border: 1.5px dashed #38bdf8; border-radius: 12px; padding: 12px; background: #f0f9ff; text-align: center;"></div>
          </div>

          <!-- Logo & Mã QR Ảnh Tĩnh (Dự phòng) -->
          <div class="card p-3 mb-3">
            <h3 class="card-title text-sm mb-2">🖼️ Logo & QR Ảnh Tĩnh (Dự Phòng Tùy Chọn)</h3>
            <div class="shop-media-row" style="flex-wrap: wrap; gap: 12px;">
              <!-- Logo -->
              <div class="shop-media-col flex-1" style="flex: 1 1 135px; min-width: 0;">
                <label class="form-label text-bold text-xs mb-1">📷 Logo Cửa Hàng:</label>
                <div class="logo-preview-box" id="logo-preview-box">
                  ${shop.logo ? `
                    <img src="${shop.logo}" class="shop-logo-img" alt="Logo shop">
                    <button type="button" class="btn-remove-logo" id="btn-remove-logo" title="Xóa logo">&times;</button>
                  ` : `
                    <div class="logo-placeholder" id="logo-placeholder">
                      <span style="font-size: 22px;">📷</span>
                      <span class="text-xs">Chạm chọn ảnh</span>
                    </div>
                  `}
                </div>
                <input type="file" id="logo-file-input" accept="image/*" style="display:none">
                <span class="text-xs text-muted mt-1 d-block text-center">In trên báo giá & hóa đơn</span>
              </div>

              <!-- Mã QR ảnh tĩnh dự phòng -->
              <div class="shop-media-col flex-1" style="flex: 1 1 135px; min-width: 0;">
                <label class="form-label text-bold text-xs mb-1">📱 Mã QR Ảnh Tĩnh (Dự phòng):</label>
                <div class="qr-preview-box" id="qr-preview-box">
                  ${shop.qrCode ? `
                    <img src="${shop.qrCode}" class="shop-qr-img" id="shop-qr-preview-img" alt="Mã QR thanh toán">
                    <div class="qr-preview-actions mt-2" style="margin-top: 8px; gap: 6px;">
                      <button type="button" class="btn btn-outline-primary btn-xs" id="btn-zoom-settings-qr" style="white-space: nowrap;">🔍 Phóng to</button>
                      <button type="button" class="btn btn-outline-secondary btn-xs" id="btn-change-qr" style="white-space: nowrap;">Đổi</button>
                      <button type="button" class="btn btn-outline-danger btn-xs" id="btn-remove-qr" style="white-space: nowrap;">&times;</button>
                    </div>
                  ` : `
                    <div class="qr-placeholder" id="qr-placeholder">
                      <span style="font-size: 22px;">📱</span>
                      <span class="text-xs">Tải ảnh QR dự phòng</span>
                    </div>
                  `}
                </div>
                <input type="file" id="qr-file-input" accept="image/*" style="display:none">
                <span class="text-xs text-muted mt-1 d-block text-center">Tùy chọn dự phòng (MoMo / QR tĩnh)</span>
              </div>
            </div>
          </div>

          <!-- Thông tin cơ bản -->
          <div class="card p-3 mb-3">
            <h3 class="card-title text-sm mb-2">🏪 Thông Tin Cơ Bản</h3>

            <div class="form-group mb-2">
              <label class="form-label required text-xs text-bold">Tên cửa hàng diều</label>
              <input type="text" id="set-shop-name" class="form-input" required value="${escapeHTML(shop.shopName || '')}" placeholder="VD: Cửa Hàng Sáo Diều Trâm Anh">
            </div>

            <div class="form-row mb-2" style="flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
              <div class="form-group flex-1 mb-0" style="flex: 1 1 135px; min-width: 0; margin-bottom: 0;">
                <label class="form-label text-xs text-bold">Số điện thoại / Zalo</label>
                <input type="tel" id="set-phone" class="form-input" value="${escapeHTML(shop.phone || '')}" placeholder="09xx xxx xxx">
              </div>
              <div class="form-group flex-1 mb-0" style="flex: 1 1 135px; min-width: 0; margin-bottom: 0;">
                <label class="form-label text-xs text-bold">Hạn báo giá (ngày)</label>
                <input type="number" id="set-quote-days" class="form-input" min="1" max="90" value="${shop.quoteValidityDays || 7}">
              </div>
            </div>

            <div class="form-group mb-2">
              <label class="form-label text-xs text-bold">Địa chỉ cửa hàng / Bãi thả diều</label>
              <input type="text" id="set-address" class="form-input" value="${escapeHTML(shop.address || '')}" placeholder="VD: Bến thả diều Quận 2, TP.HCM">
            </div>

            <div class="form-group mb-0">
              <label class="form-label text-xs text-bold">Tài khoản ngân hàng / Nhận chuyển khoản</label>
              <input type="text" id="set-bank" class="form-input" placeholder="VD: Vietcombank - STK: 123456789 - NGUYEN VAN A" value="${escapeHTML(shop.bankInfo || '')}">
            </div>
          </div>

          <!-- Cài đặt VAT với iOS Switch Toggle -->
          <div class="card p-3 mb-3">
            <div class="d-flex justify-between align-center" style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
              <div style="min-width: 0; flex: 1;">
                <div class="text-bold text-sm">Có áp dụng thuế VAT?</div>
                <div class="text-xs text-muted">Tự động cộng thêm tiền VAT vào hóa đơn & báo giá</div>
              </div>
              <label class="ios-switch">
                <input type="checkbox" id="set-enable-vat" ${shop.enableVat ? 'checked' : ''}>
                <span class="ios-slider"></span>
              </label>
            </div>

            <div id="vat-rate-row" class="mt-3 pt-2 border-top" style="display: ${shop.enableVat ? 'flex' : 'none'}; align-items:center; justify-content:space-between; gap: 10px; margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border);">
              <span class="text-xs text-bold">Mức thuế VAT áp dụng:</span>
              <select id="set-vat-rate" class="form-select form-select-sm" style="width: 100px;">
                <option value="8" ${shop.vatRate === 8 ? 'selected' : ''}>8%</option>
                <option value="10" ${shop.vatRate === 10 ? 'selected' : ''}>10%</option>
              </select>
            </div>
          </div>

          <button type="submit" class="btn btn-primary btn-block btn-lg shadow-sm" style="border-radius: var(--radius-full); font-weight: 700; white-space: normal; text-align: center;">
            💾 Lưu Cài Đặt Cửa Hàng
          </button>
        </form>
      </div>

      <!-- ================= MỤC 2: QUẢN LÝ LOẠI DIỀU, MẶT HÀNG & ĐVT ================= -->
      <div id="settings-sec-catalog" class="settings-section-pane" style="display: ${this.activeSettingSection === 'catalog' ? 'block' : 'none'};">
        <div class="card p-3 mb-3 border-primary-subtle" id="catalog-management-card">
          <h3 class="card-title">🏷️ Quản Lý Loại Diều & Sửa Mặt Hàng</h3>
          <p class="text-muted text-xs mb-3">
            Tùy chỉnh phân loại diều, đổi tên mặt hàng tức thì và cấu hình đơn vị tính
          </p>

          <!-- Sub Tabs -->
          <div class="catalog-tabs-bar mb-3">
            <button type="button" class="catalog-tab-btn ${this.catalogTab === 'categories' ? 'active' : ''}" data-tab="categories" style="flex-shrink: 0;">
              🪁 Loại Diều (${categories.length})
            </button>
            <button type="button" class="catalog-tab-btn ${this.catalogTab === 'products' ? 'active' : ''}" data-tab="products" style="flex-shrink: 0;">
              📦 Sửa Mặt Hàng (${products.length})
            </button>
            <button type="button" class="catalog-tab-btn ${this.catalogTab === 'units' ? 'active' : ''}" data-tab="units" style="flex-shrink: 0;">
              📏 Đơn Vị Tính (${units.length})
            </button>
            <button type="button" class="catalog-tab-btn ${this.catalogTab === 'warehouses' ? 'active' : ''}" data-tab="warehouses" style="flex-shrink: 0;">
              🏭 Kho Hàng (${warehouses.length})
            </button>
          </div>

          <!-- Tab 1: Loại Diều -->
          <div id="catalog-tab-content-categories" style="display: ${this.catalogTab === 'categories' ? 'block' : 'none'};">
            ${this.renderCategoriesTabHtml(categories, products)}
          </div>

          <!-- Tab 2: Sửa Mặt Hàng -->
          <div id="catalog-tab-content-products" style="display: ${this.catalogTab === 'products' ? 'block' : 'none'};">
            ${this.renderProductsTabHtml(products, categories)}
          </div>

          <!-- Tab 3: Đơn Vị Tính -->
          <div id="catalog-tab-content-units" style="display: ${this.catalogTab === 'units' ? 'block' : 'none'};">
            ${this.renderUnitsTabHtml(units)}
          </div>

          <!-- Tab 4: Kho Hàng -->
          <div id="catalog-tab-content-warehouses" style="display: ${this.catalogTab === 'warehouses' ? 'block' : 'none'};">
            ${this.renderWarehousesTabHtml(warehouses, products)}
          </div>
        </div>
      </div>

      <!-- ================= MỤC 3: SAO LƯU DỮ LIỆU & BỘ NHỚ ================= -->
      <div id="settings-sec-backup" class="settings-section-pane" style="display: ${this.activeSettingSection === 'backup' ? 'block' : 'none'};">
        
        <!-- HỘP NẠP FILE SAO LƯU DỮ LIỆU NỔI BẬT DÀNH CHO MÁY MỚI / CHUYỂN MÁY -->
        <div class="card p-3 mb-3 restore-featured-box" style="background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%); border: 2px dashed #0284c7; border-radius: 14px;">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
            <div style="width: 44px; height: 44px; border-radius: 10px; background: #0284c7; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0;">
              📥
            </div>
            <div>
              <h3 class="text-bold text-primary" style="font-size: 15px; margin: 0 0 2px 0;">NẠP FILE SAO LƯU DỮ LIỆU VÀO MÁY NÀY</h3>
              <p class="text-xs text-muted" style="margin: 0; line-height: 1.35;">
                Nhận dữ liệu từ máy khác hoặc nạp lại bản sao lưu bạn đã cất trên <b>Zalo / Google Drive</b>.
              </p>
            </div>
          </div>
          <button type="button" class="btn btn-primary btn-block btn-lg" id="btn-featured-restore" style="font-weight: 700; font-size: 14px; padding: 12px; box-shadow: 0 3px 10px rgba(2, 132, 199, 0.3); white-space: normal; text-align: center; line-height: 1.35;">
            📂 BẤM ĐỂ CHỌN FILE SAO LƯU (.JSON)
          </button>
        </div>

        <!-- Thẻ an toàn bộ nhớ -->
        <div class="card p-3 mb-3" style="background: linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%); border: 1px solid #bae6fd;">
          <div class="d-flex justify-between align-center mb-2" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 8px;">
            <div class="d-flex align-center gap-2" style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1 1 190px;">
              <span style="font-size: 24px; flex-shrink: 0;">🛡️</span>
              <div style="min-width: 0;">
                <div class="text-bold text-sm">Trạng Thái Lưu Trữ Trong Máy</div>
                <div class="text-xs text-muted">
                  ${this.storageStatus.isPersisted ? 'Đã bật lưu trữ bền vững (Trình duyệt không tự xóa)' : 'Chưa bật khóa lưu trữ bền vững'}
                </div>
              </div>
            </div>
            ${!this.storageStatus.isPersisted ? `
              <button id="btn-request-persist" class="btn btn-outline-primary btn-xs" style="flex-shrink: 0; white-space: nowrap;">Bật Khóa</button>
            ` : `
              <span class="badge badge-success text-xs" style="flex-shrink: 0; white-space: nowrap;">An Toàn</span>
            `}
          </div>
          <div class="text-xs text-muted">
            Sao lưu gần nhất: <b>${shop.lastBackupTime ? formatDateTime(shop.lastBackupTime) : 'Chưa sao lưu'}</b>
            ${shop.unbackedChangesCount > 0 ? `• <span class="text-danger text-bold">Có ${shop.unbackedChangesCount} thay đổi mới</span>` : ''}
            • Dung lượng: <b>${this.storageStatus.usageMB} MB</b> / ${this.storageStatus.quotaMB} MB
          </div>
        </div>

        <!-- 4 Nút Hành Động Sao Lưu -->
        <div class="card p-3 mb-3">
          <h3 class="card-title text-sm mb-3">💾 Thao Tác Sao Lưu & Khôi Phục</h3>
          <div class="backup-actions-grid">
            <div id="btn-do-backup" class="backup-btn-card">
              <span class="backup-btn-icon">💾</span>
              <span class="backup-btn-title text-primary">SAO LƯU FILE</span>
              <span class="backup-btn-sub">Gửi Zalo / Drive</span>
            </div>
            <div id="btn-do-restore" class="backup-btn-card">
              <span class="backup-btn-icon">🔄</span>
              <span class="backup-btn-title text-warning-dark">KHÔI PHỤC</span>
              <span class="backup-btn-sub">Từ file JSON</span>
            </div>
            <div id="btn-do-excel-all" class="backup-btn-card">
              <span class="backup-btn-icon">📊</span>
              <span class="backup-btn-title text-success-dark">XUẤT EXCEL</span>
              <span class="backup-btn-sub">Toàn bộ dữ liệu</span>
            </div>
            <div id="btn-open-trash" class="backup-btn-card">
              <span class="backup-btn-icon">🗑️</span>
              <span class="backup-btn-title text-muted">THÙNG RÁC</span>
              <span class="backup-btn-sub">Mục đã xóa</span>
            </div>
          </div>
        </div>

        <!-- Lối tắt nghiệp vụ -->
        <div class="card p-3 mb-3">
          <h3 class="card-title text-sm mb-2">⚡ Lối Tắt Nhanh</h3>
          <div class="d-flex gap-2" style="display: flex; flex-wrap: wrap; gap: 8px;">
            <button id="btn-shortcut-reports" class="btn btn-outline-primary btn-sm flex-1 text-left" style="display:flex; justify-content:space-between; align-items:center; flex: 1 1 160px; min-width: 0; white-space: normal; text-align: left;">
              <span>📊 Báo Cáo Doanh Thu</span>
              <span>➔</span>
            </button>
            <button id="btn-shortcut-inventory" class="btn btn-outline-secondary btn-sm flex-1 text-left" style="display:flex; justify-content:space-between; align-items:center; flex: 1 1 160px; min-width: 0; white-space: normal; text-align: left;">
              <span>📦 Kho Diều & Nhập</span>
              <span>➔</span>
            </button>
          </div>
        </div>

        <!-- Bản chụp cứu hộ 7 ngày -->
        <div class="card p-3 mb-3">
          <h3 class="card-title text-sm mb-1">🕒 Bản Chụp Cứu Hộ Tự Động (7 Ngày)</h3>
          <p class="text-xs text-muted mb-2">
            Tự động chụp mỗi ngày khi mở app để bạn cứu dữ liệu nếu bấm nhầm:
          </p>
          <div id="snapshots-container">
            ${snapshotsHtml}
          </div>
        </div>
      </div>

      <!-- ================= MỤC 4: HƯỚNG DẪN CÀI ĐẶT & TRỢ GIÚP ================= -->
      <div id="settings-sec-guide" class="settings-section-pane" style="display: ${this.activeSettingSection === 'guide' ? 'block' : 'none'};">
        <!-- Hướng dẫn Cài App -->
        <div class="card p-3 mb-3">
          <h3 class="card-title text-sm mb-2">📲 Cài Đặt Ra Màn Hình Chính (PWA)</h3>
          <p class="text-xs text-muted mb-3">
            Cài app ra màn hình chính giúp mở dùng tức thì như ứng dụng gốc, bảo vệ dữ liệu bền vững và chạy offline 100% không cần mạng:
          </p>

          <!-- Tab chọn nền tảng -->
          <div class="guide-platform-tabs mb-3">
            <button type="button" class="guide-tab-btn ${this.guidePlatform === 'ios' ? 'active' : ''}" data-platform="ios">
              <span>🍏</span> iPhone / iPad (Safari)
            </button>
            <button type="button" class="guide-tab-btn ${this.guidePlatform === 'android' ? 'active' : ''}" data-platform="android">
              <span>🤖</span> Android (Chrome)
            </button>
          </div>

          <!-- Các bước iOS -->
          <div id="guide-platform-ios" style="display: ${this.guidePlatform === 'ios' ? 'block' : 'none'};">
            <div class="guide-steps-grid">
              <div class="guide-step-card">
                <div class="guide-step-num">1</div>
                <div class="guide-step-content">
                  Mở trình duyệt <b>Safari</b> trên iPhone / iPad và vào trang web bán diều này.
                </div>
              </div>
              <div class="guide-step-card">
                <div class="guide-step-num">2</div>
                <div class="guide-step-content">
                  Bấm nút <b>Chia sẻ</b> <i>(biểu tượng hình vuông có mũi tên hướng lên ở thanh dưới)</i>.
                </div>
              </div>
              <div class="guide-step-card">
                <div class="guide-step-num">3</div>
                <div class="guide-step-content">
                  Cuộn xuống và chọn <b>"Thêm vào Màn hình chính" (Add to Home Screen)</b>.
                </div>
              </div>
              <div class="guide-step-card" style="border-left: 3px solid #10b981;">
                <div class="guide-step-num" style="background: #d1fae5; color: #059669;">✓</div>
                <div class="guide-step-content">
                  <b>Hoàn tất!</b> Luôn mở app từ biểu tượng con diều ngoài màn hình chính để iOS giữ dữ liệu vĩnh viễn không bị dọn dẹp.
                </div>
              </div>
            </div>
          </div>

          <!-- Các bước Android -->
          <div id="guide-platform-android" style="display: ${this.guidePlatform === 'android' ? 'block' : 'none'};">
            <div class="guide-steps-grid">
              <div class="guide-step-card">
                <div class="guide-step-num">1</div>
                <div class="guide-step-content">
                  Mở trình duyệt <b>Google Chrome</b> trên điện thoại Android của bạn.
                </div>
              </div>
              <div class="guide-step-card">
                <div class="guide-step-num">2</div>
                <div class="guide-step-content">
                  Bấm vào <b>menu 3 chấm (⋮)</b> ở góc trên bên phải màn hình Chrome.
                </div>
              </div>
              <div class="guide-step-card">
                <div class="guide-step-num">3</div>
                <div class="guide-step-content">
                  Chọn <b>"Cài đặt ứng dụng"</b> hoặc <b>"Thêm vào Màn hình chính"</b>.
                </div>
              </div>
              <div class="guide-step-card" style="border-left: 3px solid #10b981;">
                <div class="guide-step-num" style="background: #d1fae5; color: #059669;">✓</div>
                <div class="guide-step-content">
                  <b>Thành công!</b> Biểu tượng ứng dụng diều sẽ nằm ngoài màn hình, bấm mở dùng siêu mượt mọi lúc.
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Dữ liệu mẫu & Khởi tạo -->
        <div class="card p-3 mb-3">
          <h3 class="card-title text-sm mb-2">🧪 Dữ Liệu Mẫu & Khởi Tạo</h3>
          <p class="text-xs text-muted mb-3">
            Nạp sẵn 6 loại diều, 3 khách hàng và đơn mẫu để làm quen cách dùng app. Khi bắt đầu bán thật hãy bấm xóa trắng dữ liệu thử.
          </p>
          <div class="d-flex gap-2" style="display: flex; flex-wrap: wrap; gap: 8px;">
            <button type="button" id="btn-load-sample-data" class="btn btn-outline-primary btn-sm flex-1" style="flex: 1 1 130px; white-space: nowrap;">
              Nạp Dữ Liệu Mẫu
            </button>
            <button type="button" id="btn-clear-sample-data" class="btn btn-outline-danger btn-sm flex-1" style="flex: 1 1 130px; white-space: nowrap;">
              Xóa Dữ Liệu Thử
            </button>
          </div>
        </div>
      </div>

      <!-- ================= MỤC 5: BẢN QUYỀN & CẤP KEY ================= -->
      <div id="settings-sec-license" class="settings-section-pane" style="display: ${this.activeSettingSection === 'license' ? 'block' : 'none'};">
        ${this.renderLicenseSection(licStatus, shop)}
      </div>
    `;

    this.bindEvents(shop, categories, products, units, licStatus, warehouses);
  }

  bindEvents(shop, categories, products, units, licStatus, warehouses = []) {
    // 1. Chuyển đổi các mục cài đặt chính (Cửa hàng, Loại & Hàng, Sao lưu, Cài App, Bản quyền)
    document.querySelectorAll('.settings-pill-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const sec = btn.dataset.section;
        this.activeSettingSection = sec;
        document.querySelectorAll('.settings-pill-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        ['shop', 'catalog', 'backup', 'guide', 'license'].forEach(s => {
          const el = document.getElementById(`settings-sec-${s}`);
          if (el) el.style.display = (s === sec) ? 'block' : 'none';
        });
      });
    });

    // 2. Chuyển đổi nền tảng hướng dẫn (iOS / Android)
    document.querySelectorAll('.guide-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const platform = btn.dataset.platform;
        this.guidePlatform = platform;
        document.querySelectorAll('.guide-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const iosEl = document.getElementById('guide-platform-ios');
        const androidEl = document.getElementById('guide-platform-android');
        if (iosEl) iosEl.style.display = (platform === 'ios') ? 'block' : 'none';
        if (androidEl) androidEl.style.display = (platform === 'android') ? 'block' : 'none';
      });
    });

    // 3. Quản lý Loại diều, Sửa mặt hàng, Đơn vị tính, Kho hàng
    this.bindCatalogEvents(categories, products, units, warehouses);

    // Lưu thông tin shop
    const form = document.getElementById('settings-shop-form');
    let logoBase64 = shop.logo || '';
    let qrCodeBase64 = shop.qrCode || '';

    // 1. Quản lý ảnh Logo
    const logoPreviewBox = document.getElementById('logo-preview-box');
    const logoFileInput = document.getElementById('logo-file-input');

    if (logoPreviewBox) {
      logoPreviewBox.addEventListener('click', (e) => {
        if (e.target.id === 'btn-remove-logo') return;
        logoFileInput.click();
      });
    }

    if (logoFileInput) {
      logoFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
          try {
            logoBase64 = await compressImage(file, 400, 0.8);
            logoPreviewBox.innerHTML = `
              <img src="${logoBase64}" class="shop-logo-img" alt="Logo shop">
              <button type="button" class="btn-remove-logo" id="btn-remove-logo">&times;</button>
            `;
            document.getElementById('btn-remove-logo').addEventListener('click', (ev) => {
              ev.stopPropagation();
              logoBase64 = '';
              logoPreviewBox.innerHTML = `<div class="logo-placeholder"><span>📷 Chạm để chọn ảnh logo</span></div>`;
            });
          } catch (err) {
            alert('Lỗi nén ảnh logo: ' + err.message);
          }
        }
      });
    }

    const removeLogoBtn = document.getElementById('btn-remove-logo');
    if (removeLogoBtn) {
      removeLogoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        logoBase64 = '';
        logoPreviewBox.innerHTML = `<div class="logo-placeholder"><span>📷 Chạm để chọn ảnh logo</span></div>`;
      });
    }

    // 2. Quản lý ảnh Mã QR Thanh Toán
    const qrPreviewBox = document.getElementById('qr-preview-box');
    const qrFileInput = document.getElementById('qr-file-input');

    const renderQrPreview = () => {
      if (!qrPreviewBox) return;
      if (qrCodeBase64) {
        qrPreviewBox.innerHTML = `
          <img src="${qrCodeBase64}" class="shop-qr-img" id="shop-qr-preview-img" alt="Mã QR thanh toán">
          <div class="qr-preview-actions mt-2" style="margin-top: 8px; gap: 6px;">
            <button type="button" class="btn btn-outline-danger btn-xs" id="btn-remove-qr" style="white-space: nowrap;">🗑️ Xóa mã QR</button>
            <button type="button" class="btn btn-outline-primary btn-xs" id="btn-zoom-settings-qr" style="white-space: nowrap;">🔍 Xem phóng to</button>
            <button type="button" class="btn btn-outline-secondary btn-xs" id="btn-change-qr" style="white-space: nowrap;">🔄 Đổi ảnh khác</button>
          </div>
        `;
        document.getElementById('btn-remove-qr')?.addEventListener('click', (ev) => {
          ev.stopPropagation();
          qrCodeBase64 = '';
          renderQrPreview();
        });
        document.getElementById('btn-zoom-settings-qr')?.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.app.salesModule.showFullScreenQrModal(qrCodeBase64, shop.bankInfo || '', 0);
        });
        document.getElementById('btn-change-qr')?.addEventListener('click', (ev) => {
          ev.stopPropagation();
          qrFileInput.click();
        });
      } else {
        qrPreviewBox.innerHTML = `
          <div class="qr-placeholder" id="qr-placeholder">
            <div style="font-size: 32px; margin-bottom: 4px;">📱</div>
            <span class="text-bold text-sm">Chạm vào đây để chọn ảnh mã QR</span>
            <span class="text-xs text-muted mt-1">(Tải ảnh chụp mã QR từ app ngân hàng hoặc MoMo của bạn)</span>
          </div>
        `;
        document.getElementById('qr-placeholder')?.addEventListener('click', () => {
          qrFileInput.click();
        });
      }
    };

    if (qrPreviewBox) {
      qrPreviewBox.addEventListener('click', (e) => {
        if (e.target.closest('#btn-remove-qr') || e.target.closest('#btn-zoom-settings-qr') || e.target.closest('#btn-change-qr')) {
          return;
        }
        qrFileInput.click();
      });
    }

    if (qrFileInput) {
      qrFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
          try {
            qrCodeBase64 = await compressImage(file, 600, 0.85);
            renderQrPreview();
          } catch (err) {
            alert('Lỗi nén ảnh mã QR: ' + err.message);
          }
        }
      });
    }

    // Gán sự kiện ban đầu cho nút QR (nếu đã có QR từ trước)
    document.getElementById('btn-remove-qr')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      qrCodeBase64 = '';
      renderQrPreview();
    });
    document.getElementById('btn-zoom-settings-qr')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.app.salesModule.showFullScreenQrModal(qrCodeBase64, shop.bankInfo || '', 0);
    });
    document.getElementById('btn-change-qr')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      qrFileInput.click();
    });

    // 2b. Cấu hình VietQR Offline & Live Preview
    const binSelect = document.getElementById('setting-bank-bin');
    const binCodeInp = document.getElementById('setting-bank-bin-code');
    const bankAccountInp = document.getElementById('setting-bank-account');
    const bankAccountNameInp = document.getElementById('setting-bank-account-name');
    const bankInfoInp = document.getElementById('set-bank');

    const getVietQRDraft = () => {
      const cleanBin = (binCodeInp?.value || binSelect?.value || '').replace(/\D/g, '').slice(0, 6);
      const bankObj = NAPAS_BANKS.find(b => b.bin === cleanBin);
      const bankName = bankObj ? bankObj.shortName : (cleanBin ? (shop.bankName || `BIN ${cleanBin}`) : '');
      const bankAccount = (bankAccountInp?.value || '').trim();
      const bankAccountName = (bankAccountNameInp?.value || '').trim();
      return {
        bankBin: cleanBin,
        bankName,
        bankAccount,
        bankAccountName
      };
    };

    const buildAutoBankInfo = (draft) => {
      if (!draft.bankName && !draft.bankAccount) return '';
      return [
        draft.bankName,
        draft.bankAccount ? `STK: ${draft.bankAccount}` : '',
        draft.bankAccountName ? draft.bankAccountName.toUpperCase() : ''
      ].filter(Boolean).join(' - ');
    };

    let lastAutoBankInfo = buildAutoBankInfo({
      bankName: shop.bankName || (NAPAS_BANKS.find(b => b.bin === shop.bankBin)?.shortName || ''),
      bankAccount: shop.bankAccount || '',
      bankAccountName: shop.bankAccountName || ''
    });

    const syncBankInfoField = (draft) => {
      if (!bankInfoInp) return;
      const currentVal = bankInfoInp.value.trim();
      const nextAuto = buildAutoBankInfo(draft);
      if (!currentVal || currentVal === lastAutoBankInfo) {
        bankInfoInp.value = nextAuto;
      }
      lastAutoBankInfo = nextAuto;
    };

    const renderVietQRSettingsPreview = () => {
      const previewEl = document.getElementById('vietqr-settings-preview');
      if (!previewEl) return;
      const draft = getVietQRDraft();
      if (!hasVietQRConfig(draft)) {
        previewEl.innerHTML = `
          <div class="text-xs text-muted" style="line-height: 1.5;">
            📲 <b>Xem trước VietQR Offline:</b> Chọn ngân hàng NAPAS (hoặc nhập 6 số BIN) và nhập Số tài khoản để tạo mã QR thử nghiệm ngay tại đây.
          </div>
        `;
        return;
      }

      try {
        const testDesc = 'TEST VIETQR CUA HANG';
        const qrInfo = resolveOrderQR(draft, 0, testDesc);
        if (!qrInfo || !qrInfo.dataUrl) {
          previewEl.innerHTML = `<div class="text-xs text-danger">Không thể tạo mã VietQR. Vui lòng kiểm tra lại BIN (6 chữ số) và số tài khoản.</div>`;
          return;
        }
        const infoLine = [
          qrInfo.bankLabel || draft.bankName,
          qrInfo.account || draft.bankAccount,
          qrInfo.accountName || draft.bankAccountName
        ].filter(Boolean).join(' • ');
        const normDesc = qrInfo.normalizedDesc || normalizeTransferContent(testDesc);
        previewEl.innerHTML = `
          <div class="text-xs text-bold text-primary mb-2">👁️ Xem Trước Mã VietQR (100% Offline)</div>
          <div style="display: inline-block; background: #fff; padding: 8px; border-radius: 10px; border: 1px solid #bae6fd;">
            <img src="${qrInfo.dataUrl}" alt="VietQR Preview" style="width: 168px; height: 168px; object-fit: contain; display: block;">
          </div>
          <div class="text-xs text-bold mt-2">${escapeHTML(infoLine)}</div>
          <div class="text-xs text-muted mt-1">Nội dung thử: <code>${escapeHTML(normDesc)}</code></div>
          <div class="mt-2" style="display: flex; justify-content: center; gap: 8px; flex-wrap: wrap;">
            <button type="button" class="btn btn-outline-primary btn-xs" id="btn-zoom-vietqr-preview">🔍 Phóng to quét thử</button>
          </div>
          <div class="text-xs text-success mt-1">✅ Quét thử bằng app ngân hàng để kiểm tra trước khi lưu!</div>
        `;
        document.getElementById('btn-zoom-vietqr-preview')?.addEventListener('click', () => {
          this.app.salesModule.showFullScreenQrModal(qrInfo.dataUrl, infoLine, 0);
        });
      } catch (err) {
        previewEl.innerHTML = `<div class="text-xs text-danger">Lỗi tạo VietQR: ${escapeHTML(err.message)}</div>`;
      }
    };

    if (binSelect) {
      binSelect.addEventListener('change', () => {
        if (binCodeInp) binCodeInp.value = binSelect.value;
        const draft = getVietQRDraft();
        syncBankInfoField(draft);
        renderVietQRSettingsPreview();
      });
    }

    if (binCodeInp) {
      binCodeInp.addEventListener('input', () => {
        const digits = binCodeInp.value.replace(/\D/g, '').slice(0, 6);
        if (binCodeInp.value !== digits) binCodeInp.value = digits;
        if (binSelect) {
          binSelect.value = NAPAS_BANKS.some(b => b.bin === digits) ? digits : '';
        }
        const draft = getVietQRDraft();
        syncBankInfoField(draft);
        renderVietQRSettingsPreview();
      });
    }

    [bankAccountInp, bankAccountNameInp].forEach(el => {
      if (!el) return;
      el.addEventListener('input', () => {
        const draft = getVietQRDraft();
        syncBankInfoField(draft);
        renderVietQRSettingsPreview();
      });
    });

    renderVietQRSettingsPreview();

    // Toggle VAT
    const vatCheckbox = document.getElementById('set-enable-vat');
    const vatRateRow = document.getElementById('vat-rate-row');
    if (vatCheckbox && vatRateRow) {
      vatCheckbox.addEventListener('change', () => {
        vatRateRow.style.display = vatCheckbox.checked ? 'flex' : 'none';
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const shopName = document.getElementById('set-shop-name').value.trim();
        if (!shopName) return alert('Vui lòng nhập tên cửa hàng');

        const draft = getVietQRDraft();
        if ((draft.bankAccount && draft.bankBin.length !== 6) || (draft.bankBin && draft.bankBin.length !== 6)) {
          return alert('Mã BIN ngân hàng NAPAS phải gồm đúng 6 chữ số (vui lòng chọn ngân hàng hoặc nhập đủ 6 số BIN).');
        }

        const updatedShop = {
          ...shop,
          shopName,
          phone: document.getElementById('set-phone').value.trim(),
          address: document.getElementById('set-address').value.trim(),
          bankInfo: document.getElementById('set-bank').value.trim(),
          bankBin: draft.bankBin,
          bankName: draft.bankName,
          bankAccount: draft.bankAccount,
          bankAccountName: draft.bankAccountName,
          quoteValidityDays: parseInt(document.getElementById('set-quote-days').value, 10) || 7,
          enableVat: vatCheckbox ? vatCheckbox.checked : false,
          vatRate: parseInt(document.getElementById('set-vat-rate').value, 10) || 8,
          logo: logoBase64,
          qrCode: qrCodeBase64
        };

        await db.saveSetting('shop_info', updatedShop);
        Object.assign(shop, updatedShop);
        alert('✓ Đã lưu cài đặt cửa hàng & mã QR thành công!');
        this.app.updateHeaderBrand();
      });
    }

    // Lối tắt nghiệp vụ Báo cáo & Kho hàng
    const btnShortcutReports = document.getElementById('btn-shortcut-reports');
    if (btnShortcutReports) {
      btnShortcutReports.addEventListener('click', () => this.app.navigateTo('reports'));
    }

    const btnShortcutInventory = document.getElementById('btn-shortcut-inventory');
    if (btnShortcutInventory) {
      btnShortcutInventory.addEventListener('click', () => this.app.navigateTo('inventory'));
    }

    // Các nút Sao lưu / Khôi phục
    const btnFeaturedRestore = document.getElementById('btn-featured-restore');
    if (btnFeaturedRestore) {
      btnFeaturedRestore.addEventListener('click', () => {
        this.app.backupModule.promptRestoreFile();
      });
    }

    document.getElementById('btn-do-backup').addEventListener('click', () => {
      this.app.backupModule.exportBackupFile();
    });

    document.getElementById('btn-do-restore').addEventListener('click', () => {
      this.app.backupModule.promptRestoreFile();
    });

    document.getElementById('btn-do-excel-all').addEventListener('click', () => {
      this.app.backupModule.exportAllDataToExcel();
    });

    document.getElementById('btn-open-trash').addEventListener('click', () => {
      this.app.backupModule.showTrashModal();
    });

    // Yêu cầu lưu trữ bền vững
    const reqPersistBtn = document.getElementById('btn-request-persist');
    if (reqPersistBtn) {
      reqPersistBtn.addEventListener('click', () => this.requestPersistence());
    }

    // Khôi phục snapshot
    document.querySelectorAll('.btn-restore-snapshot').forEach(btn => {
      btn.addEventListener('click', () => {
        this.app.backupModule.restoreFromSnapshot(btn.dataset.id);
      });
    });

    // Nạp dữ liệu mẫu
    document.getElementById('btn-load-sample-data').addEventListener('click', async () => {
      if (confirm('Bạn có muốn nạp dữ liệu mẫu gồm 6 loại diều, 3 khách hàng và đơn mẫu không?')) {
        await this.loadSampleData();
      }
    });

    // Xóa trắng dữ liệu thử
    document.getElementById('btn-clear-sample-data').addEventListener('click', async () => {
      const confirmText = prompt('CẢNH BÁO: Thao tác này sẽ xóa toàn bộ sản phẩm, khách hàng, đơn hàng và kho.\n(Một bản chụp cứu hộ sẽ được tự động tạo trước khi xóa).\n\nĐể xác nhận, hãy nhập chữ "XOA" vào ô bên dưới:');
      if (confirmText === 'XOA') {
        await db.clearAllBusinessData();
        alert('Đã xóa trắng dữ liệu thành công!');
        window.location.reload();
      }
    });

    // 4. Sự kiện mục Bản quyền & Cấp key
    this.bindLicenseEvents(licStatus);
  }

  // ================= MỤC 5: BẢN QUYỀN =================
  renderLicenseSection(licStatus, shop) {
    const isLicensed = licStatus.status === 'licensed';
    const isTrial = licStatus.status === 'trial';
    const countdownInitial = licStatus.countdownText || '';

    return `
      <!-- THÔNG TIN BẢN QUYỀN MÁY NÀY -->
      <div class="card p-3 mb-3" style="border: 1.5px solid ${isLicensed ? '#22c55e' : (isTrial ? '#f59e0b' : '#ef4444')}; border-radius: 14px;">
        <div class="d-flex justify-between align-center mb-2" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;">
          <div class="d-flex align-center gap-2" style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0;">
            <h3 class="card-title text-sm mb-0" style="margin: 0; line-height: 1.25;">🔑 Trạng Thái Bản Quyền</h3>
            <button type="button" class="btn btn-outline-secondary btn-xs" id="btn-settings-dev-key" style="font-weight: 800; font-family: monospace; font-size: 11px; padding: 3px 8px; min-height: 24px; border-radius: 6px; letter-spacing: 0.5px; line-height: 1.2; white-space: nowrap; flex-shrink: 0;">
              DEV KEY
            </button>
          </div>
          <span class="badge ${isLicensed ? 'badge-success' : (isTrial ? 'badge-warning' : 'badge-danger')}" style="flex-shrink: 0; white-space: nowrap;">
            ${isLicensed ? '✅ Đã Kích Hoạt' : (isTrial ? `🎁 Dùng Thử` : '⚠️ Hết Hạn')}
          </span>
        </div>

        <!-- ĐỒNG HỒ ĐẾM NGƯỢC THỜI HẠN CHI TIẾT ĐẾN TỪNG GIÂY (NGÀY - GIỜ - PHÚT - GIÂY) -->
        <div class="card p-2 mb-2 text-center" style="border: 1.5px solid ${isLicensed ? '#86efac' : '#fed7aa'}; border-radius: 10px; background: ${isLicensed ? '#f0fdf4' : '#fffbeb'};">
          <div class="text-xs text-muted mb-1 font-bold">
            ${isLicensed && licStatus.isLifetime ? '🌟 THỜI HẠN BẢN QUYỀN:' : '⏳ THỜI GIAN CÒN LẠI (NGÀY - GIỜ - PHÚT - GIÂY):'}
          </div>
          <div class="text-bold text-primary" id="live-license-countdown" style="font-family: monospace; font-size: 15px; letter-spacing: 0.5px; color: ${isLicensed ? '#15803d' : '#c2410c'};">
            ${countdownInitial}
          </div>
        </div>

        <div class="card p-2 bg-light mb-2">
          <div class="text-xs text-muted font-bold">MÃ THIẾT BỊ NÀY (DEVICE ID):</div>
          <div class="d-flex align-center justify-between mt-1" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-top: 4px;">
            <span class="text-bold text-primary" style="font-family: monospace; font-size: 15px; word-break: break-all;">${licStatus.deviceId}</span>
            <button type="button" class="btn btn-outline-primary btn-xs" id="btn-copy-settings-device-id" style="flex-shrink: 0; white-space: nowrap;">📋 Sao chép</button>
          </div>
          <div class="text-xs text-muted mt-1">Gửi mã này cho người bán để nhận mã kích hoạt bản quyền.</div>
        </div>

        <div class="text-xs mb-3" style="line-height: 1.7;">
          <div>• Gói bản quyền: <b>${escapeHTML(licStatus.planName)}</b></div>
          <div>• Hạn dùng: <b>${escapeHTML(licStatus.expiryText)}</b></div>
          ${licStatus.licenseKey ? `<div>• Mã key: <code class="text-xs">${escapeHTML(licStatus.licenseKey)}</code></div>` : ''}
        </div>

        <button type="button" class="btn btn-primary btn-block btn-sm" id="btn-open-activate-modal" style="font-weight: 700; white-space: normal; text-align: center; line-height: 1.35;">
          🔑 Nhập Mã Kích Hoạt Mới / Gia Hạn
        </button>

        <div class="mt-3 pt-2 text-center text-xs text-muted" style="border-top: 1px dashed var(--border);">
          📞 Hỗ trợ kích hoạt & Gia hạn: <b>${escapeHTML(shop.phone || 'Liên hệ người bán')}</b>
        </div>
      </div>
    `;
  }

  bindLicenseEvents(licStatus) {
    // 1. Sao chép mã máy
    const btnCopyDev = document.getElementById('btn-copy-settings-device-id');
    if (btnCopyDev) {
      btnCopyDev.addEventListener('click', () => {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(licStatus.deviceId).then(() => {
            alert('✓ Đã sao chép mã thiết bị: ' + licStatus.deviceId);
          });
        } else {
          prompt('Mã thiết bị của bạn:', licStatus.deviceId);
        }
      });
    }

    // 2. Mở popup nhập key mới
    const btnOpenAct = document.getElementById('btn-open-activate-modal');
    if (btnOpenAct) {
      btnOpenAct.addEventListener('click', () => {
        licenseService.showLockModal(async () => {
          await this.render();
        });
      });
    }

    // 3. Nút DEV KEY để mở bộ cấp key bản quyền
    const btnDevKey = document.getElementById('btn-settings-dev-key');
    if (btnDevKey) {
      btnDevKey.addEventListener('click', () => {
        const pin = prompt('Nhập mã xác thực DEV KEY:');
        if (!pin) return;
        licenseService.checkAdminPin(pin).then(ok => {
          if (ok) {
            licenseService.showAdminKeygenModal();
          } else {
            alert('Mã xác thực DEV KEY không hợp lệ.');
          }
        });
      });
    }

    // 4. Đồng hồ đếm ngược chạy chi tiết ngày, giờ, phút, giây trực tiếp
    if (licStatus.expiresAt && !licStatus.isLifetime) {
      if (this.countdownInterval) clearInterval(this.countdownInterval);
      this.countdownInterval = setInterval(() => {
        const cdEl = document.getElementById('live-license-countdown');
        if (!cdEl) {
          clearInterval(this.countdownInterval);
          return;
        }
        const text = formatRemainingCountdown(licStatus.expiresAt);
        cdEl.textContent = text;
        if (text.includes('Hết hạn')) {
          clearInterval(this.countdownInterval);
          window.location.reload();
        }
      }, 1000);
    }
  }

  // ================= QUẢN LÝ LOẠI DIỀU, SỬA MẶT HÀNG & ĐVT =================
  renderCategoriesTabHtml(categories, products) {
    return `
      <div class="catalog-tab-pane">
        <div class="catalog-intro-box mb-3">
          <div class="text-xs text-muted">
            💡 <b>Quy tắc đồng bộ thông minh:</b> Khi bạn đổi tên một loại diều (ví dụ từ <i>"Diều khí động học"</i> sang <i>"Diều dù không xương"</i>), toàn bộ các mặt hàng đang thuộc loại này sẽ được hệ thống <b>tự động cập nhật</b> theo tên mới ngay lập tức.
          </div>
        </div>

        <div class="catalog-add-form mb-3">
          <label class="form-label text-bold">Thêm loại diều mới:</label>
          <div class="input-with-button-row" style="gap: 8px;">
            <input type="text" id="input-new-category" class="form-input" style="min-width: 0;" placeholder="VD: Diều nan carbon, Diều led đêm, Diều mini..." maxlength="50">
            <button type="button" id="btn-add-category" class="btn btn-primary" style="flex-shrink: 0; white-space: nowrap;">
              <span>+</span> Thêm Loại
            </button>
          </div>
        </div>

        <div class="categories-list-header mb-2 d-flex justify-between align-center" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
          <span class="text-xs text-muted text-bold">DANH SÁCH LOẠI DIỀU (${categories.length})</span>
          <button type="button" id="btn-reset-categories" class="btn btn-link text-xs text-muted p-0" style="background: transparent; border: none; padding: 4px 6px; min-height: auto; font-weight: 600; white-space: nowrap;">
            🔄 Khôi phục mặc định
          </button>
        </div>

        <div class="categories-list-container">
          ${categories.map(cat => {
            const prodCount = products.filter(p => p.category === cat).length;
            return `
              <div class="catalog-item-card" style="flex-wrap: wrap; gap: 10px;">
                <div class="catalog-item-info" style="flex: 1 1 160px; min-width: 0;">
                  <span class="catalog-item-icon">🪁</span>
                  <div class="catalog-item-main">
                    <div class="catalog-item-title">${escapeHTML(cat)}</div>
                    <div class="catalog-item-subtitle text-xs text-muted">
                      ${prodCount > 0 ? `<b>${prodCount}</b> sản phẩm đang dùng` : 'Chưa có sản phẩm'}
                    </div>
                  </div>
                </div>
                <div class="catalog-item-actions" style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-left: auto;">
                  <button type="button" class="btn btn-outline-primary btn-xs btn-rename-cat" style="white-space: nowrap;" data-name="${escapeHTML(cat)}">
                    ✏️ Đổi tên
                  </button>
                  <button type="button" class="btn btn-outline-danger btn-xs btn-delete-cat" style="white-space: nowrap;" data-name="${escapeHTML(cat)}" data-count="${prodCount}">
                    🗑️ Xóa
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  renderProductsTabHtml(products, categories) {
    const q = (this.productSearchQuery || '').toLowerCase().trim();
    const catFilter = this.productCatFilter || 'all';

    const filtered = products.filter(p => {
      const matchCat = catFilter === 'all' || p.category === catFilter;
      const matchQuery = !q ||
        p.name.toLowerCase().includes(q) ||
        (p.code && p.code.toLowerCase().includes(q)) ||
        (p.size && p.size.toLowerCase().includes(q));
      return matchCat && matchQuery;
    });

    return `
      <div class="catalog-tab-pane">
        <div class="catalog-intro-box mb-3">
          <div class="text-xs text-muted">
            ⚡ <b>Sửa nhanh mặt hàng:</b> Chạm vào nút <b>"✏️ Đổi tên nhanh"</b> để sửa ngay tên mặt hàng mà không cần mở nhiều bước, hoặc bấm <b>"⚙️ Sửa chi tiết"</b> để sửa ảnh, giá bán, giá vốn và tồn kho.
          </div>
        </div>

        <!-- Thanh tìm kiếm & lọc nhanh -->
        <div class="catalog-prod-toolbar mb-3">
          <div class="catalog-search-wrap mb-2">
            <input type="text" id="settings-prod-search" class="form-input" placeholder="🔍 Tìm mặt hàng theo tên hoặc mã..." value="${escapeHTML(this.productSearchQuery || '')}">
          </div>
          <div class="form-row align-center" style="align-items: center; flex-wrap: wrap; gap: 8px;">
            <div class="flex-2" style="flex: 2 1 170px; min-width: 0;">
              <select id="settings-prod-cat-filter" class="form-select text-sm">
                <option value="all">-- Tất cả loại diều (${products.length}) --</option>
                ${categories.map(c => `
                  <option value="${escapeHTML(c)}" ${this.productCatFilter === c ? 'selected' : ''}>
                    ${escapeHTML(c)} (${products.filter(p => p.category === c).length})
                  </option>
                `).join('')}
              </select>
            </div>
            <div class="flex-1 text-right" style="flex: 1 0 110px;">
              <button type="button" id="btn-settings-add-prod" class="btn btn-primary btn-sm btn-block" style="white-space: nowrap; min-height: 44px;">
                <span>+</span> Thêm Mới
              </button>
            </div>
          </div>
        </div>

        <div class="catalog-prod-count text-xs text-muted mb-2">
          Hiển thị <b>${filtered.length}</b> / ${products.length} mặt hàng
        </div>

        <div id="catalog-products-list" class="catalog-products-list">
          ${this.renderProductCardsHtml(filtered)}
        </div>
      </div>
    `;
  }

  renderProductCardsHtml(productsList) {
    if (productsList.length === 0) {
      return `
        <div class="card p-4 text-center text-muted">
          <div style="font-size: 32px; margin-bottom: 6px;">🪁</div>
          <p class="mb-0 text-sm">Không tìm thấy mặt hàng nào phù hợp.</p>
        </div>
      `;
    }

    return productsList.map(p => `
      <div class="quick-prod-card" data-id="${p.id}">
        <div class="quick-prod-header">
          <div class="quick-prod-thumb">
            ${p.photo ? `
              <img src="${p.photo}" alt="${escapeHTML(p.name)}" class="quick-prod-img">
            ` : `
              <div class="quick-prod-img-placeholder">🪁</div>
            `}
          </div>
          <div class="quick-prod-info">
            <div class="quick-prod-title-line">
              <span class="quick-prod-name" id="text-pname-${p.id}">${escapeHTML(p.name)}</span>
            </div>
            <div class="quick-prod-badge-line mt-1">
              <span class="badge badge-primary-subtle text-xs">${escapeHTML(p.category || 'Chưa phân loại')}</span>
              <span class="badge badge-light text-xs">${escapeHTML(p.code || '')}</span>
              <span class="text-xs text-muted">ĐVT: <b>${escapeHTML(p.unit || 'Chiếc')}</b></span>
            </div>
            <div class="quick-prod-price-line mt-1" style="display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin-top: 4px;">
              <span class="text-primary text-bold text-sm">${formatVND(p.sellingPrice || 0)}</span>
              <span class="text-xs text-muted ml-2">• Tồn kho: <b class="${p.stock <= (p.lowStockThreshold || 5) ? 'text-danger' : 'text-success'}">${p.stock}</b></span>
            </div>
          </div>
        </div>
        <div class="quick-prod-actions mt-2 pt-2 border-top" style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border);">
          <button type="button" class="btn btn-outline-primary btn-xs btn-quick-rename-prod" style="white-space: nowrap;" data-id="${p.id}" data-name="${escapeHTML(p.name)}">
            ✏️ Đổi tên nhanh
          </button>
          <button type="button" class="btn btn-outline-secondary btn-xs btn-quick-edit-full" style="white-space: nowrap;" data-id="${p.id}">
            ⚙️ Sửa chi tiết
          </button>
          <button type="button" class="btn btn-outline-danger btn-xs btn-quick-delete-prod" style="white-space: nowrap;" data-id="${p.id}" data-name="${escapeHTML(p.name)}">
            🗑️ Xóa
          </button>
        </div>
      </div>
    `).join('');
  }

  renderUnitsTabHtml(units) {
    return `
      <div class="catalog-tab-pane">
        <div class="catalog-intro-box mb-3">
          <div class="text-xs text-muted">
            📏 <b>Đơn vị tính:</b> Dùng để chỉ đơn vị cho các mặt hàng (ví dụ: Chiếc diều, Bộ sáo, Cuộn dây...). Khi đổi tên ĐVT, toàn bộ mặt hàng dùng ĐVT đó sẽ tự động được cập nhật.
          </div>
        </div>

        <div class="catalog-add-form mb-3">
          <label class="form-label text-bold">Thêm đơn vị tính mới:</label>
          <div class="input-with-button-row" style="gap: 8px;">
            <input type="text" id="input-new-unit" class="form-input" style="min-width: 0;" placeholder="VD: Mét, Cây, Cặp, Túi..." maxlength="20">
            <button type="button" id="btn-add-unit" class="btn btn-primary" style="flex-shrink: 0; white-space: nowrap;">
              <span>+</span> Thêm ĐVT
            </button>
          </div>
        </div>

        <div class="text-xs text-muted text-bold mb-2">DANH SÁCH ĐƠN VỊ TÍNH HIỆN CÓ (${units.length})</div>

        <div class="units-grid">
          ${units.map(u => `
            <div class="unit-badge-card" style="gap: 6px; min-width: 0;">
              <div class="unit-badge-name" style="min-width: 0; overflow: hidden;">
                <span class="unit-icon" style="flex-shrink: 0;">📐</span>
                <b style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHTML(u)}</b>
              </div>
              <div class="unit-badge-actions" style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                <button type="button" class="btn btn-outline-primary btn-xs btn-rename-unit" style="white-space: nowrap;" data-unit="${escapeHTML(u)}" title="Đổi tên ĐVT">✏️</button>
                <button type="button" class="btn btn-outline-danger btn-xs btn-delete-unit" style="white-space: nowrap;" data-unit="${escapeHTML(u)}" title="Xóa ĐVT">🗑️</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  renderWarehousesTabHtml(warehouses, products) {
    const iconOptions = ['📦', '🪁', '👕', '🎋', '🔩', '📏', '🎡', '🧵', '🎶', '🧰', '✨'];
    const whCounts = {};
    warehouses.forEach(w => { whCounts[w.id] = 0; });
    products.forEach(p => {
      const whId = normalizeWarehouseId(p.warehouse, warehouses);
      whCounts[whId] = (whCounts[whId] || 0) + 1;
    });

    return `
      <div class="catalog-tab-pane">
        <div class="catalog-intro-box mb-3">
          <div class="text-xs text-muted">
            🏭 <b>Quản lý Kho Hàng:</b> Tạo thêm kho hàng, đổi tên hoặc sắp xếp các kho sản phẩm. Chỉ xóa được kho khi không còn mặt hàng nào bên trong.
          </div>
        </div>

        <div class="catalog-add-form mb-3">
          <label class="form-label text-bold">Thêm kho hàng:</label>
          <div class="input-with-button-row" style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">
            <select id="select-new-warehouse-icon" class="form-select" style="width: auto; min-width: 68px; flex-shrink: 0;" aria-label="Biểu tượng kho">
              ${iconOptions.map(ic => `<option value="${ic}">${ic}</option>`).join('')}
            </select>
            <input type="text" id="input-new-warehouse" class="form-input" style="flex: 1 1 160px; min-width: 0;" placeholder="VD: Kho Đuôi Diều..." maxlength="40">
            <button type="button" id="btn-add-warehouse" class="btn btn-primary" style="flex-shrink: 0; white-space: nowrap;">
              <span>+</span> Tạo Kho
            </button>
          </div>
        </div>

        <div class="categories-list-header mb-2 d-flex justify-between align-center" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
          <span class="text-xs text-muted text-bold">DANH SÁCH KHO HÀNG (${warehouses.length})</span>
          <button type="button" id="btn-reset-warehouses" class="btn btn-link text-xs text-muted p-0" style="background: transparent; border: none; padding: 4px 6px; min-height: auto; font-weight: 600; white-space: nowrap;">
            ↺ Khôi phục kho mặc định
          </button>
        </div>

        <div class="categories-list-container">
          ${warehouses.map(wh => {
            const prodCount = whCounts[wh.id] || 0;
            return `
              <div class="catalog-item-card" style="flex-wrap: wrap; gap: 10px;">
                <div class="catalog-item-info" style="flex: 1 1 160px; min-width: 0;">
                  <span class="catalog-item-icon">${wh.icon || '📦'}</span>
                  <div class="catalog-item-main">
                    <div class="catalog-item-title">${escapeHTML(wh.name)}</div>
                    <div class="catalog-item-subtitle text-xs text-muted">
                      ${prodCount > 0 ? `<b>${prodCount}</b> sản phẩm trong kho` : 'Chưa có sản phẩm'}
                    </div>
                  </div>
                </div>
                <div class="catalog-item-actions" style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-left: auto;">
                  <button type="button" class="btn btn-outline-primary btn-xs btn-rename-warehouse" style="white-space: nowrap;" data-id="${escapeHTML(wh.id)}" data-name="${escapeHTML(wh.name)}">
                    ✏️ Đổi tên
                  </button>
                  <button type="button" class="btn btn-outline-danger btn-xs btn-delete-warehouse" style="white-space: nowrap;" data-id="${escapeHTML(wh.id)}" data-name="${escapeHTML(wh.name)}" data-count="${prodCount}">
                    🗑️ Xóa
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  bindCatalogEvents(categories, products, units, warehouses = []) {
    // 1. Chuyển đổi tab con (Loại diều, Mặt hàng, ĐVT, Kho hàng)
    document.querySelectorAll('.catalog-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        this.catalogTab = tab;
        document.querySelectorAll('.catalog-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        ['categories', 'products', 'units', 'warehouses'].forEach(t => {
          const el = document.getElementById(`catalog-tab-content-${t}`);
          if (el) el.style.display = (t === tab) ? 'block' : 'none';
        });
      });
    });

    // 2. Tab Loại Diều
    const addCatBtn = document.getElementById('btn-add-category');
    const newCatInput = document.getElementById('input-new-category');
    if (addCatBtn && newCatInput) {
      const handleAddCat = async () => {
        const val = newCatInput.value.trim();
        if (!val) {
          alert('Vui lòng nhập tên loại diều mới!');
          newCatInput.focus();
          return;
        }
        try {
          await db.addCategory(val);
          alert(`✅ Đã thêm loại diều "${val}" thành công!`);
          await this.render();
        } catch (err) {
          alert('Lỗi: ' + err.message);
        }
      };

      addCatBtn.addEventListener('click', handleAddCat);
      newCatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAddCat();
        }
      });
    }

    // Đổi tên loại diều
    document.querySelectorAll('.btn-rename-cat').forEach(btn => {
      btn.addEventListener('click', async () => {
        const oldName = btn.dataset.name;
        const newName = prompt(`Nhập tên mới cho loại diều "${oldName}":`, oldName);
        if (newName !== null) {
          const trimmed = newName.trim();
          if (!trimmed) {
            alert('Tên loại diều không được để trống!');
            return;
          }
          if (trimmed === oldName) return;

          try {
            const res = await db.renameCategory(oldName, trimmed);
            alert(`✅ Đã đổi tên loại diều thành "${trimmed}"!\nCó ${res.updatedProductsCount} sản phẩm liên quan đã tự động cập nhật.`);
            await this.render();
          } catch (err) {
            alert('Lỗi đổi tên: ' + err.message);
          }
        }
      });
    });

    // Xóa loại diều
    document.querySelectorAll('.btn-delete-cat').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.name;
        const count = parseInt(btn.dataset.count, 10) || 0;
        if (count > 0) {
          alert(`⚠️ Không thể xóa loại diều "${name}" vì đang có ${count} sản phẩm thuộc loại này!\n\nVui lòng vào tab "Sửa Mặt Hàng" hoặc "Kho Diều" để đổi sang loại khác trước khi xóa.`);
          return;
        }
        if (confirm(`Bạn có chắc muốn xóa loại diều "${name}" không?`)) {
          try {
            await db.deleteCategory(name);
            alert(`✅ Đã xóa loại diều "${name}" thành công!`);
            await this.render();
          } catch (err) {
            alert('Lỗi xóa: ' + err.message);
          }
        }
      });
    });

    // Khôi phục mặc định loại diều
    const resetCatsBtn = document.getElementById('btn-reset-categories');
    if (resetCatsBtn) {
      resetCatsBtn.addEventListener('click', async () => {
        if (confirm('Khôi phục danh sách loại diều về mặc định ban đầu?\n(Lưu ý: Các sản phẩm hiện có vẫn được giữ nguyên)')) {
          try {
            await db.resetDefaultCategories();
            alert('✅ Đã khôi phục danh mục loại diều mặc định!');
            await this.render();
          } catch (err) {
            alert('Lỗi: ' + err.message);
          }
        }
      });
    }

    // 3. Tab Sửa Mặt Hàng
    const searchInput = document.getElementById('settings-prod-search');
    const catFilterSelect = document.getElementById('settings-prod-cat-filter');
    const addProdBtn = document.getElementById('btn-settings-add-prod');

    if (addProdBtn) {
      addProdBtn.addEventListener('click', () => {
        this.app.productModule.showProductModal();
      });
    }

    const filterAndRenderProducts = () => {
      const q = (this.productSearchQuery || '').toLowerCase().trim();
      const cat = this.productCatFilter || 'all';

      const filtered = products.filter(p => {
        const matchCat = cat === 'all' || p.category === cat;
        const matchQuery = !q ||
          p.name.toLowerCase().includes(q) ||
          (p.code && p.code.toLowerCase().includes(q)) ||
          (p.size && p.size.toLowerCase().includes(q));
        return matchCat && matchQuery;
      });

      const listEl = document.getElementById('catalog-products-list');
      const countEl = document.querySelector('.catalog-prod-count');
      if (listEl) {
        listEl.innerHTML = this.renderProductCardsHtml(filtered);
        this.bindProductListActions();
      }
      if (countEl) {
        countEl.innerHTML = `Hiển thị <b>${filtered.length}</b> / ${products.length} mặt hàng`;
      }
    };

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.productSearchQuery = e.target.value;
        filterAndRenderProducts();
      });
    }

    if (catFilterSelect) {
      catFilterSelect.addEventListener('change', (e) => {
        this.productCatFilter = e.target.value;
        filterAndRenderProducts();
      });
    }

    // Gán action cho danh sách sản phẩm ban đầu
    this.bindProductListActions();

    // 4. Tab Đơn Vị Tính
    const addUnitBtn = document.getElementById('btn-add-unit');
    const newUnitInput = document.getElementById('input-new-unit');
    if (addUnitBtn && newUnitInput) {
      const handleAddUnit = async () => {
        const val = newUnitInput.value.trim();
        if (!val) {
          alert('Vui lòng nhập tên đơn vị tính!');
          newUnitInput.focus();
          return;
        }
        try {
          await db.addUnit(val);
          alert(`✅ Đã thêm đơn vị tính "${val}"!`);
          await this.render();
        } catch (err) {
          alert('Lỗi: ' + err.message);
        }
      };

      addUnitBtn.addEventListener('click', handleAddUnit);
      newUnitInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAddUnit();
        }
      });
    }

    // Đổi tên ĐVT
    document.querySelectorAll('.btn-rename-unit').forEach(btn => {
      btn.addEventListener('click', async () => {
        const oldUnit = btn.dataset.unit;
        const newUnit = prompt(`Nhập tên mới cho đơn vị tính "${oldUnit}":`, oldUnit);
        if (newUnit !== null) {
          const trimmed = newUnit.trim();
          if (!trimmed) return alert('Tên ĐVT không được để trống!');
          if (trimmed === oldUnit) return;

          try {
            await db.renameUnit(oldUnit, trimmed);
            alert(`✅ Đã đổi đơn vị tính thành "${trimmed}"! Các mặt hàng liên quan đã được đồng bộ.`);
            await this.render();
          } catch (err) {
            alert('Lỗi: ' + err.message);
          }
        }
      });
    });

    // Xóa ĐVT
    document.querySelectorAll('.btn-delete-unit').forEach(btn => {
      btn.addEventListener('click', async () => {
        const unit = btn.dataset.unit;
        if (confirm(`Bạn có chắc muốn xóa đơn vị tính "${unit}"?`)) {
          try {
            await db.deleteUnit(unit);
            alert(`✅ Đã xóa đơn vị tính "${unit}"!`);
            await this.render();
          } catch (err) {
            alert('Lỗi: ' + err.message);
          }
        }
      });
    });

    // 5. Tab Kho Hàng
    const addWhBtn = document.getElementById('btn-add-warehouse');
    const newWhInput = document.getElementById('input-new-warehouse');
    const newWhIconSelect = document.getElementById('select-new-warehouse-icon');
    if (addWhBtn && newWhInput) {
      const handleAddWh = async () => {
        const val = newWhInput.value.trim();
        const icon = newWhIconSelect ? newWhIconSelect.value : '📦';
        if (!val) {
          alert('Vui lòng nhập tên kho hàng mới!');
          newWhInput.focus();
          return;
        }
        try {
          await db.addWarehouse(val, icon);
          alert(`✅ Đã tạo kho "${val}" thành công!`);
          this.activeSettingSection = 'catalog';
          this.catalogTab = 'warehouses';
          await this.render();
        } catch (err) {
          alert('Lỗi: ' + err.message);
        }
      };

      addWhBtn.addEventListener('click', handleAddWh);
      newWhInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAddWh();
        }
      });
    }

    // Đổi tên kho hàng
    document.querySelectorAll('.btn-rename-warehouse').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const oldName = btn.dataset.name;
        const newName = prompt(`Nhập tên mới cho kho "${oldName}":`, oldName);
        if (newName !== null) {
          const trimmed = newName.trim();
          if (!trimmed) {
            alert('Tên kho hàng không được để trống!');
            return;
          }
          if (trimmed === oldName) return;

          try {
            await db.renameWarehouse(id, trimmed);
            alert(`✅ Đã đổi tên kho thành "${trimmed}"!`);
            this.activeSettingSection = 'catalog';
            this.catalogTab = 'warehouses';
            await this.render();
          } catch (err) {
            alert('Lỗi đổi tên: ' + err.message);
          }
        }
      });
    });

    // Xóa kho hàng
    document.querySelectorAll('.btn-delete-warehouse').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        const count = parseInt(btn.dataset.count, 10) || 0;
        if (count > 0) {
          alert(`⚠️ Không thể xóa kho "${name}" vì đang có ${count} sản phẩm trong kho này!\n\nVui lòng vào "Kho Diều" để chuyển các sản phẩm sang kho khác trước khi xóa.`);
          return;
        }
        if (confirm(`Bạn có chắc muốn xóa kho "${name}" không?`)) {
          try {
            await db.deleteWarehouse(id);
            alert(`✅ Đã xóa kho "${name}" thành công!`);
            this.activeSettingSection = 'catalog';
            this.catalogTab = 'warehouses';
            await this.render();
          } catch (err) {
            alert('Lỗi xóa: ' + err.message);
          }
        }
      });
    });

    // Khôi phục danh sách kho mặc định
    const resetWhBtn = document.getElementById('btn-reset-warehouses');
    if (resetWhBtn) {
      resetWhBtn.addEventListener('click', async () => {
        if (confirm('Khôi phục danh sách kho hàng về mặc định ban đầu?\n(Lưu ý: Các sản phẩm hiện có vẫn được giữ nguyên)')) {
          try {
            await db.resetDefaultWarehouses();
            alert('✅ Đã khôi phục danh sách kho hàng mặc định!');
            this.activeSettingSection = 'catalog';
            this.catalogTab = 'warehouses';
            await this.render();
          } catch (err) {
            alert('Lỗi: ' + err.message);
          }
        }
      });
    }
  }

  bindProductListActions() {
    // Đổi tên nhanh mặt hàng
    document.querySelectorAll('.btn-quick-rename-prod').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const oldName = btn.dataset.name;
        const newName = prompt(`Nhập tên mới cho mặt hàng:\n"${oldName}"`, oldName);
        if (newName !== null) {
          const trimmed = newName.trim();
          if (!trimmed) {
            alert('Tên mặt hàng không được để trống!');
            return;
          }
          if (trimmed === oldName) return;

          try {
            const p = await db.getById('products', id);
            if (p) {
              p.name = trimmed;
              await db.put('products', p);
              alert(`✅ Đã đổi tên mặt hàng thành công:\n"${trimmed}"`);
              await this.render();
            }
          } catch (err) {
            alert('Lỗi: ' + err.message);
          }
        }
      });
    });

    // Sửa đầy đủ chi tiết
    document.querySelectorAll('.btn-quick-edit-full').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        this.app.productModule.showProductModal(id);
      });
    });

    // Xóa mặt hàng
    document.querySelectorAll('.btn-quick-delete-prod').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        if (confirm(`Chuyển "${name}" vào Thùng rác?\n(Bạn có thể khôi phục lại bất kỳ lúc nào trong Thùng rác)`)) {
          await db.softDelete('products', id);
          alert(`✅ Đã chuyển "${name}" vào Thùng rác!`);
          await this.render();
        }
      });
    });
  }

  // ================= NẠP DỮ LIỆU MẪU =================
  async loadSampleData() {
    const sampleProducts = [
      {
        id: 'SP-SAMPLE-001',
        code: 'DIEU-001',
        name: 'Diều Khí Động Học Mực Khổng Lồ 4m',
        category: 'Diều khí động học',
        size: 'Dài 4m x Rộng 1.2m',
        color: 'Đỏ cam phát quang',
        unit: 'Chiếc',
        costPrice: 180000,
        sellingPrice: 320000,
        stock: 12,
        lowStockThreshold: 5,
        photo: '',
        notes: 'Vải dù caro 210T xịn chống xé, không khung nan, xếp siêu gọn bỏ vừa cốp xe'
      },
      {
        id: 'SP-SAMPLE-002',
        code: 'DIEU-002',
        name: 'Diều Sáo Cánh Bầu 2.5m Nan Carbon',
        category: 'Diều sáo truyền thống',
        size: 'Sải cánh 2.5m',
        color: 'Trắng xanh ngọc',
        unit: 'Chiếc',
        costPrice: 450000,
        sellingPrice: 750000,
        stock: 6,
        lowStockThreshold: 3,
        photo: '',
        notes: 'Nan carbon xoắn siêu nhẹ, kèm pas khóa lắp sáo tiện lợi'
      },
      {
        id: 'SP-SAMPLE-003',
        code: 'DIEU-003',
        name: 'Bộ Sáo Còi D7 D8 Âm Chuông (3 Ống)',
        category: 'Sáo diều & Âm thanh',
        size: 'Còi D7-D8',
        color: 'Gỗ mun sừng bóng',
        unit: 'Bộ',
        costPrice: 320000,
        sellingPrice: 580000,
        stock: 4,
        lowStockThreshold: 5,
        photo: '',
        notes: 'Âm ngân vang xa, miệng xốp gỗ nhẹ, kêu từ gió cấp 2'
      },
      {
        id: 'SP-SAMPLE-004',
        code: 'DIEU-004',
        name: 'Diều Phượng Hoàng Lửa 3D Đuôi Dài 5m',
        category: 'Diều rồng / Phượng hoàng',
        size: 'Sải cánh 1.8m, đuôi 5m',
        color: 'Đỏ vàng ngũ sắc',
        unit: 'Chiếc',
        costPrice: 150000,
        sellingPrice: 280000,
        stock: 15,
        lowStockThreshold: 5,
        photo: '',
        notes: 'Nan thủy tinh dẻo chịu gió tốt, bay đầm, đuôi lượn đẹp mắt'
      },
      {
        id: 'SP-SAMPLE-005',
        code: 'DIEU-005',
        name: 'Diều Đại Bàng Tung Cánh 2m',
        category: 'Diều đại bàng / Động vật',
        size: 'Sải 2m',
        color: 'Nâu đen hung tợn',
        unit: 'Chiếc',
        costPrice: 90000,
        sellingPrice: 170000,
        stock: 20,
        lowStockThreshold: 5,
        photo: '',
        notes: 'Diều in nhiệt 3D sắc nét, rất dễ bay cho người mới tập'
      },
      {
        id: 'SP-SAMPLE-006',
        code: 'DIEU-006',
        name: 'Cuộn Guồng Thả Diều Bánh Xe 26cm + 500m Dây Dù Siêu Bền',
        category: 'Cuộn guồng & Dây thả diều',
        size: 'Đường kính 26cm',
        color: 'Trong suốt chịu lực',
        unit: 'Bộ',
        costPrice: 140000,
        sellingPrice: 240000,
        stock: 8,
        lowStockThreshold: 4,
        photo: '',
        notes: 'Có chốt phanh tay hãm gió giật, bạc đạn êm ru, kèm 500m dây kevlar 3ly'
      }
    ];

    const sampleCustomers = [
      {
        id: 'KH-SAMPLE-001',
        name: 'Anh Minh (CLB Diều Sài Gòn)',
        phone: '0912 345 678',
        address: 'Khu công viên bến thả diều Quận 2, TP.HCM',
        notes: 'Khách VIP, thường mua diều sáo và sáo còi'
      },
      {
        id: 'KH-SAMPLE-002',
        name: 'Chị Lan (Phụ huynh)',
        phone: '0988 765 432',
        address: 'Chung cư Masteri An Phú',
        notes: 'Thường mua diều mực khí động học cho bé'
      },
      {
        id: 'KH-SAMPLE-003',
        name: 'Hội Thả Diều Hóc Môn',
        phone: '0903 112 233',
        address: 'Cánh đồng diều Hóc Môn',
        notes: 'Mua số lượng nhiều, có hóa đơn bán buôn'
      }
    ];

    for (const p of sampleProducts) await db.put('products', p);
    for (const c of sampleCustomers) await db.put('customers', c);

    // Tạo 1 đơn hàng mẫu
    const now = new Date().toISOString();
    const sampleOrder = {
      id: 'DH-SAMPLE-001',
      customerId: 'KH-SAMPLE-001',
      customerName: 'Anh Minh (CLB Diều Sài Gòn)',
      customerPhone: '0912 345 678',
      items: [
        {
          productId: 'SP-SAMPLE-002',
          productCode: 'DIEU-002',
          productName: 'Diều Sáo Cánh Bầu 2.5m Nan Carbon',
          unit: 'Chiếc',
          quantity: 1,
          costPrice: 450000,
          unitPrice: 750000,
          subtotal: 750000
        },
        {
          productId: 'SP-SAMPLE-003',
          productCode: 'DIEU-003',
          productName: 'Bộ Sáo Còi D7 D8 Âm Chuông (3 Ống)',
          unit: 'Bộ',
          quantity: 1,
          costPrice: 320000,
          unitPrice: 580000,
          subtotal: 580000
        }
      ],
      subtotal: 1330000,
      discountType: 'amount',
      discountValue: 30000,
      discountAmount: 30000,
      shippingFee: 0,
      vatRate: 0,
      vatAmount: 0,
      totalAmount: 1300000,
      paidAmount: 1000000,
      debtAmount: 300000, // Còn nợ 300.000 để thử nghiệm công nợ
      paymentMethod: 'partial',
      status: 'completed',
      notes: 'Đơn hàng mẫu thử nghiệm tính năng',
      createdAt: now,
      isDeleted: false
    };
    await db.put('orders', sampleOrder);

    // Ghi nhận lịch sử kho ban đầu
    for (const p of sampleProducts) {
      await db.put('inventory_logs', {
        id: 'LOG-INIT-' + p.id,
        productId: p.id,
        productCode: p.code,
        productName: p.name,
        changeType: 'import',
        quantityChange: p.stock,
        stockBefore: 0,
        stockAfter: p.stock,
        referenceId: 'KHO-DAU-KY',
        reason: 'Khởi tạo tồn kho đầu kỳ',
        createdAt: now
      });
    }

    alert('🎉 Đã nạp dữ liệu mẫu diều thành công! Bạn có thể xem Sản phẩm, Bán hàng, Công nợ và Báo cáo ngay.');
    window.location.reload();
  }
}
