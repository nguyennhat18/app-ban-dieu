// Quản lý Cài Đặt Cửa Hàng, Bảo Vệ Dữ Liệu, Hướng Dẫn Cài PWA & Dữ Liệu Mẫu
import { db } from '../db.js';
import {
  formatVND,
  formatDateTime,
  compressImage,
  escapeHTML
} from '../utils.js';
import { DEFAULT_SHOP_SETTINGS } from '../config.js';

export class SettingsModule {
  constructor(app) {
    this.app = app;
    this.catalogTab = 'categories'; // 'categories' | 'products' | 'units'
    this.productSearchQuery = '';
    this.productCatFilter = 'all';
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
    const products = await db.getAll('products');

    container.innerHTML = `
      <div class="view-header">
        <h1 class="view-title">⚙️ Cài Đặt & An Toàn Dữ Liệu</h1>
        <p class="view-subtitle">Cấu hình cửa hàng, sao lưu khôi phục và bảo vệ bộ nhớ</p>
      </div>

      <!-- CẢNH BÁO SỐNG CÒN VỀ DỮ LIỆU -->
      <div class="vital-warning-banner">
        <div class="warning-icon">⚠️</div>
        <div class="warning-text">
          <b>LƯU Ý QUAN TRỌNG VỀ BẢO VỆ DỮ LIỆU:</b><br>
          Dữ liệu bán diều được lưu trực tiếp và duy nhất trong điện thoại này. Nếu bạn <b>đổi máy</b>, <b>gỡ app</b>, hoặc <b>xóa lịch sử duyệt web</b> mà chưa bấm Sao lưu thì dữ liệu sẽ bị mất. Hãy bấm <b>SAO LƯU</b> gửi file vào Zalo Cloud hoặc Google Drive ít nhất 1 lần mỗi tuần!
        </div>
      </div>

      <!-- LỐI TẮT NGHIỆP VỤ NHANH -->
      <div class="card p-3 mb-3">
        <h3 class="card-title">⚡ Lối Tắt Nghiệp Vụ</h3>
        <div class="quick-shortcuts-grid">
          <button id="btn-shortcut-catalog" class="btn btn-outline-info btn-block text-left" style="display:flex; align-items:center; justify-content:space-between; padding: 12px 14px; margin-bottom: 8px; font-weight:600;">
            <span>🏷️ Quản Lý Loại Diều & Sửa Mặt Hàng</span>
            <span>➔</span>
          </button>
          <button id="btn-shortcut-reports" class="btn btn-outline-primary btn-block text-left" style="display:flex; align-items:center; justify-content:space-between; padding: 12px 14px; margin-bottom: 8px; font-weight:600;">
            <span>📊 Báo Cáo Doanh Thu & Lợi Nhuận Gộp</span>
            <span>➔</span>
          </button>
          <button id="btn-shortcut-inventory" class="btn btn-outline-secondary btn-block text-left" style="display:flex; align-items:center; justify-content:space-between; padding: 12px 14px; font-weight:600;">
            <span>📦 Quản Lý Kho Diều, Nhập Hàng & Kiểm Kê</span>
            <span>➔</span>
          </button>
        </div>
      </div>

      <!-- KHỐI 1: SAO LƯU & KHÔI PHỤC DỮ LIỆU (Ưu tiên đưa lên đầu) -->
      <div class="card p-3 mb-3">
        <h3 class="card-title">🛡️ Sao Lưu & Khôi Phục Dữ Liệu</h3>
        <p class="text-muted text-xs mb-3">
          Sao lưu gần nhất: <b>${shop.lastBackupTime ? formatDateTime(shop.lastBackupTime) : 'Chưa sao lưu lần nào!'}</b>
          ${shop.unbackedChangesCount > 0 ? `• <span class="text-danger text-bold">Có ${shop.unbackedChangesCount} thay đổi chưa sao lưu</span>` : ''}
        </p>

        <div class="backup-actions-grid">
          <button id="btn-do-backup" class="btn btn-primary btn-block">
            <span>💾 SAO LƯU DỮ LIỆU (Gửi Zalo / Drive)</span>
          </button>
          <button id="btn-do-restore" class="btn btn-outline-danger btn-block">
            <span>🔄 Khôi Phục Dữ Liệu Từ File JSON</span>
          </button>
          <button id="btn-do-excel-all" class="btn btn-outline-success btn-block">
            <span>📊 Xuất Toàn Bộ Dữ Liệu Ra Excel</span>
          </button>
          <button id="btn-open-trash" class="btn btn-secondary btn-block">
            <span>🗑️ Mở Thùng Rác (Khôi Phục Xóa Mềm)</span>
          </button>
        </div>
      </div>

      <!-- KHỐI 2: TRẠNG THÁI LƯU TRỮ BỀN VỮNG (STORAGE PERSIST) -->
      <div class="card p-3 mb-3">
        <h3 class="card-title">📱 Trạng Thái Lưu Trữ Trong Máy</h3>
        <div class="storage-info-row">
          <div>
            <div class="text-sm">Trạng thái bảo vệ bộ nhớ:</div>
            ${this.storageStatus.isPersisted ? `
              <span class="badge badge-success">🛡️ ĐÃ BẢO VỆ BỀN VỮNG (An toàn)</span>
            ` : `
              <span class="badge badge-warning">⚠️ CHƯA BẢO VỆ BỀN VỮNG</span>
            `}
          </div>
          ${!this.storageStatus.isPersisted ? `
            <button id="btn-request-persist" class="btn btn-outline-primary btn-sm">Bật Bảo Vệ</button>
          ` : ''}
        </div>
        <div class="text-xs text-muted mt-2">
          Dung lượng app đã dùng: <b>${this.storageStatus.usageMB} MB</b> / Hạn mức trình duyệt: <b>${this.storageStatus.quotaMB} MB</b>
        </div>
      </div>

      <!-- KHỐI 3: QUẢN LÝ MẶT HÀNG, LOẠI DIỀU & ĐƠN VỊ TÍNH -->
      <div class="card p-3 mb-3 border-primary-subtle" id="catalog-management-card">
        <h3 class="card-title">🏷️ Quản Lý Loại Diều & Sửa Mặt Hàng</h3>
        <p class="text-muted text-xs mb-3">
          Tùy chỉnh phân loại diều, đổi tên mặt hàng tức thì và cấu hình đơn vị tính
        </p>

        <!-- Sub Tabs -->
        <div class="catalog-tabs-bar mb-3">
          <button type="button" class="catalog-tab-btn ${this.catalogTab === 'categories' ? 'active' : ''}" data-tab="categories">
            🪁 Loại Diều (${categories.length})
          </button>
          <button type="button" class="catalog-tab-btn ${this.catalogTab === 'products' ? 'active' : ''}" data-tab="products">
            📦 Sửa Mặt Hàng (${products.length})
          </button>
          <button type="button" class="catalog-tab-btn ${this.catalogTab === 'units' ? 'active' : ''}" data-tab="units">
            📏 Đơn Vị Tính (${units.length})
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
      </div>

      <!-- KHỐI 4: BẢN CHỤP HÀNG NGÀY NỘI BỘ (DISASTER RECOVERY) -->
      <div class="card p-3 mb-3">
        <h3 class="card-title">🕒 Bản Chụp Cứu Hộ Tự Động (7 Ngày Gần Nhất)</h3>
        <p class="text-muted text-xs mb-2">
          Hệ thống tự động chụp 1 bản mỗi ngày khi mở app để bạn cứu dữ liệu nếu bấm nhầm.
          <i>(Lưu ý: Bản chụp này nằm trong máy, không thay thế việc sao lưu ra ngoài gửi Zalo/Drive).</i>
        </p>
        <div id="snapshots-container">
          ${snapshotsHtml}
        </div>
      </div>

      <!-- KHỐI 4: THÔNG TIN CỬA HÀNG & BÁO GIÁ -->
      <div class="card p-3 mb-3">
        <h3 class="card-title">🏪 Thông Tin Cửa Hàng & Báo Giá</h3>
        <form id="settings-shop-form">
          <!-- Logo cửa hàng -->
          <div class="logo-setting-section mb-3">
            <label class="form-label">Logo cửa hàng (hiển thị trên báo giá PDF và hóa đơn):</label>
            <div class="logo-preview-box" id="logo-preview-box">
              ${shop.logo ? `
                <img src="${shop.logo}" class="shop-logo-img" alt="Logo shop">
                <button type="button" class="btn-remove-logo" id="btn-remove-logo">&times;</button>
              ` : `
                <div class="logo-placeholder" id="logo-placeholder">
                  <span>📷 Chạm để chọn ảnh logo</span>
                </div>
              `}
            </div>
            <input type="file" id="logo-file-input" accept="image/*" style="display:none">
          </div>

          <div class="form-group">
            <label class="form-label required">Tên cửa hàng diều</label>
            <input type="text" id="set-shop-name" class="form-input" required value="${escapeHTML(shop.shopName || '')}">
          </div>

          <div class="form-row">
            <div class="form-group flex-1">
              <label class="form-label">Số điện thoại / Zalo</label>
              <input type="tel" id="set-phone" class="form-input" value="${escapeHTML(shop.phone || '')}">
            </div>
            <div class="form-group flex-1">
              <label class="form-label">Hạn báo giá mặc định (ngày)</label>
              <input type="number" id="set-quote-days" class="form-input" min="1" max="90" value="${shop.quoteValidityDays || 7}">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Địa chỉ cửa hàng / Điểm thả diều</label>
            <input type="text" id="set-address" class="form-input" value="${escapeHTML(shop.address || '')}">
          </div>

          <div class="form-group">
            <label class="form-label">Thông tin ngân hàng / STK / Chủ tài khoản</label>
            <input type="text" id="set-bank" class="form-input" placeholder="VD: Vietcombank - STK: 123456789 - NGUYEN VAN A" value="${escapeHTML(shop.bankInfo || '')}">
          </div>

          <!-- MÃ QR THANH TOÁN (VIETQR / NGÂN HÀNG / VÍ ĐIỆN TỬ) -->
          <div class="card p-3 mb-3 bg-light border-primary-subtle">
            <label class="form-label text-bold text-primary mb-1">
              📱 Mã QR Thanh Toán (Cho khách quét trả tiền):
            </label>
            <p class="text-xs text-muted mb-2">
              Tải lên ảnh chụp mã QR tài khoản ngân hàng (Vietcombank, MB, Techcombank, MoMo,...). Mã này sẽ hiển thị to rõ trên hóa đơn và màn hình bán hàng để khách hàng quét trả tiền nhanh chóng!
            </p>

            <div class="qr-setting-container">
              <div class="qr-preview-box" id="qr-preview-box">
                ${shop.qrCode ? `
                  <img src="${shop.qrCode}" class="shop-qr-img" id="shop-qr-preview-img" alt="Mã QR thanh toán">
                  <div class="qr-preview-actions mt-2">
                    <button type="button" class="btn btn-outline-danger btn-xs" id="btn-remove-qr">🗑️ Xóa mã QR</button>
                    <button type="button" class="btn btn-outline-primary btn-xs" id="btn-zoom-settings-qr">🔍 Xem phóng to</button>
                    <button type="button" class="btn btn-outline-secondary btn-xs" id="btn-change-qr">🔄 Đổi ảnh khác</button>
                  </div>
                ` : `
                  <div class="qr-placeholder" id="qr-placeholder">
                    <div style="font-size: 32px; margin-bottom: 4px;">📱</div>
                    <span class="text-bold text-sm">Chạm vào đây để chọn ảnh mã QR</span>
                    <span class="text-xs text-muted mt-1">(Tải ảnh chụp mã QR từ app ngân hàng hoặc MoMo của bạn)</span>
                  </div>
                `}
              </div>
              <input type="file" id="qr-file-input" accept="image/*" style="display:none">
            </div>
          </div>

          <!-- Cài đặt thuế VAT -->
          <div class="card p-2 mb-3 bg-light">
            <div class="form-row align-center">
              <div class="flex-2">
                <label class="form-label mb-0 text-bold">Có áp dụng VAT trên hóa đơn/báo giá?</label>
                <span class="text-xs text-muted">Nếu bật, hệ thống sẽ tự tính thêm thuế VAT vào tổng tiền</span>
              </div>
              <div class="flex-1 text-right">
                <input type="checkbox" id="set-enable-vat" ${shop.enableVat ? 'checked' : ''} style="width: 20px; height: 20px;">
              </div>
            </div>
            <div id="vat-rate-row" class="form-row mt-2" style="display: ${shop.enableVat ? 'flex' : 'none'}">
              <div class="form-group flex-1">
                <label class="form-label">Mức thuế VAT (%)</label>
                <select id="set-vat-rate" class="form-select">
                  <option value="8" ${shop.vatRate === 8 ? 'selected' : ''}>8%</option>
                  <option value="10" ${shop.vatRate === 10 ? 'selected' : ''}>10%</option>
                </select>
              </div>
            </div>
          </div>

          <button type="submit" class="btn btn-primary btn-block btn-lg">
            ✓ Lưu Cài Đặt Cửa Hàng
          </button>
        </form>
      </div>

      <!-- KHỐI 5: HƯỚNG DẪN CÀI ĐẶT PWA LÊN ĐIỆN THOẠI -->
      <div class="card p-3 mb-3">
        <h3 class="card-title">📲 Hướng Dẫn Cài Đặt Lên Màn Hình Chính</h3>
        <div class="install-guide-tabs">
          <div class="guide-box mb-2">
            <b>🍏 Dành cho iPhone / iPad (Safari):</b>
            <ol class="guide-steps text-xs text-muted">
              <li>Mở trang web bằng trình duyệt <b>Safari</b>.</li>
              <li>Bấm vào nút <b>Chia sẻ</b> (biểu tượng hình vuông có mũi tên chỉ lên ở thanh dưới cùng).</li>
              <li>Cuộn xuống và chọn <b>"Thêm vào Màn hình chính" (Add to Home Screen)</b>.</li>
              <li><span class="text-danger text-bold">CỰC KỲ QUAN TRỌNG:</span> Sau khi cài, luôn bấm mở app từ biểu tượng con diều ngoài màn hình chính, <u>không dùng trong tab Safari thông thường</u> để iOS bảo vệ dữ liệu không bị xóa sau 7 ngày!</li>
            </ol>
          </div>

          <div class="guide-box">
            <b>🤖 Dành cho Android (Google Chrome):</b>
            <ol class="guide-steps text-xs text-muted">
              <li>Mở trang web bằng trình duyệt <b>Chrome</b>.</li>
              <li>Bấm nút <b>Menu 3 chấm</b> ở góc trên bên phải.</li>
              <li>Chọn <b>"Cài đặt ứng dụng"</b> hoặc <b>"Thêm vào Màn hình chính"</b>.</li>
              <li>App sẽ xuất hiện như ứng dụng bình thường, mở dùng offline hoàn toàn mọi lúc.</li>
            </ol>
          </div>
        </div>
      </div>

      <!-- KHỐI 6: DỮ LIỆU MẪU & KHỞI TẠO -->
      <div class="card p-3 mb-4">
        <h3 class="card-title">🧪 Dữ Liệu Mẫu & Khởi Tạo</h3>
        <p class="text-muted text-xs mb-3">
          Nếu bạn mới bắt đầu, bạn có thể nạp dữ liệu mẫu (gồm vài loại diều phổ biến, khách hàng, đơn mẫu) để dùng thử. Khi bắt đầu bán thật, hãy bấm xóa dữ liệu mẫu.
        </p>
        <div class="sample-actions-row">
          <button id="btn-load-sample-data" class="btn btn-outline-primary btn-sm">
            Nạp Dữ Liệu Mẫu Diều
          </button>
          <button id="btn-clear-sample-data" class="btn btn-outline-danger btn-sm">
            Xóa Trắng Dữ Liệu Thử
          </button>
        </div>
      </div>
    `;

    this.bindEvents(shop, categories, products, units);
  }

  bindEvents(shop, categories, products, units) {
    // 0. Gán sự kiện Quản lý Loại diều, Sửa mặt hàng, Đơn vị tính
    this.bindCatalogEvents(categories, products, units);

    // Lối tắt cuộn đến Quản lý Loại diều & Mặt hàng
    const btnShortcutCatalog = document.getElementById('btn-shortcut-catalog');
    if (btnShortcutCatalog) {
      btnShortcutCatalog.addEventListener('click', () => {
        const el = document.getElementById('catalog-management-card');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      });
    }

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
          <div class="qr-preview-actions mt-2">
            <button type="button" class="btn btn-outline-danger btn-xs" id="btn-remove-qr">🗑️ Xóa mã QR</button>
            <button type="button" class="btn btn-outline-primary btn-xs" id="btn-zoom-settings-qr">🔍 Xem phóng to</button>
            <button type="button" class="btn btn-outline-secondary btn-xs" id="btn-change-qr">🔄 Đổi ảnh khác</button>
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

        const updatedShop = {
          ...shop,
          shopName,
          phone: document.getElementById('set-phone').value.trim(),
          address: document.getElementById('set-address').value.trim(),
          bankInfo: document.getElementById('set-bank').value.trim(),
          quoteValidityDays: parseInt(document.getElementById('set-quote-days').value, 10) || 7,
          enableVat: vatCheckbox ? vatCheckbox.checked : false,
          vatRate: parseInt(document.getElementById('set-vat-rate').value, 10) || 8,
          logo: logoBase64,
          qrCode: qrCodeBase64
        };

        await db.saveSetting('shop_info', updatedShop);
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
          <div class="input-with-button-row">
            <input type="text" id="input-new-category" class="form-input" placeholder="VD: Diều nan carbon, Diều led đêm, Diều mini..." maxlength="50">
            <button type="button" id="btn-add-category" class="btn btn-primary">
              <span>+</span> Thêm Loại
            </button>
          </div>
        </div>

        <div class="categories-list-header mb-2 d-flex justify-between align-center">
          <span class="text-xs text-muted text-bold">DANH SÁCH LOẠI DIỀU (${categories.length})</span>
          <button type="button" id="btn-reset-categories" class="btn btn-link text-xs text-muted p-0">
            🔄 Khôi phục mặc định
          </button>
        </div>

        <div class="categories-list-container">
          ${categories.map(cat => {
            const prodCount = products.filter(p => p.category === cat).length;
            return `
              <div class="catalog-item-card">
                <div class="catalog-item-info">
                  <span class="catalog-item-icon">🪁</span>
                  <div class="catalog-item-main">
                    <div class="catalog-item-title">${escapeHTML(cat)}</div>
                    <div class="catalog-item-subtitle text-xs text-muted">
                      ${prodCount > 0 ? `<b>${prodCount}</b> sản phẩm đang dùng` : 'Chưa có sản phẩm'}
                    </div>
                  </div>
                </div>
                <div class="catalog-item-actions">
                  <button type="button" class="btn btn-outline-primary btn-xs btn-rename-cat" data-name="${escapeHTML(cat)}">
                    ✏️ Đổi tên
                  </button>
                  <button type="button" class="btn btn-outline-danger btn-xs btn-delete-cat" data-name="${escapeHTML(cat)}" data-count="${prodCount}">
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
          <div class="form-row align-center">
            <div class="flex-2">
              <select id="settings-prod-cat-filter" class="form-select text-sm">
                <option value="all">-- Tất cả loại diều (${products.length}) --</option>
                ${categories.map(c => `
                  <option value="${escapeHTML(c)}" ${this.productCatFilter === c ? 'selected' : ''}>
                    ${escapeHTML(c)} (${products.filter(p => p.category === c).length})
                  </option>
                `).join('')}
              </select>
            </div>
            <div class="flex-1 text-right">
              <button type="button" id="btn-settings-add-prod" class="btn btn-primary btn-sm btn-block">
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
            <div class="quick-prod-price-line mt-1">
              <span class="text-primary text-bold text-sm">${formatVND(p.sellingPrice || 0)}</span>
              <span class="text-xs text-muted ml-2">• Tồn kho: <b class="${p.stock <= (p.lowStockThreshold || 5) ? 'text-danger' : 'text-success'}">${p.stock}</b></span>
            </div>
          </div>
        </div>
        <div class="quick-prod-actions mt-2 pt-2 border-top">
          <button type="button" class="btn btn-outline-primary btn-xs btn-quick-rename-prod" data-id="${p.id}" data-name="${escapeHTML(p.name)}">
            ✏️ Đổi tên nhanh
          </button>
          <button type="button" class="btn btn-outline-secondary btn-xs btn-quick-edit-full" data-id="${p.id}">
            ⚙️ Sửa chi tiết
          </button>
          <button type="button" class="btn btn-outline-danger btn-xs btn-quick-delete-prod" data-id="${p.id}" data-name="${escapeHTML(p.name)}">
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
          <div class="input-with-button-row">
            <input type="text" id="input-new-unit" class="form-input" placeholder="VD: Mét, Cây, Cặp, Túi..." maxlength="20">
            <button type="button" id="btn-add-unit" class="btn btn-primary">
              <span>+</span> Thêm ĐVT
            </button>
          </div>
        </div>

        <div class="text-xs text-muted text-bold mb-2">DANH SÁCH ĐƠN VỊ TÍNH HIỆN CÓ (${units.length})</div>

        <div class="units-grid">
          ${units.map(u => `
            <div class="unit-badge-card">
              <div class="unit-badge-name">
                <span class="unit-icon">📐</span>
                <b>${escapeHTML(u)}</b>
              </div>
              <div class="unit-badge-actions">
                <button type="button" class="btn btn-outline-primary btn-xs btn-rename-unit" data-unit="${escapeHTML(u)}" title="Đổi tên ĐVT">✏️</button>
                <button type="button" class="btn btn-outline-danger btn-xs btn-delete-unit" data-unit="${escapeHTML(u)}" title="Xóa ĐVT">🗑️</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  bindCatalogEvents(categories, products, units) {
    // 1. Chuyển đổi tab con (Loại diều, Mặt hàng, ĐVT)
    document.querySelectorAll('.catalog-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        this.catalogTab = tab;
        document.querySelectorAll('.catalog-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        ['categories', 'products', 'units'].forEach(t => {
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
