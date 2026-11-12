// Quản lý Bán Hàng (POS, Tạo đơn, Trừ kho Transaction, Hủy đơn hoàn kho - Mobile Optimized)
import { db } from '../db.js';
import {
  formatVND,
  parseVND,
  formatDateTime,
  formatDate,
  generateId,
  escapeHTML,
  numberToVietnameseWords,
  shareFileOrDownload,
  downloadBlobFile,
  compressImage
} from '../utils.js';
import { registerVietnameseFont } from '../vendor/roboto-font.js';
import { PRODUCT_CATEGORIES } from '../config.js';
import {
  resolveOrderQR,
  drawVietQRToJsPdf,
  normalizeTransferContent,
  hasVietQRConfig
} from '../vietqr.js';

export class SalesModule {
  constructor(app) {
    this.app = app;
    this.activeTab = 'pos'; // 'pos' | 'orders'
    this.cart = [];
    this.selectedCustomer = null; // null = Khách lẻ
    this.discountType = 'amount'; // 'amount' | 'percent'
    this.discountValue = 0;
    this.shippingFee = 0;
    this.notes = '';
    this.paymentMethod = 'cash'; // 'cash' | 'transfer' | 'debt' | 'partial'
    this.paidAmount = 0;
    this.searchProductQuery = '';
    this.posWarehouse = 'all'; // 'all' | 'new' | 'stock'
    this.posCategory = 'all';
    this.orderFilterStatus = 'all';
    this.orderSearchQuery = '';
    this.isDrawerOpen = false;
  }

  async render() {
    const container = document.getElementById('view-container');

    container.innerHTML = `
      <div class="view-header">
        <div class="header-title-row" style="flex-wrap: wrap; align-items: center; gap: 8px;">
          <div>
            <h1 class="view-title">⚡ Bán Hàng (Thu Ngân)</h1>
            <p class="view-subtitle">Chạm vào diều để thêm vào đơn bán nhanh</p>
          </div>
          <div class="header-tab-switch" style="display: flex; flex-wrap: wrap; align-items: center; gap: 4px; max-width: 100%;">
            <button class="tab-switch-btn ${this.activeTab === 'pos' ? 'active' : ''}" id="tab-btn-pos" style="flex: 1 1 auto; text-align: center;">🛍️ Bán Hàng</button>
            <button class="tab-switch-btn ${this.activeTab === 'orders' ? 'active' : ''}" id="tab-btn-orders" style="flex: 1 1 auto; text-align: center;">📋 Đơn Hàng</button>
          </div>
        </div>
      </div>

      <div id="sales-tab-content">
        ${this.activeTab === 'pos' ? await this.renderPosView() : await this.renderOrdersView()}
      </div>
    `;

    this.bindCommonEvents();
  }

  // ================= TAB 1: THU NGÂN POS =================
  async renderPosView() {
    const products = await db.getAll('products');
    this._cachedPosProducts = products;
    const customers = await db.getAll('customers');
    const shopSettings = (await db.getSetting('shop_info')) || {};
    this._cachedShopSettings = shopSettings;
    const categories = await db.getCategories();

    const newStockCount = products.filter(p => (p.warehouse || 'new') === 'new').length;
    const stockWhCount = products.filter(p => p.warehouse === 'stock').length;

    const filteredProducts = products.filter(p => {
      const matchWh = this.posWarehouse === 'all' || (p.warehouse || 'new') === this.posWarehouse;
      const matchCat = this.posCategory === 'all' || p.category === this.posCategory;
      const q = this.searchProductQuery.toLowerCase().trim();
      const matchQuery = !q || p.name.toLowerCase().includes(q) || (p.code && p.code.toLowerCase().includes(q));
      return matchWh && matchCat && matchQuery;
    });

    const totals = this.calculateTotals(shopSettings);
    const totalCartItems = this.cart.reduce((s, i) => s + i.quantity, 0);

    return `
      <div class="pos-layout">
        <!-- Khung danh mục diều -->
        <div class="pos-catalog-panel">
          <div class="search-filter-bar">
            <!-- Phân loại Kho Mới / Kho Tồn trên POS -->
            <div class="pos-warehouse-pill-row mb-2" style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">
              <button class="warehouse-filter-pill ${this.posWarehouse === 'all' ? 'active' : ''}" data-pos-wh="all" style="flex: 1 1 auto; display: inline-flex; align-items: center; justify-content: center; gap: 4px;">
                🌐 Toàn bộ (${products.length})
              </button>
              <button class="warehouse-filter-pill ${this.posWarehouse === 'new' ? 'active' : ''}" data-pos-wh="new" style="flex: 1 1 auto; display: inline-flex; align-items: center; justify-content: center; gap: 4px;">
                ✨ Kho Mới (${newStockCount})
              </button>
              <button class="warehouse-filter-pill ${this.posWarehouse === 'stock' ? 'active' : ''}" data-pos-wh="stock" style="flex: 1 1 auto; display: inline-flex; align-items: center; justify-content: center; gap: 4px;">
                📦 Kho Tồn (${stockWhCount})
              </button>
            </div>

            <div class="search-input-wrap">
              <input type="text" id="pos-product-search" class="form-input" placeholder="🔍 Tìm tên, mã diều..." value="${escapeHTML(this.searchProductQuery)}">
              <button id="btn-clear-pos-search" class="clear-search-btn" style="display:${this.searchProductQuery ? 'flex' : 'none'}">&times;</button>
            </div>
            <div class="category-tabs-scroll">
              <button class="cat-pill ${this.posCategory === 'all' ? 'active' : ''}" data-cat="all">Tất cả diều</button>
              ${categories.map(c => `
                <button class="cat-pill ${this.posCategory === c ? 'active' : ''}" data-cat="${escapeHTML(c)}">${escapeHTML(c)}</button>
              `).join('')}
            </div>
          </div>

          <div class="pos-product-grid" id="pos-product-grid">
            ${this._renderPosGridHtml(filteredProducts)}
          </div>
        </div>

        <!-- Thanh Nổi Giỏ Hàng Mobile (Chạm mở Drawer) -->
        ${this.cart.length > 0 ? `
          <div class="floating-cart-bar" id="floating-cart-bar">
            <div class="floating-cart-info">
              <span class="floating-cart-badge">${totalCartItems}</span>
              <div>
                <div class="text-xs" style="color: #94a3b8">Giỏ hàng:</div>
                <div class="floating-cart-total">${formatVND(totals.totalAmount)}</div>
              </div>
            </div>
            <button class="btn btn-success btn-sm" id="btn-open-drawer">
              <span>🛒 Xem Giỏ & Bán ➔</span>
            </button>
          </div>
        ` : ''}

        <!-- Khung Giỏ hàng & Thanh toán (Desktop: Cột bên phải, Mobile: Bottom Sheet Drawer) -->
        <div class="pos-cart-panel ${this.isDrawerOpen ? 'drawer-open' : ''}" id="pos-cart-panel">
          <!-- Thanh tay nắm trên Mobile -->
          <div class="drawer-handle-bar"></div>
          
          <div class="drawer-header-row mb-2" style="flex-wrap: wrap; align-items: center; gap: 8px;">
            <div>
              <h3 class="text-bold" style="font-size: 16px; margin: 0; display: flex; align-items: center; gap: 6px;">
                🛒 Giỏ Hàng <span class="badge badge-primary">${totalCartItems}</span>
              </h3>
              <div class="text-xs text-muted" style="margin-top: 2px;">Kiểm tra mặt hàng và tính tiền</div>
            </div>
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">
              ${this.cart.length > 0 ? `
                <button type="button" class="btn btn-outline-danger btn-xs" id="btn-clear-cart" title="Xóa toàn bộ giỏ hàng">
                  🗑️ Xóa hết
                </button>
              ` : ''}
              <button class="btn-icon btn-close-drawer" id="btn-close-drawer" style="border: none; font-size: 24px; color: #64748b; background: none; cursor: pointer; padding: 0; width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; line-height: 1;">&times;</button>
            </div>
          </div>

          <!-- Chọn khách hàng -->
          <div class="cart-customer-box">
            <div class="cart-customer-header" style="flex-wrap: wrap; gap: 8px;">
              <span class="cart-box-title">👤 Khách hàng:</span>
              <button id="btn-change-customer" class="btn btn-outline-primary btn-xs">
                ${this.selectedCustomer ? 'Đổi' : '+ Chọn khách'}
              </button>
            </div>
            <div class="cart-customer-info">
              ${this.selectedCustomer ? `
                <div class="selected-customer-pill" style="flex-wrap: wrap; gap: 8px;">
                  <span class="name text-bold">${escapeHTML(this.selectedCustomer.name)}</span>
                  ${this.selectedCustomer.phone ? `<span class="phone text-muted text-xs">📞 ${escapeHTML(this.selectedCustomer.phone)}</span>` : ''}
                  <button id="btn-remove-selected-cust" class="btn-remove-cust" title="Hủy chọn">&times;</button>
                </div>
              ` : `
                <div class="customer-walkin-pill text-muted text-xs">
                  <span>Khách lẻ (vãng lai)</span>
                </div>
              `}
            </div>
          </div>

          <!-- Danh sách các món trong giỏ hàng -->
          <div class="cart-items-list">
            ${this.cart.length === 0 ? `
              <div class="cart-empty">
                <span class="cart-empty-icon">🛒</span>
                <p class="text-bold">Giỏ hàng đang trống</p>
                <span class="cart-empty-hint text-xs">Bấm "🛒 Chọn Bán" trên sản phẩm để thêm vào đơn</span>
              </div>
            ` : this.cart.map((item, idx) => `
              <div class="cart-item-card" data-idx="${idx}">
                <!-- Dòng 1: Tên sản phẩm & Nút xóa rõ ràng -->
                <div class="cart-item-top-row">
                  <div class="cart-item-title">${escapeHTML(item.productName)}</div>
                  <button type="button" class="btn-remove-cart-item" data-idx="${idx}" title="Xóa món này khỏi giỏ">
                    🗑️ Xóa
                  </button>
                </div>

                <!-- Dòng 2: Đơn giá, Bộ tăng giảm số lượng to rõ & Thành tiền -->
                <div class="cart-item-bottom-row" style="flex-wrap: wrap; gap: 8px;">
                  <div class="cart-item-unit-box">
                    <span class="cart-unit-price">${formatVND(item.unitPrice)}</span>
                    <span class="cart-unit-text">/${escapeHTML(item.unit || 'chiếc')}</span>
                    <button type="button" class="btn-edit-line-price" data-idx="${idx}" title="Chỉnh đơn giá món này">✏️ Đổi giá</button>
                  </div>

                  <!-- Bộ chỉnh số lượng to bản cho ngón cái -->
                  <div class="cart-item-stepper">
                    <button type="button" class="btn-stepper btn-qty-dec" data-idx="${idx}" title="${item.quantity === 1 ? 'Xóa khỏi giỏ' : 'Bớt 1'}">
                      ${item.quantity === 1 ? '🗑️' : '−'}
                    </button>
                    <span class="stepper-qty">${item.quantity}</span>
                    <button type="button" class="btn-stepper btn-qty-inc" data-idx="${idx}" title="Thêm 1">+</button>
                  </div>

                  <div class="cart-item-subtotal-box">
                    <span class="cart-subtotal-val">${formatVND(item.subtotal)}</span>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>

          <!-- Chi tiết thanh toán -->
          ${this.cart.length > 0 ? `
            <div class="cart-summary-box">
              <div class="summary-line">
                <span>Tiền hàng:</span>
                <span class="text-bold">${formatVND(totals.itemsTotal)}</span>
              </div>

              <!-- Chiết khấu & Ship -->
              <div class="summary-line" style="flex-wrap: wrap; gap: 8px;">
                <div class="discount-label-row" style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">
                  <span class="text-bold text-xs">Chiết khấu (giảm giá):</span>
                  <div class="discount-toggle-group">
                    <button class="btn-toggle-disc ${this.discountType === 'amount' ? 'active' : ''}" id="disc-type-amt">₫</button>
                    <button class="btn-toggle-disc ${this.discountType === 'percent' ? 'active' : ''}" id="disc-type-pct">%</button>
                  </div>
                </div>
                <input type="number" id="input-discount-val" class="form-input-sm text-right text-bold" style="width: 120px" value="${this.discountValue || ''}" placeholder="${this.discountType === 'percent' ? 'Nhập %' : '0 ₫'}">
              </div>

              <div class="summary-line" style="flex-wrap: wrap; gap: 8px;">
                <span class="text-bold text-xs">Phí giao hàng (ship):</span>
                <input type="number" id="input-shipping-fee" class="form-input-sm text-right text-bold" style="width: 120px" value="${this.shippingFee || ''}" placeholder="0 ₫">
              </div>

              ${shopSettings.enableVat ? `
                <div class="summary-line text-muted">
                  <span>VAT (${shopSettings.vatRate || 8}%):</span>
                  <span>${formatVND(totals.vatAmount)}</span>
                </div>
              ` : ''}

              <div class="summary-line total-highlight">
                <span class="total-lbl text-bold">TỔNG CỘNG:</span>
                <span class="total-val text-primary text-bold">${formatVND(totals.totalAmount)}</span>
              </div>

              <!-- Hình thức thanh toán -->
              <div class="payment-method-selector">
                <label class="form-label-xs">Phương thức thanh toán:</label>
                <div class="payment-pills">
                  <button class="pay-pill ${this.paymentMethod === 'cash' ? 'active' : ''}" data-method="cash">💵 Tiền mặt</button>
                  <button class="pay-pill ${this.paymentMethod === 'qr' ? 'active' : ''}" data-method="qr">📱 Quét mã QR</button>
                  <button class="pay-pill ${this.paymentMethod === 'transfer' ? 'active' : ''}" data-method="transfer">🏦 Chuyển khoản</button>
                  <button class="pay-pill ${this.paymentMethod === 'debt' ? 'active' : ''}" data-method="debt">📝 Ghi nợ</button>
                  <button class="pay-pill ${this.paymentMethod === 'partial' ? 'active' : ''}" data-method="partial">💳 Trả 1 phần</button>
                </div>
              </div>

              <!-- Khung Quét mã QR thanh toán nếu chọn QR hoặc Chuyển khoản -->
              ${(this.paymentMethod === 'qr' || this.paymentMethod === 'transfer') ? `
                <div id="pos-qr-payment-container">
                  ${this._renderPosQrPanelHtml(shopSettings, totals.totalAmount, false)}
                </div>
              ` : ''}

              ${this.paymentMethod === 'partial' ? `
                <div class="partial-pay-box card p-2 bg-light mt-1">
                  <div class="summary-line">
                    <span class="text-bold text-xs">Khách trả trước (VNĐ):</span>
                    <input type="number" id="input-paid-amount" class="form-input-sm text-right text-bold text-primary" style="width: 130px" value="${this.paidAmount || 0}" placeholder="Nhập tiền trả">
                  </div>
                  <div class="summary-line text-danger mt-1">
                    <span class="text-bold text-xs">Còn nợ ghi sổ:</span>
                    <span class="text-bold" id="pos-partial-debt-val">${formatVND(Math.max(0, totals.totalAmount - this.paidAmount))}</span>
                  </div>
                  <div id="pos-partial-qr-container">
                    ${this.paidAmount > 0 ? this._renderPosQrPanelHtml(shopSettings, Math.min(totals.totalAmount, Math.max(0, this.paidAmount)), true) : ''}
                  </div>
                </div>
              ` : ''}

              <!-- Ghi chú đơn -->
              <div class="form-group mb-1 mt-1">
                <input type="text" id="input-order-notes" class="form-input-sm" placeholder="Ghi chú đơn hàng (nếu có)..." value="${escapeHTML(this.notes)}">
              </div>

              <!-- Nút hoàn tất đơn to bấm 1 tay -->
              <button id="btn-complete-order" class="btn btn-success btn-block btn-lg btn-complete-order">
                <span>${(this.paymentMethod === 'qr' || this.paymentMethod === 'transfer')
                  ? `✅ Đã nhận tiền (Hoàn tất đơn) (${formatVND(totals.totalAmount)})`
                  : `✓ HOÀN TẤT ĐƠN (${formatVND(totals.totalAmount)})`}</span>
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  _detectPdfImageFormat(dataUrl) {
    if (typeof dataUrl !== 'string') return 'JPEG';
    const lower = dataUrl.slice(0, 40).toLowerCase();
    if (lower.includes('image/png')) return 'PNG';
    if (lower.includes('image/webp')) return 'WEBP';
    return 'JPEG';
  }

  _renderPosQrPanelHtml(shopSettings = {}, amountToPay = 0, isPartial = false) {
    const cleanAmount = Math.max(0, Math.round(Number(amountToPay) || 0));
    const transferDesc = 'THANH TOAN DON HANG';
    const qrInfo = resolveOrderQR(shopSettings, cleanAmount, transferDesc);

    const offlineNoticeHtml = `
      <div class="text-xs mt-2 mb-2 text-left" style="padding: 6px 8px; border-radius: 6px; background: #fffbeb; border: 1px solid #fcd34d; color: #92400e; line-height: 1.4;">
        ⚠️ Lưu ý: App chạy offline nên KHÔNG tự biết khách đã chuyển tiền hay chưa. Chủ shop kiểm tra app ngân hàng rồi tự bấm xác nhận.
      </div>
    `;

    if (qrInfo) {
      const isVietQR = qrInfo.type === 'vietqr';
      return `
        <div class="pos-qr-payment-card card p-2 mt-2 bg-light text-center border-primary-subtle">
          <div class="text-xs text-bold text-primary mb-1">
            ${isVietQR
              ? (isPartial ? '📱 MÃ VIETQR TRẢ TRƯỚC (TỰ ĐIỀN SỐ TIỀN)' : '📱 MÃ VIETQR OFFLINE (TỰ ĐIỀN SỐ TIỀN)')
              : '📱 MÃ QR THANH TOÁN (NGÂN HÀNG)'}
          </div>
          <div class="pos-qr-img-wrap" style="position:relative; display:inline-block; margin: 4px auto;">
            <img src="${qrInfo.dataUrl}" class="pos-qr-img" alt="Mã QR thanh toán">
          </div>
          <div class="text-xs text-muted mt-1">
            ${isPartial ? 'Số tiền trả trước:' : 'Số tiền cần thanh toán:'}
            <b class="text-success text-sm">${formatVND(cleanAmount)}</b>
          </div>
          ${isVietQR ? `
            <div class="text-xs text-bold text-muted mt-1">
              ${escapeHTML(qrInfo.bankLabel)} • STK: <span style="color:#0f172a;">${escapeHTML(qrInfo.account)}</span>${qrInfo.accountName ? ` (${escapeHTML(qrInfo.accountName)})` : ''}
            </div>
            <div class="text-xs text-muted mt-1">
              Nội dung CK: <code>${escapeHTML(qrInfo.normalizedDesc || transferDesc)}</code>
            </div>
          ` : (shopSettings.bankInfo ? `<div class="text-xs text-bold text-muted mt-1">${escapeHTML(shopSettings.bankInfo)}</div>` : '')}
          ${offlineNoticeHtml}
          <button type="button" class="btn btn-primary btn-block btn-sm mt-1" id="btn-open-fullscreen-qr">
            🔍 Mở QR Toàn Màn Hình Cho Khách Quét
          </button>
        </div>
      `;
    }

    return `
      <div class="pos-qr-payment-card card p-2 mt-2 bg-light text-center border-primary-subtle">
        <div class="text-xs text-bold text-warning mb-1">⚠️ Chưa cấu hình ngân hàng VietQR hoặc ảnh mã QR</div>
        <p class="text-xs text-muted mb-2">Vào Cài Đặt để nhập tài khoản ngân hàng VietQR (tự điền số tiền) hoặc tải ảnh QR tĩnh.</p>
        ${shopSettings.bankInfo ? `<div class="text-xs text-bold mb-2">${escapeHTML(shopSettings.bankInfo)}</div>` : ''}
        ${offlineNoticeHtml}
        <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 8px;">
          <button type="button" class="btn btn-primary btn-xs" id="btn-pos-goto-settings">
            ⚙️ Cài Đặt Ngân Hàng
          </button>
          <button type="button" class="btn btn-outline-primary btn-xs" id="btn-quick-upload-qr">
            ➕ Thêm Ảnh QR
          </button>
        </div>
        <input type="file" id="pos-qr-file-input" accept="image/*" style="display:none">
      </div>
    `;
  }

  _renderPosGridHtml(filteredProducts) {
    if (filteredProducts.length === 0) {
      return `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <p class="empty-icon">🪁</p>
          <p class="empty-title">Không tìm thấy diều nào</p>
          <p class="empty-desc">Thử tìm tên khác hoặc vào mục Kho Diều để thêm mới.</p>
        </div>
      `;
    }

    return filteredProducts.map(p => {
      const inCartItem = this.cart.find(i => i.productId === p.id);
      const qtyInCart = inCartItem ? inCartItem.quantity : 0;
      const isOutOfStock = p.stock <= 0;
      const isLowStock = p.stock <= (p.lowStockThreshold || 5);
      const isStockWh = p.warehouse === 'stock';

      return `
        <div class="pos-item-card ${isOutOfStock ? 'out-of-stock' : ''}" data-id="${p.id}">
          <!-- Tag kho hàng nổi góc trên bên trái ảnh -->
          <span class="pos-card-wh-chip ${isStockWh ? 'wh-chip-stock' : 'wh-chip-new'}">
            ${isStockWh ? '📦 Kho Tồn' : '✨ Diều Mới'}
          </span>

          ${p.photo ? `
            <img src="${p.photo}" class="pos-item-img" alt="${escapeHTML(p.name)}" loading="lazy">
          ` : `
            <div class="pos-item-img-placeholder">🪁</div>
          `}

          <div class="pos-item-body">
            <div class="pos-item-name" title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</div>
            <div class="pos-item-price">${formatVND(p.sellingPrice)}</div>
            <div class="pos-item-stock-row">
              <span class="pos-stock-tag ${isOutOfStock ? 'stock-out' : isLowStock ? 'stock-low' : 'stock-ok'}">
                ${isOutOfStock ? '⚠️ Hết hàng' : `Kho còn: ${p.stock} ${escapeHTML(p.unit || '')}`}
              </span>
            </div>

            <!-- Nút thao tác Thêm / Xóa ngay trên thẻ mặt hàng -->
            <div class="pos-card-action-bar ${qtyInCart > 0 ? 'is-active' : ''}">
              ${qtyInCart === 0 ? `
                <button type="button" class="btn-pos-add" data-id="${p.id}" ${isOutOfStock ? 'disabled' : ''}>
                  🛒 Chọn Bán
                </button>
              ` : `
                <div class="pos-card-qty-stepper">
                  <button type="button" class="btn-card-qty-dec" data-id="${p.id}" title="${qtyInCart === 1 ? 'Xóa khỏi giỏ' : 'Bớt 1'}">
                    ${qtyInCart === 1 ? '🗑️' : '−'}
                  </button>
                  <span class="card-qty-num">${qtyInCart} trong giỏ</span>
                  <button type="button" class="btn-card-qty-inc" data-id="${p.id}" title="Thêm 1">+</button>
                </div>
              `}
            </div>
          </div>

          ${qtyInCart > 0 ? `
            <div class="pos-item-badge">+${qtyInCart}</div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  // ================= TAB 2: DANH SÁCH ĐƠN HÀNG =================
  async renderOrdersView() {
    const orders = await db.getAll('orders');
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    this._cachedOrders = orders;

    const filtered = orders.filter(o => {
      const matchStatus = this.orderFilterStatus === 'all' || o.status === this.orderFilterStatus;
      const q = this.orderSearchQuery.toLowerCase().trim();
      const matchQ = !q ||
        o.id.toLowerCase().includes(q) ||
        (o.customerName && o.customerName.toLowerCase().includes(q)) ||
        (o.customerPhone && o.customerPhone.includes(q));
      return matchStatus && matchQ;
    });

    return `
      <div class="orders-view-panel">
        <div class="search-filter-bar">
          <div class="search-input-wrap">
            <input type="text" id="order-search" class="form-input" placeholder="🔍 Tìm theo mã đơn, khách, SĐT..." value="${escapeHTML(this.orderSearchQuery)}">
            <button id="btn-clear-order-search" class="clear-search-btn" style="display:${this.orderSearchQuery ? 'flex' : 'none'}">&times;</button>
          </div>
          <div class="category-tabs-scroll">
            <button class="cat-pill ${this.orderFilterStatus === 'all' ? 'active' : ''}" data-status="all">Tất cả (${orders.length})</button>
            <button class="cat-pill ${this.orderFilterStatus === 'completed' ? 'active' : ''}" data-status="completed">Hoàn thành</button>
            <button class="cat-pill ${this.orderFilterStatus === 'cancelled' ? 'active' : ''}" data-status="cancelled">Đã hủy</button>
          </div>
        </div>

        <div class="orders-list" id="orders-list-container">
          ${this._renderOrdersListHtml(filtered)}
        </div>
      </div>
    `;
  }

  _renderOrdersListHtml(filtered) {
    if (filtered.length === 0) {
      return `
        <div class="empty-state">
          <p class="empty-icon">📦</p>
          <p class="empty-title">Không tìm thấy đơn hàng nào</p>
        </div>
      `;
    }

    return filtered.map(o => {
      const isCancelled = o.status === 'cancelled';
      return `
        <div class="order-card ${isCancelled ? 'card-cancelled' : ''}" data-id="${o.id}">
          <div class="order-card-top" style="flex-wrap: wrap; align-items: center; gap: 8px;">
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">
              <span class="order-id-badge text-bold">${escapeHTML(o.id)}</span>
              <span class="order-time text-muted text-xs ml-2">${formatDateTime(o.createdAt)}</span>
            </div>
            <div>
              ${isCancelled ? `
                <span class="badge badge-danger">Đã hủy</span>
              ` : o.debtAmount > 0 ? `
                <span class="badge badge-warning">Còn nợ ${formatVND(o.debtAmount)}</span>
              ` : `
                <span class="badge badge-success">Đã thanh toán</span>
              `}
            </div>
          </div>

          <div class="order-card-mid">
            <div class="order-customer-line text-sm">
              <b>${escapeHTML(o.customerName || 'Khách lẻ')}</b>
              ${o.customerPhone ? `<span class="text-muted ml-2">📞 ${escapeHTML(o.customerPhone)}</span>` : ''}
            </div>
            <div class="order-items-snippet text-xs text-muted mt-1">
              ${(o.items || []).map(i => `${escapeHTML(i.productName)} (x${i.quantity})`).join(', ')}
            </div>
          </div>

          <div class="order-card-bottom" style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; margin-top: 6px;">
            <div class="order-pay-info text-xs">
              <span>${o.paymentMethod === 'cash' ? '💵 Tiền mặt' : o.paymentMethod === 'qr' ? '📱 Quét mã QR' : o.paymentMethod === 'transfer' ? '🏦 Chuyển khoản' : o.paymentMethod === 'debt' ? '📝 Ghi nợ' : '💳 Trả một phần'}</span>
            </div>
            <div class="order-total-price">
              Tổng: <span class="text-bold text-primary">${formatVND(o.totalAmount)}</span>
            </div>
          </div>

          <div class="order-card-actions mt-2" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 8px;">
            <button class="btn btn-outline-primary btn-xs btn-view-order-detail" data-id="${o.id}">👁️ Phiếu thu</button>
            ${!isCancelled ? `
              <button class="btn btn-outline-danger btn-xs btn-cancel-order" data-id="${o.id}">❌ Hủy đơn & hoàn kho</button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  calculateTotals(shopSettings = {}) {
    const itemsTotal = this.cart.reduce((sum, item) => sum + (item.subtotal || 0), 0);

    let discountAmount = 0;
    if (this.discountType === 'percent') {
      discountAmount = Math.round((itemsTotal * (this.discountValue || 0)) / 100);
    } else {
      discountAmount = Math.min(itemsTotal, this.discountValue || 0);
    }

    const ship = this.shippingFee || 0;
    const afterDiscount = Math.max(0, itemsTotal - discountAmount) + ship;

    let vatAmount = 0;
    if (shopSettings.enableVat) {
      const rate = shopSettings.vatRate || 8;
      vatAmount = Math.round((afterDiscount * rate) / 100);
    }

    const totalAmount = afterDiscount + vatAmount;

    return {
      itemsTotal,
      discountAmount,
      shippingFee: ship,
      vatAmount,
      totalAmount
    };
  }

  addItemToCart(product) {
    const existing = this.cart.find(i => i.productId === product.id);
    if (existing) {
      existing.quantity += 1;
      existing.subtotal = existing.quantity * existing.unitPrice;
    } else {
      this.cart.push({
        productId: product.id,
        productCode: product.code || '',
        productName: product.name,
        unit: product.unit || 'Chiếc',
        unitPrice: product.sellingPrice || 0,
        costPrice: product.costPrice || 0,
        quantity: 1,
        subtotal: product.sellingPrice || 0
      });
    }
    this.render();
  }

  decrementItemInCart(productId) {
    const idx = this.cart.findIndex(i => i.productId === productId);
    if (idx !== -1) {
      if (this.cart[idx].quantity > 1) {
        this.cart[idx].quantity -= 1;
        this.cart[idx].subtotal = this.cart[idx].quantity * this.cart[idx].unitPrice;
      } else {
        this.cart.splice(idx, 1);
        if (this.cart.length === 0) {
          this.isDrawerOpen = false;
        }
      }
      this.render();
    }
  }

  setCustomer(customer) {
    this.selectedCustomer = customer;
    this.render();
  }

  bindCommonEvents() {
    const tabPos = document.getElementById('tab-btn-pos');
    const tabOrders = document.getElementById('tab-btn-orders');
    if (tabPos) {
      tabPos.addEventListener('click', () => {
        this.activeTab = 'pos';
        this.render();
      });
    }
    if (tabOrders) {
      tabOrders.addEventListener('click', () => {
        this.activeTab = 'orders';
        this.render();
      });
    }

    if (this.activeTab === 'pos') {
      this.bindPosEvents();
    } else {
      this.bindOrdersEvents();
    }
  }

  bindPosEvents() {
    // Mở / Đóng Drawer giỏ hàng trên Mobile
    const openDrawerBtn = document.getElementById('btn-open-drawer');
    const closeDrawerBtn = document.getElementById('btn-close-drawer');
    const cartPanel = document.getElementById('pos-cart-panel');

    const openDrawer = () => {
      this.isDrawerOpen = true;
      if (cartPanel) cartPanel.classList.add('drawer-open');
      let backdrop = document.getElementById('cart-drawer-backdrop');
      if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'cart-drawer-backdrop';
        backdrop.className = 'drawer-backdrop';
        document.body.appendChild(backdrop);
        backdrop.addEventListener('click', closeDrawer);
      }
    };

    const closeDrawer = () => {
      this.isDrawerOpen = false;
      if (cartPanel) cartPanel.classList.remove('drawer-open');
      const backdrop = document.getElementById('cart-drawer-backdrop');
      if (backdrop) backdrop.remove();
    };

    if (openDrawerBtn) openDrawerBtn.addEventListener('click', openDrawer);
    if (closeDrawerBtn) closeDrawerBtn.addEventListener('click', closeDrawer);

    // Tìm sản phẩm (cập nhật lưới tại chỗ để KHÔNG làm mất bàn phím điện thoại)
    const updatePosGridOnly = () => {
      const clearBtn = document.getElementById('btn-clear-pos-search');
      if (clearBtn) clearBtn.style.display = this.searchProductQuery ? 'flex' : 'none';
      const gridEl = document.getElementById('pos-product-grid');
      if (!gridEl) return;
      const products = this._cachedPosProducts || [];
      const q = this.searchProductQuery.toLowerCase().trim();
      const filteredProducts = products.filter(p => {
        const matchWh = this.posWarehouse === 'all' || (p.warehouse || 'new') === this.posWarehouse;
        const matchCat = this.posCategory === 'all' || p.category === this.posCategory;
        const matchQuery = !q || p.name.toLowerCase().includes(q) || (p.code && p.code.toLowerCase().includes(q));
        return matchWh && matchCat && matchQuery;
      });
      gridEl.innerHTML = this._renderPosGridHtml(filteredProducts);
      this.bindPosGridCardEvents();
    };

    const searchInput = document.getElementById('pos-product-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchProductQuery = e.target.value;
        updatePosGridOnly();
      });
    }
    const clearSearch = document.getElementById('btn-clear-pos-search');
    if (clearSearch) {
      clearSearch.addEventListener('click', () => {
        this.searchProductQuery = '';
        if (searchInput) searchInput.value = '';
        updatePosGridOnly();
        if (searchInput) searchInput.focus();
      });
    }

    // Lọc theo Kho hàng POS (Kho Mới / Kho Tồn)
    document.querySelectorAll('[data-pos-wh]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.posWarehouse = btn.dataset.posWh;
        this.render();
      });
    });

    // Lọc danh mục POS
    document.querySelectorAll('.pos-catalog-panel .cat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        this.posCategory = btn.dataset.cat;
        this.render();
      });
    });

    // 1. Thao tác ngay trên thẻ sản phẩm (Thêm / Tăng / Giảm / Xóa)
    this.bindPosGridCardEvents();

    // 2. Thao tác bên trong Giỏ Hàng Drawer
    // Nút xóa toàn bộ giỏ hàng
    const clearCartBtn = document.getElementById('btn-clear-cart');
    if (clearCartBtn) {
      clearCartBtn.addEventListener('click', () => {
        if (this.cart.length === 0) return;
        if (confirm('Bạn có chắc muốn xóa sạch toàn bộ giỏ hàng này không?')) {
          this.cart = [];
          closeDrawer();
          this.render();
        }
      });
    }

    // Tăng số lượng trong drawer
    document.querySelectorAll('.btn-qty-inc').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx, 10);
        if (this.cart[idx]) {
          this.cart[idx].quantity += 1;
          this.cart[idx].subtotal = this.cart[idx].quantity * this.cart[idx].unitPrice;
          this.render();
        }
      });
    });

    // Giảm số lượng trong drawer (bấm khi là 1 sẽ xóa khỏi giỏ)
    document.querySelectorAll('.btn-qty-dec').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx, 10);
        if (this.cart[idx]) {
          if (this.cart[idx].quantity > 1) {
            this.cart[idx].quantity -= 1;
            this.cart[idx].subtotal = this.cart[idx].quantity * this.cart[idx].unitPrice;
          } else {
            this.cart.splice(idx, 1);
            if (this.cart.length === 0) closeDrawer();
          }
          this.render();
        }
      });
    });

    // Xóa 1 món trong drawer
    document.querySelectorAll('.btn-remove-cart-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx, 10);
        this.cart.splice(idx, 1);
        if (this.cart.length === 0) closeDrawer();
        this.render();
      });
    });

    // Đổi đơn giá từng dòng trong drawer
    document.querySelectorAll('.btn-edit-line-price').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx, 10);
        if (this.cart[idx]) {
          const cur = this.cart[idx].unitPrice;
          const input = prompt(`Nhập đơn giá mới cho "${this.cart[idx].productName}" (VNĐ):`, cur);
          if (input !== null) {
            const val = parseVND(input);
            if (!isNaN(val) && val >= 0) {
              this.cart[idx].unitPrice = val;
              this.cart[idx].subtotal = this.cart[idx].quantity * val;
              this.render();
            }
          }
        }
      });
    });

    // Chọn khách hàng
    const changeCustBtn = document.getElementById('btn-change-customer');
    if (changeCustBtn) {
      changeCustBtn.addEventListener('click', () => this.showCustomerSelectModal());
    }

    const removeCustBtn = document.getElementById('btn-remove-selected-cust');
    if (removeCustBtn) {
      removeCustBtn.addEventListener('click', () => {
        this.selectedCustomer = null;
        this.render();
      });
    }

    // Chiết khấu type
    const btnAmt = document.getElementById('disc-type-amt');
    const btnPct = document.getElementById('disc-type-pct');
    if (btnAmt && btnPct) {
      btnAmt.addEventListener('click', () => {
        this.discountType = 'amount';
        this.render();
      });
      btnPct.addEventListener('click', () => {
        this.discountType = 'percent';
        this.render();
      });
    }

    const discValInput = document.getElementById('input-discount-val');
    if (discValInput) {
      discValInput.addEventListener('input', (e) => {
        this.discountValue = parseInt(e.target.value, 10) || 0;
        this.updatePosSummaryOnly();
      });
    }

    const shipInput = document.getElementById('input-shipping-fee');
    if (shipInput) {
      shipInput.addEventListener('input', (e) => {
        this.shippingFee = parseInt(e.target.value, 10) || 0;
        this.updatePosSummaryOnly();
      });
    }

    // Phương thức thanh toán
    document.querySelectorAll('.pay-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const method = btn.dataset.method;
        if (method === 'debt' && !this.selectedCustomer) {
          alert('Khách lẻ không thể ghi nợ! Vui lòng chọn hoặc thêm khách hàng để theo dõi công nợ.');
          this.showCustomerSelectModal();
          return;
        }
        this.paymentMethod = method;
        this.render();
      });
    });

    const paidInput = document.getElementById('input-paid-amount');
    if (paidInput) {
      paidInput.addEventListener('input', async (e) => {
        this.paidAmount = parseInt(e.target.value, 10) || 0;
        const shop = this._cachedShopSettings || (await db.getSetting('shop_info')) || {};
        const totals = this.calculateTotals(shop);
        const debtEl = document.getElementById('pos-partial-debt-val');
        if (debtEl) {
          debtEl.textContent = formatVND(Math.max(0, totals.totalAmount - this.paidAmount));
        }
        const partialQrEl = document.getElementById('pos-partial-qr-container');
        if (partialQrEl) {
          partialQrEl.innerHTML = this.paidAmount > 0
            ? this._renderPosQrPanelHtml(shop, Math.min(totals.totalAmount, Math.max(0, this.paidAmount)), true)
            : '';
          this.bindPosQrEvents();
        }
      });
    }

    const notesInput = document.getElementById('input-order-notes');
    if (notesInput) {
      notesInput.addEventListener('input', (e) => {
        this.notes = e.target.value;
      });
    }

    // Nút Hoàn tất đơn
    const completeBtn = document.getElementById('btn-complete-order');
    if (completeBtn) {
      completeBtn.addEventListener('click', () => this.handleCompleteOrder());
    }

    this.bindPosQrEvents();
  }

  bindPosQrEvents() {
    // Mở QR toàn màn hình cho khách quét từ giỏ hàng
    const openFullscreenQrBtn = document.getElementById('btn-open-fullscreen-qr');
    if (openFullscreenQrBtn) {
      openFullscreenQrBtn.addEventListener('click', async () => {
        const shop = (await db.getSetting('shop_info')) || {};
        const totals = this.calculateTotals(shop);
        const amountToPay = this.paymentMethod === 'partial'
          ? Math.min(totals.totalAmount, Math.max(0, this.paidAmount || 0))
          : totals.totalAmount;
        const qrInfo = resolveOrderQR(shop, amountToPay, 'THANH TOAN DON HANG');
        this.showFullScreenQrModal(
          qrInfo || shop.qrCode,
          shop.bankInfo,
          amountToPay,
          {
            description: (qrInfo && qrInfo.normalizedDesc) || 'THANH TOAN DON HANG',
            onConfirmPaid: () => this.handleCompleteOrder()
          }
        );
      });
    }

    // Đi tới Cài đặt ngân hàng VietQR
    const gotoSettingsBtn = document.getElementById('btn-pos-goto-settings');
    if (gotoSettingsBtn) {
      gotoSettingsBtn.addEventListener('click', () => {
        this.isDrawerOpen = false;
        const backdrop = document.getElementById('cart-drawer-backdrop');
        if (backdrop) backdrop.remove();
        if (this.app && typeof this.app.navigateTo === 'function') {
          this.app.navigateTo('settings');
        }
      });
    }

    // Tải ảnh QR nhanh ngay trong giỏ hàng nếu chưa có
    const quickUploadQrBtn = document.getElementById('btn-quick-upload-qr');
    const posQrFileInput = document.getElementById('pos-qr-file-input');
    if (quickUploadQrBtn && posQrFileInput) {
      quickUploadQrBtn.addEventListener('click', () => posQrFileInput.click());
      posQrFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
          try {
            const qrBase64 = await compressImage(file, 600, 0.85);
            const shop = (await db.getSetting('shop_info')) || {};
            shop.qrCode = qrBase64;
            await db.saveSetting('shop_info', shop);
            alert('✓ Đã thêm ảnh mã QR thành công!');
            this.render();
          } catch (err) {
            alert('Lỗi nén ảnh QR: ' + err.message);
          }
        }
      });
    }
  }

  async updatePosSummaryOnly() {
    const shopSettings = (await db.getSetting('shop_info')) || {};
    this._cachedShopSettings = shopSettings;
    const totals = this.calculateTotals(shopSettings);
    const totalEl = document.querySelector('.total-val');
    const completeBtnSpan = document.querySelector('#btn-complete-order span');
    const floatingTotalEl = document.querySelector('.floating-cart-total');

    if (totalEl) totalEl.textContent = formatVND(totals.totalAmount);
    if (completeBtnSpan) {
      const isOnlinePay = this.paymentMethod === 'qr' || this.paymentMethod === 'transfer';
      completeBtnSpan.textContent = isOnlinePay
        ? `✅ Đã nhận tiền (Hoàn tất đơn) (${formatVND(totals.totalAmount)})`
        : `✓ HOÀN TẤT ĐƠN (${formatVND(totals.totalAmount)})`;
    }
    if (floatingTotalEl) floatingTotalEl.textContent = formatVND(totals.totalAmount);

    if (this.paymentMethod === 'qr' || this.paymentMethod === 'transfer') {
      const qrBox = document.getElementById('pos-qr-payment-container');
      if (qrBox) {
        qrBox.innerHTML = this._renderPosQrPanelHtml(shopSettings, totals.totalAmount, false);
        this.bindPosQrEvents();
      }
    } else if (this.paymentMethod === 'partial') {
      const debtEl = document.getElementById('pos-partial-debt-val');
      if (debtEl) {
        debtEl.textContent = formatVND(Math.max(0, totals.totalAmount - this.paidAmount));
      }
      const partialQrEl = document.getElementById('pos-partial-qr-container');
      if (partialQrEl && this.paidAmount > 0) {
        partialQrEl.innerHTML = this._renderPosQrPanelHtml(
          shopSettings,
          Math.min(totals.totalAmount, Math.max(0, this.paidAmount)),
          true
        );
        this.bindPosQrEvents();
      }
    }
  }

  bindPosGridCardEvents() {
    document.querySelectorAll('.btn-pos-add').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const p = await db.getById('products', btn.dataset.id);
        if (p) this.addItemToCart(p);
      });
    });

    document.querySelectorAll('.btn-card-qty-inc').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const p = await db.getById('products', btn.dataset.id);
        if (p) this.addItemToCart(p);
      });
    });

    document.querySelectorAll('.btn-card-qty-dec').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        this.decrementItemInCart(btn.dataset.id);
      });
    });

    document.querySelectorAll('.pos-item-card').forEach(card => {
      card.addEventListener('click', async (e) => {
        if (e.target.closest('.pos-card-action-bar')) return;
        const p = await db.getById('products', card.dataset.id);
        if (p) this.addItemToCart(p);
      });
    });
  }

  bindOrdersEvents() {
    const updateOrdersListOnly = () => {
      const clearBtn = document.getElementById('btn-clear-order-search');
      if (clearBtn) clearBtn.style.display = this.orderSearchQuery ? 'flex' : 'none';
      const listEl = document.getElementById('orders-list-container');
      if (!listEl) return;
      const orders = this._cachedOrders || [];
      const q = this.orderSearchQuery.toLowerCase().trim();
      const filtered = orders.filter(o => {
        const matchStatus = this.orderFilterStatus === 'all' || o.status === this.orderFilterStatus;
        const matchQ = !q ||
          o.id.toLowerCase().includes(q) ||
          (o.customerName && o.customerName.toLowerCase().includes(q)) ||
          (o.customerPhone && o.customerPhone.includes(q));
        return matchStatus && matchQ;
      });
      listEl.innerHTML = this._renderOrdersListHtml(filtered);
      this.bindOrderCardEvents();
    };

    const searchInput = document.getElementById('order-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.orderSearchQuery = e.target.value;
        updateOrdersListOnly();
      });
    }

    const clearSearch = document.getElementById('btn-clear-order-search');
    if (clearSearch) {
      clearSearch.addEventListener('click', () => {
        this.orderSearchQuery = '';
        if (searchInput) searchInput.value = '';
        updateOrdersListOnly();
        if (searchInput) searchInput.focus();
      });
    }

    document.querySelectorAll('.orders-view-panel .cat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        this.orderFilterStatus = btn.dataset.status;
        this.render();
      });
    });

    this.bindOrderCardEvents();
  }

  bindOrderCardEvents() {
    document.querySelectorAll('.btn-view-order-detail').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showOrderDetailModal(btn.dataset.id);
      });
    });

    document.querySelectorAll('.btn-cancel-order').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleCancelOrder(btn.dataset.id);
      });
    });

    document.querySelectorAll('.order-card').forEach(card => {
      card.addEventListener('click', () => {
        this.showOrderDetailModal(card.dataset.id);
      });
    });
  }

  // ================= HOÀN TẤT ĐƠN & TRỪ TỒN KHO TRANSACTION =================
  async handleCompleteOrder() {
    if (this.cart.length === 0) {
      alert('Giỏ hàng trống! Vui lòng chọn diều.');
      return;
    }

    if (this.paymentMethod === 'debt' && !this.selectedCustomer) {
      alert('Không thể ghi nợ cho Khách lẻ. Vui lòng bấm "Chọn khách" trước.');
      return;
    }

    const shopSettings = (await db.getSetting('shop_info')) || {};
    const totals = this.calculateTotals(shopSettings);

    // 1. Kiểm tra tồn kho của từng món
    const allProducts = await db.getAll('products');
    const warnings = [];

    for (const item of this.cart) {
      const p = allProducts.find(x => x.id === item.productId);
      const currentStock = p ? p.stock : 0;
      if (item.quantity > currentStock) {
        warnings.push(`- "${item.productName}": Tồn kho chỉ còn ${currentStock} cái, bạn bán ${item.quantity} cái (sẽ âm ${item.quantity - currentStock}).`);
      }
    }

    if (warnings.length > 0) {
      const confirmContinue = confirm(
        `⚠️ CẢNH BÁO BÁN VƯỢT TỒN KHO:\n\n${warnings.join('\n')}\n\nBạn có muốn tiếp tục xuất bán và ghi nhận tồn kho âm không?`
      );
      if (!confirmContinue) return;
    }

    // 2. Tính số tiền thanh toán và công nợ
    let paid = totals.totalAmount;
    let debt = 0;
    if (this.paymentMethod === 'debt') {
      paid = 0;
      debt = totals.totalAmount;
    } else if (this.paymentMethod === 'partial') {
      paid = Math.min(totals.totalAmount, this.paidAmount || 0);
      debt = Math.max(0, totals.totalAmount - paid);
    }

    const orderId = generateId('DH');
    const now = new Date().toISOString();

    const orderRecord = {
      id: orderId,
      customerId: this.selectedCustomer ? this.selectedCustomer.id : null,
      customerName: this.selectedCustomer ? this.selectedCustomer.name : 'Khách lẻ',
      customerPhone: this.selectedCustomer ? (this.selectedCustomer.phone || '') : '',
      items: this.cart.map(i => ({ ...i })),
      subtotal: totals.itemsTotal,
      discountType: this.discountType,
      discountValue: this.discountValue,
      discountAmount: totals.discountAmount,
      shippingFee: totals.shippingFee,
      vatRate: shopSettings.enableVat ? (shopSettings.vatRate || 8) : 0,
      vatAmount: totals.vatAmount,
      totalAmount: totals.totalAmount,
      paidAmount: paid,
      debtAmount: debt,
      paymentMethod: this.paymentMethod,
      status: 'completed',
      notes: this.notes,
      createdAt: now,
      isDeleted: false
    };

    // 3. THỰC HIỆN TRANSACTION AN TOÀN TRÊN NHIỀU BẢNG
    try {
      await db.runTransaction(
        ['orders', 'products', 'inventory_logs', 'settings'],
        'readwrite',
        (tx) => {
          const orderStore = tx.objectStore('orders');
          const productStore = tx.objectStore('products');
          const invLogStore = tx.objectStore('inventory_logs');

          orderStore.put(orderRecord);

          for (const item of this.cart) {
            const prodReq = productStore.get(item.productId);
            prodReq.onsuccess = () => {
              const product = prodReq.result;
              if (product) {
                const stockBefore = product.stock || 0;
                const stockAfter = stockBefore - item.quantity;
                product.stock = stockAfter;
                product.updatedAt = now;
                productStore.put(product);

                invLogStore.put({
                  id: 'LOG-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
                  productId: product.id,
                  productCode: product.code || '',
                  productName: product.name,
                  changeType: 'sale',
                  quantityChange: -item.quantity,
                  stockBefore,
                  stockAfter,
                  referenceId: orderId,
                  reason: `Bán đơn hàng ${orderId} (${orderRecord.customerName})`,
                  createdAt: now
                });
              }
            };
          }
        }
      );

      // Đóng drawer nếu mở
      this.isDrawerOpen = false;
      const backdrop = document.getElementById('cart-drawer-backdrop');
      if (backdrop) backdrop.remove();

      // Reset giỏ hàng
      this.cart = [];
      this.selectedCustomer = null;
      this.discountValue = 0;
      this.shippingFee = 0;
      this.notes = '';
      this.paidAmount = 0;
      this.paymentMethod = 'cash';

      alert(`🎉 Đã tạo đơn hàng ${orderId} thành công!\nTồn kho đã được tự động trừ.`);
      this.showOrderDetailModal(orderId);
      this.render();
    } catch (err) {
      alert('Lỗi tạo đơn hàng: ' + err.message);
    }
  }

  // ================= HỦY ĐƠN HÀNG VÀ HOÀN TỒN KHO =================
  async handleCancelOrder(orderId) {
    const order = await db.getById('orders', orderId);
    if (!order) return;
    if (order.status === 'cancelled') {
      alert('Đơn hàng này đã được hủy trước đó.');
      return;
    }

    const reason = prompt(`Nhập lý do hủy đơn "${orderId}":`, 'Khách đổi ý trả hàng');
    if (reason === null) return;

    const now = new Date().toISOString();

    try {
      await db.runTransaction(
        ['orders', 'products', 'inventory_logs'],
        'readwrite',
        (tx) => {
          const orderStore = tx.objectStore('orders');
          const productStore = tx.objectStore('products');
          const invLogStore = tx.objectStore('inventory_logs');

          order.status = 'cancelled';
          order.cancelledAt = now;
          order.cancelReason = reason || 'Hủy đơn';
          order.debtAmount = 0;
          orderStore.put(order);

          for (const item of (order.items || [])) {
            const prodReq = productStore.get(item.productId);
            prodReq.onsuccess = () => {
              const product = prodReq.result;
              if (product) {
                const stockBefore = product.stock || 0;
                const stockAfter = stockBefore + item.quantity;
                product.stock = stockAfter;
                product.updatedAt = now;
                productStore.put(product);

                invLogStore.put({
                  id: 'LOG-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
                  productId: product.id,
                  productCode: product.code || '',
                  productName: product.name,
                  changeType: 'cancel_order',
                  quantityChange: +item.quantity,
                  stockBefore,
                  stockAfter,
                  referenceId: orderId,
                  reason: `Hoàn kho do hủy đơn ${orderId}: ${reason}`,
                  createdAt: now
                });
              }
            };
          }
        }
      );

      alert(`Đã hủy đơn ${orderId} thành công và hoàn trả số lượng vào kho!`);
      this.render();
    } catch (err) {
      alert('Lỗi hủy đơn hàng: ' + err.message);
    }
  }

  // Modal chọn khách hàng
  async showCustomerSelectModal() {
    const customers = await db.getAll('customers');
    const modalHtml = `
      <div class="modal-backdrop" id="cust-select-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">👤 Chọn Khách Hàng</h2>
            <button class="modal-close" id="btn-close-csmodal">&times;</button>
          </div>
          <div class="modal-body">
            <input type="text" id="cust-select-search" class="form-input mb-3" placeholder="🔍 Gõ tên hoặc SĐT khách...">
            <div class="customer-picker-list" id="cust-picker-container" style="display:flex; flex-direction:column; gap:6px;">
              <div class="picker-item-walkin card p-2 bg-light" id="pick-walkin" style="cursor:pointer;">
                <b class="text-primary">Khách lẻ (vãng lai)</b>
                <div class="text-muted text-xs">Không lưu công nợ</div>
              </div>
              ${customers.map(c => `
                <div class="picker-item-cust card p-2" data-id="${c.id}" style="cursor:pointer;">
                  <div class="text-bold">${escapeHTML(c.name)}</div>
                  <div class="text-muted text-xs">${c.phone ? `📞 ${escapeHTML(c.phone)}` : ''} ${c.address ? `• 📍 ${escapeHTML(c.address)}` : ''}</div>
                </div>
              `).join('')}
            </div>
            <div class="text-center mt-3">
              <button class="btn btn-outline-primary btn-sm" id="btn-inline-add-cust">+ Thêm Khách Hàng Mới</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const old = document.getElementById('cust-select-modal');
    if (old) old.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('cust-select-modal');
    const close = () => modal.remove();
    document.getElementById('btn-close-csmodal').addEventListener('click', close);

    document.getElementById('pick-walkin').addEventListener('click', () => {
      this.selectedCustomer = null;
      close();
      this.render();
    });

    document.querySelectorAll('.picker-item-cust').forEach(el => {
      el.addEventListener('click', async () => {
        const c = await db.getById('customers', el.dataset.id);
        this.selectedCustomer = c;
        close();
        this.render();
      });
    });

    const searchInp = document.getElementById('cust-select-search');
    searchInp.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      document.querySelectorAll('.picker-item-cust').forEach(el => {
        const match = el.textContent.toLowerCase().includes(q);
        el.style.display = match ? 'block' : 'none';
      });
    });

    document.getElementById('btn-inline-add-cust').addEventListener('click', () => {
      close();
      if (this.app.customersModule) {
        this.app.customersModule.showCustomerModal();
      }
    });
  }

  // Modal hóa đơn chuẩn mẫu Việt Nam (Mẫu số 02GTTT3/001)
  async showOrderDetailModal(orderId) {
    const order = await db.getById('orders', orderId);
    if (!order) return;

    let customer = null;
    if (order.customerId) {
      customer = await db.getById('customers', order.customerId);
    }

    const shopSettings = (await db.getSetting('shop_info')) || {};
    const qrAmount = order.debtAmount > 0 ? order.debtAmount : order.totalAmount;
    const qrDesc = normalizeTransferContent(order.id);
    const qrInfo = resolveOrderQR(shopSettings, qrAmount, order.id);
    const sellerBankLine = (qrInfo && qrInfo.type === 'vietqr')
      ? `${qrInfo.bankLabel} - STK: ${qrInfo.account}${qrInfo.accountName ? ` (${qrInfo.accountName})` : ''}`
      : (shopSettings.bankInfo || '');

    const ptttText = order.paymentMethod === 'cash' ? 'Tiền mặt' :
                     order.paymentMethod === 'qr' ? 'Quét mã QR' :
                     order.paymentMethod === 'transfer' ? 'Chuyển khoản' :
                     order.paymentMethod === 'debt' ? 'Ghi nợ' : 'Trả một phần';

    const orderDate = new Date(order.createdAt || Date.now());
    const dayStr = String(orderDate.getDate()).padStart(2, '0');
    const monthStr = String(orderDate.getMonth() + 1).padStart(2, '0');
    const yearStr = orderDate.getFullYear();
    const dateVietnamese = `Ngày ${dayStr} tháng ${monthStr} năm ${yearStr}`;

    const modalHtml = `
      <div class="modal-backdrop" id="order-detail-modal">
        <div class="modal-content modal-lg">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">📑 Phiếu Thu</h2>
              <div class="modal-subtitle">Mã đơn: ${escapeHTML(order.id)}</div>
            </div>
            <button class="modal-close" id="btn-close-odmodal">&times;</button>
          </div>

          <!-- KHU VỰC CUỘN XEM PHIẾU THU TRANG GIẤY -->
          <div class="modal-body invoice-paper-scroll">
            <div class="standard-invoice-paper" id="printable-invoice">
              <div class="invoice-box-border">
                
                <!-- HÀNG HEADER: BÊN BÁN & MẪU SỐ -->
                <div class="invoice-top-row">
                  <div class="invoice-seller-snippet">
                    <div class="seller-title"><b>ĐƠN VỊ BÁN:</b> ${escapeHTML((shopSettings.shopName || 'CỬA HÀNG BÁN DIỀU').toUpperCase())}</div>
                    <div class="text-xs">Địa chỉ: ${escapeHTML(shopSettings.address || '---')}</div>
                    <div class="text-xs">Điện thoại: ${escapeHTML(shopSettings.phone || '---')}</div>
                    ${sellerBankLine ? `<div class="text-xs">Số tài khoản: <b>${escapeHTML(sellerBankLine)}</b></div>` : ''}
                  </div>
                  <div class="invoice-meta-snippet text-right">
                    <div class="text-xs"><b>Mẫu số:</b> 02GTTT3/001</div>
                    <div class="text-xs"><b>Ký hiệu:</b> 03AA/26P</div>
                    <div class="text-xs"><b>Số:</b> <span class="text-danger text-bold">${escapeHTML(order.id)}</span></div>
                  </div>
                </div>

                <!-- TIÊU ĐỀ PHIẾU THU CHÍNH GIỮA -->
                <div class="invoice-title-block text-center mt-2 mb-2">
                  <h1 class="invoice-main-heading">PHIẾU THU</h1>
                  <div class="invoice-sub-heading text-xs"><i>Liên 2: Giao cho người mua</i></div>
                  <div class="invoice-date-text text-xs mt-1">${dateVietnamese}</div>
                </div>

                <!-- KHUNG THÔNG TIN NGƯỜI MUA -->
                <div class="invoice-buyer-section text-xs">
                  <div class="buyer-row">
                    <span class="buyer-lbl">Tên người mua hàng:</span>
                    <span class="buyer-val text-bold">${escapeHTML(order.customerName || 'Khách lẻ')}</span>
                  </div>
                  ${(order.customerAddress || (customer && customer.address)) ? `
                    <div class="buyer-row">
                      <span class="buyer-lbl">Địa chỉ:</span>
                      <span class="buyer-val">${escapeHTML(order.customerAddress || customer.address)}</span>
                    </div>
                  ` : ''}
                  <div class="buyer-row">
                    <span class="buyer-lbl">Số điện thoại:</span>
                    <span class="buyer-val">${escapeHTML(order.customerPhone || (customer && customer.phone) || '---')}</span>
                    <span class="buyer-lbl ml-3">Hình thức thanh toán:</span>
                    <span class="buyer-val text-bold">${ptttText}</span>
                  </div>
                </div>

                <!-- BẢNG HÀNG HÓA KẺ Ô LƯỚI VUÔNG CHUẨN MẪU HÓA ĐƠN (Image 3) -->
                <table class="standard-invoice-table mt-2">
                  <thead>
                    <tr>
                      <th style="width: 36px;" class="text-center">STT<br><span class="col-sub">(1)</span></th>
                      <th>Tên hàng hóa, dịch vụ<br><span class="col-sub">(2)</span></th>
                      <th style="width: 50px;" class="text-center">ĐVT<br><span class="col-sub">(3)</span></th>
                      <th style="width: 44px;" class="text-center">SL<br><span class="col-sub">(4)</span></th>
                      <th style="width: 80px;" class="text-right">Đơn giá<br><span class="col-sub">(5)</span></th>
                      <th style="width: 90px;" class="text-right">Thành tiền<br><span class="col-sub">(6=4x5)</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${(order.items || []).map((item, idx) => `
                      <tr>
                        <td class="text-center">${idx + 1}</td>
                        <td><b>${escapeHTML(item.productName)}</b></td>
                        <td class="text-center">${escapeHTML(item.unit || 'Chiếc')}</td>
                        <td class="text-center text-bold">${item.quantity}</td>
                        <td class="text-right">${formatVND(item.unitPrice)}</td>
                        <td class="text-right text-bold">${formatVND(item.subtotal)}</td>
                      </tr>
                    `).join('')}

                    <!-- DÒNG CỘNG TIỀN HÀNG HÓA -->
                    <tr class="table-summary-row">
                      <td colspan="5" class="text-right">Cộng tiền bán hàng hóa, dịch vụ:</td>
                      <td class="text-right text-bold">${formatVND(order.subtotal)}</td>
                    </tr>
                    ${order.discountAmount > 0 ? `
                      <tr class="table-summary-row">
                        <td colspan="5" class="text-right">Chiết khấu giảm giá:</td>
                        <td class="text-right text-danger">-${formatVND(order.discountAmount)}</td>
                      </tr>
                    ` : ''}
                    ${order.shippingFee > 0 ? `
                      <tr class="table-summary-row">
                        <td colspan="5" class="text-right">Phí vận chuyển / giao hàng:</td>
                        <td class="text-right">+${formatVND(order.shippingFee)}</td>
                      </tr>
                    ` : ''}
                    ${order.vatAmount > 0 ? `
                      <tr class="table-summary-row">
                        <td colspan="5" class="text-right">Thuế giá trị gia tăng (VAT):</td>
                        <td class="text-right">+${formatVND(order.vatAmount)}</td>
                      </tr>
                    ` : ''}
                    <tr class="table-grand-row">
                      <td colspan="5" class="text-right text-bold text-uppercase">TỔNG CỘNG TIỀN THANH TOÁN:</td>
                      <td class="text-right text-bold text-primary" style="font-size: 13.5px;">${formatVND(order.totalAmount)}</td>
                    </tr>
                  </tbody>
                </table>

                <!-- SỐ TIỀN VIẾT BẰNG CHỮ -->
                <div class="invoice-words-box mt-2 text-xs">
                  <b>Số tiền viết bằng chữ:</b> <i>${numberToVietnameseWords(order.totalAmount)}</i>
                </div>

                <!-- MÃ QR THANH TOÁN (VIETQR OFFLINE HOẶC QR TĨNH) -->
                ${qrInfo ? `
                  <div class="invoice-qr-box mt-2">
                    <div class="invoice-qr-content">
                      <img src="${qrInfo.dataUrl}" class="invoice-qr-img" alt="QR Code">
                      <div class="invoice-qr-text">
                        <div class="text-xs text-bold text-primary">
                          ${qrInfo.type === 'vietqr' ? '📱 QUÉT MÃ VIETQR THANH TOÁN CHUYỂN KHOẢN' : '📱 QUÉT MÃ QR THANH TOÁN CHUYỂN KHOẢN'}
                        </div>
                        <div class="text-xs mt-1">Số tiền: <b class="text-success">${formatVND(qrAmount)}</b></div>
                        ${qrInfo.type === 'vietqr' ? `
                          <div class="text-xs text-muted mt-1">
                            ${escapeHTML(qrInfo.bankLabel)} • STK: <b>${escapeHTML(qrInfo.account)}</b>${qrInfo.accountName ? ` (${escapeHTML(qrInfo.accountName)})` : ''}
                          </div>
                          <div class="text-xs text-muted">Nội dung CK: <code>${escapeHTML(qrInfo.normalizedDesc || qrDesc)}</code></div>
                        ` : (shopSettings.bankInfo ? `<div class="text-xs text-muted mt-1">${escapeHTML(shopSettings.bankInfo)}</div>` : '')}
                        <div class="text-xs text-muted">Dùng app ngân hàng hoặc ví điện tử quét mã để thanh toán</div>
                      </div>
                    </div>
                  </div>
                ` : (shopSettings.bankInfo ? `
                  <div class="card p-2 bg-light text-xs mt-2">
                    <b>Thông tin chuyển khoản ngân hàng:</b> ${escapeHTML(shopSettings.bankInfo)}
                  </div>
                ` : '')}

                <!-- KHỐI CHỮ KÝ 2 BÊN CHUẨN MẪU (Image 3) -->
                <div class="invoice-signatures-row mt-3 text-center">
                  <div class="sig-col">
                    <div class="sig-title text-bold">NGƯỜI MUA HÀNG</div>
                    <div class="sig-sub text-xs"><i>(Ký, ghi rõ họ, tên)</i></div>
                    <div class="sig-space"></div>
                    <div class="sig-name text-xs text-bold">${escapeHTML(order.customerName || '')}</div>
                  </div>
                  <div class="sig-col">
                    <div class="sig-title text-bold">NGƯỜI BÁN HÀNG</div>
                    <div class="sig-sub text-xs"><i>(Ký, đóng dấu, ghi rõ họ, tên)</i></div>
                    <div class="sig-space"></div>
                    <div class="sig-name text-xs text-bold">${escapeHTML(shopSettings.shopName || '')}</div>
                  </div>
                </div>

                <div class="invoice-footnote text-center text-xs text-muted mt-3">
                  <i>(Cần kiểm tra, đối chiếu khi lập, giao, nhận phiếu thu)</i>
                </div>
              </div>
            </div>
          </div>

          <!-- FOOTER MODAL VỚI NÚT TẢI PDF, CHIA SẺ ZALO & IN -->
          <div class="modal-footer" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px;">
            <button class="btn btn-primary btn-sm" id="btn-download-order-pdf">
              ⬇️ Tải File PDF
            </button>
            <button class="btn btn-success btn-sm" id="btn-export-order-pdf">
              📤 Gửi PDF Zalo
            </button>
            <button class="btn btn-outline-primary btn-sm" id="btn-print-receipt">
              🖨️ In Phiếu Thu
            </button>
            <button class="btn btn-secondary btn-sm" id="btn-close-odmodal2" style="margin-left: auto;">Đóng</button>
          </div>
        </div>
      </div>
    `;

    const old = document.getElementById('order-detail-modal');
    if (old) old.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('order-detail-modal');
    const close = () => modal.remove();
    document.getElementById('btn-close-odmodal').addEventListener('click', close);
    document.getElementById('btn-close-odmodal2').addEventListener('click', close);

    // Tải file PDF trực tiếp (đồng bộ trong click handler để Safari/Android không chặn)
    document.getElementById('btn-download-order-pdf').addEventListener('click', () => {
      try {
        const { pdfBlob, filename } = this._buildOrderPdf(order, shopSettings, customer);
        downloadBlobFile(pdfBlob, filename);
      } catch (err) {
        console.error('Lỗi tải PDF hóa đơn:', err);
        alert('Lỗi tạo file PDF: ' + err.message);
      }
    });

    // Chia sẻ file PDF qua Zalo / Web Share (giữ nguyên user gesture đồng bộ, fallback tải xuống)
    document.getElementById('btn-export-order-pdf').addEventListener('click', async () => {
      try {
        const { pdfBlob, filename } = this._buildOrderPdf(order, shopSettings, customer);
        const file = new File([pdfBlob], filename, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: `Phiếu thu ${order.id}`,
              text: `Phiếu thu đơn hàng ${order.id} - ${order.customerName || 'Khách lẻ'}`
            });
            return;
          } catch (shareErr) {
            if (shareErr.name === 'AbortError') return;
            console.warn('Web Share PDF thất bại, chuyển sang tải xuống:', shareErr);
          }
        }
        downloadBlobFile(pdfBlob, filename);
        alert(`Đã tải file "${filename}" về máy — bạn mở Zalo chọn đính kèm file PDF vừa tải để gửi cho khách nhé!`);
      } catch (err) {
        console.error('Lỗi xuất PDF hóa đơn:', err);
        alert('Lỗi tạo file PDF: ' + err.message);
      }
    });

    // In trực tiếp
    document.getElementById('btn-print-receipt').addEventListener('click', () => {
      window.print();
    });
  }

  _buildOrderPdf(order, shop = {}, customer = null) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('Thư viện jsPDF chưa sẵn sàng. Vui lòng tải lại trang.');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: 'a4'
    });

    // Nhúng font Roboto hỗ trợ 100% tiếng Việt có dấu
    registerVietnameseFont(doc);

    const darkColor = [17, 24, 39];
    const grayColor = [100, 116, 139];
    const BOTTOM_LIMIT = 276; // Chừa lề dưới an toàn bên trong khung (12..285)

    const qrAmount = order.debtAmount > 0 ? order.debtAmount : order.totalAmount;
    const qrDesc = normalizeTransferContent(order.id);
    const qrInfo = resolveOrderQR(shop, qrAmount, order.id);
    const sellerBankLine = (qrInfo && qrInfo.type === 'vietqr')
      ? `${qrInfo.bankLabel} - STK: ${qrInfo.account}${qrInfo.accountName ? ` (${qrInfo.accountName})` : ''}`
      : (shop.bankInfo || '');

    let curY = 18;

    // 1. Header: Đơn vị bán bên trái (giới hạn maxWidth 112mm tránh đè cột Mẫu số bên phải)
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...darkColor);
    const shopTitleLines = doc.splitTextToSize(
      `TÊN ĐƠN VỊ BÁN: ${(shop.shopName || 'CỬA HÀNG BÁN DIỀU').toUpperCase()}`,
      112
    );
    doc.text(shopTitleLines, 16, curY);
    let leftY = curY + shopTitleLines.length * 4.5;

    doc.setFont('Roboto', 'normal');
    doc.setFontSize(8.5);
    const addrLines = doc.splitTextToSize(`Địa chỉ: ${shop.address || '---'}`, 112);
    doc.text(addrLines, 16, leftY);
    leftY += addrLines.length * 4.2;

    const phoneLines = doc.splitTextToSize(`Điện thoại: ${shop.phone || '---'}`, 112);
    doc.text(phoneLines, 16, leftY);
    leftY += phoneLines.length * 4.2;

    if (sellerBankLine) {
      const bankLines = doc.splitTextToSize(`Số tài khoản: ${sellerBankLine}`, 112);
      doc.text(bankLines, 16, leftY);
      leftY += bankLines.length * 4.2;
    }

    // Thông tin Mẫu số & Ký hiệu bên phải
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(8.5);
    doc.text('Mẫu số: 02GTTT3/001', 194, curY, { align: 'right' });
    doc.text('Ký hiệu: 03AA/26P', 194, curY + 5, { align: 'right' });
    doc.setFont('Roboto', 'bold');
    doc.setTextColor(220, 38, 38);
    doc.text(`Số: ${order.id}`, 194, curY + 10, { align: 'right' });
    doc.setTextColor(...darkColor);
    const rightY = curY + 15;

    curY = Math.max(leftY, rightY) + 2;

    // Đường kẻ ngang phân cách header
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(14, curY, 196, curY);

    curY += 6;

    // 2. Tiêu đề PHIẾU THU chính giữa
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(15);
    doc.text('PHIẾU THU', 105, curY, { align: 'center' });

    doc.setFont('Roboto', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...grayColor);
    doc.text('Liên 2: Giao cho người mua', 105, curY + 5, { align: 'center' });

    const orderDate = new Date(order.createdAt || Date.now());
    const dateText = `Ngày ${String(orderDate.getDate()).padStart(2, '0')} tháng ${String(orderDate.getMonth() + 1).padStart(2, '0')} năm ${orderDate.getFullYear()}`;
    doc.text(dateText, 105, curY + 10, { align: 'center' });

    curY += 15;

    // 3. Khung thông tin Người mua hàng (tự xuống dòng theo maxWidth)
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...darkColor);
    doc.text('Tên người mua hàng:', 16, curY);
    doc.setFont('Roboto', 'bold');
    const custNameLines = doc.splitTextToSize(`${order.customerName || 'Khách lẻ'}`, 140);
    doc.text(custNameLines, 52, curY);
    curY += custNameLines.length * 4.5;

    doc.setFont('Roboto', 'normal');
    const custAddr = order.customerAddress || (customer && customer.address);
    if (custAddr) {
      doc.text('Địa chỉ:', 16, curY);
      const custAddrLines = doc.splitTextToSize(`${custAddr}`, 140);
      doc.text(custAddrLines, 52, curY);
      curY += custAddrLines.length * 4.5;
    }

    doc.text('Số điện thoại:', 16, curY);
    doc.text(`${order.customerPhone || (customer && customer.phone) || '---'}`, 52, curY);

    const pttt = order.paymentMethod === 'cash' ? 'Tiền mặt' :
                 order.paymentMethod === 'qr' ? 'Quét mã QR' :
                 order.paymentMethod === 'transfer' ? 'Chuyển khoản' :
                 order.paymentMethod === 'debt' ? 'Ghi nợ' : 'Trả một phần';
    doc.text('Hình thức thanh toán:', 110, curY);
    doc.setFont('Roboto', 'bold');
    doc.text(pttt, 146, curY);

    curY += 6;

    // 4. Bảng hàng hóa kẻ ô lưới chuẩn (AutoTable, an toàn đa trang)
    const tableRows = (order.items || []).map((item, index) => [
      index + 1,
      item.productName,
      item.unit || 'Chiếc',
      item.quantity,
      formatVND(item.unitPrice),
      formatVND(item.subtotal)
    ]);

    tableRows.push([
      { content: 'Cộng tiền bán hàng hóa, dịch vụ:', colSpan: 5, styles: { halign: 'right', fontStyle: 'normal' } },
      { content: formatVND(order.subtotal), styles: { halign: 'right', fontStyle: 'bold' } }
    ]);

    if (order.discountAmount > 0) {
      tableRows.push([
        { content: 'Chiết khấu giảm giá:', colSpan: 5, styles: { halign: 'right', fontStyle: 'normal', textColor: [220, 38, 38] } },
        { content: `-${formatVND(order.discountAmount)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: [220, 38, 38] } }
      ]);
    }
    if (order.shippingFee > 0) {
      tableRows.push([
        { content: 'Phí vận chuyển / giao hàng:', colSpan: 5, styles: { halign: 'right', fontStyle: 'normal' } },
        { content: `+${formatVND(order.shippingFee)}`, styles: { halign: 'right', fontStyle: 'bold' } }
      ]);
    }
    if (order.vatAmount > 0) {
      tableRows.push([
        { content: 'Thuế giá trị gia tăng (VAT):', colSpan: 5, styles: { halign: 'right', fontStyle: 'normal' } },
        { content: `+${formatVND(order.vatAmount)}`, styles: { halign: 'right', fontStyle: 'bold' } }
      ]);
    }

    tableRows.push([
      { content: 'TỔNG CỘNG TIỀN THANH TOÁN:', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } },
      { content: formatVND(order.totalAmount), styles: { halign: 'right', fontStyle: 'bold', textColor: [2, 132, 199] } }
    ]);

    doc.autoTable({
      startY: curY,
      margin: { top: 16, bottom: 18, left: 16, right: 16 },
      head: [['STT\n(1)', 'Tên hàng hóa, dịch vụ\n(2)', 'ĐVT\n(3)', 'SL\n(4)', 'Đơn giá\n(5)', 'Thành tiền\n(6=4x5)']],
      body: tableRows,
      styles: {
        font: 'Roboto',
        fontSize: 8.5,
        cellPadding: 2.5,
        lineColor: [40, 40, 40],
        lineWidth: 0.2
      },
      headStyles: {
        font: 'Roboto',
        fontStyle: 'bold',
        fillColor: [243, 244, 246],
        textColor: [0, 0, 0],
        halign: 'center',
        lineColor: [40, 40, 40],
        lineWidth: 0.2
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        1: { cellWidth: 74 },
        2: { halign: 'center', cellWidth: 18 },
        3: { halign: 'center', cellWidth: 16 },
        4: { halign: 'right', cellWidth: 26 },
        5: { halign: 'right', cellWidth: 32 }
      },
      theme: 'grid'
    });

    let finalY = (doc.lastAutoTable ? doc.lastAutoTable.finalY : curY) + 6;
    const ensureSpace = (neededMm) => {
      if (finalY + neededMm > BOTTOM_LIMIT) {
        doc.addPage();
        finalY = 20;
      }
    };

    // 5. Số tiền viết bằng chữ (có wrap và kiểm tra tràn trang)
    doc.setFont('Roboto', 'italic');
    doc.setFontSize(8.5);
    const wordsLines = doc.splitTextToSize(numberToVietnameseWords(order.totalAmount), 140);
    ensureSpace(wordsLines.length * 4.5 + 4);

    doc.setFont('Roboto', 'bold');
    doc.setTextColor(...darkColor);
    doc.text('Số tiền viết bằng chữ:', 16, finalY);
    doc.setFont('Roboto', 'italic');
    doc.text(wordsLines, 52, finalY);
    finalY += wordsLines.length * 4.5 + 3;

    // 6. Mã QR Thanh Toán (ưu tiên VietQR vector sắc nét, fallback ảnh tĩnh an toàn PNG/JPEG)
    if (qrInfo) {
      doc.setFont('Roboto', 'normal');
      doc.setFontSize(8);
      const detailLines = [];
      detailLines.push({ text: `Số tiền: ${formatVND(qrAmount)}`, bold: false });
      if (qrInfo.type === 'vietqr') {
        const bankAccStr = `${qrInfo.bankLabel} • STK: ${qrInfo.account}${qrInfo.accountName ? ` (${qrInfo.accountName})` : ''}`;
        doc.splitTextToSize(bankAccStr, 144).forEach(l => detailLines.push({ text: l, bold: false }));
        detailLines.push({ text: `Nội dung CK: ${qrInfo.normalizedDesc || qrDesc}`, bold: true });
      } else if (shop.bankInfo) {
        doc.splitTextToSize(`Tài khoản: ${shop.bankInfo}`, 144).forEach(l => detailLines.push({ text: l, bold: false }));
      }

      const qrBoxH = Math.max(29, 11 + detailLines.length * 4.2 + 2);
      ensureSpace(qrBoxH + 4);

      doc.setFillColor(240, 253, 244);
      doc.setDrawColor(187, 247, 208);
      doc.roundedRect(16, finalY, 178, qrBoxH, 2, 2, 'FD');

      let qrDrawn = false;
      if (qrInfo.type === 'vietqr' && qrInfo.qrText) {
        try {
          drawVietQRToJsPdf(doc, qrInfo.qrText, 18.5, finalY + 2.5, 24);
          qrDrawn = true;
        } catch (qrErr) {
          console.warn('Lỗi vẽ VietQR lên PDF:', qrErr);
        }
      }
      if (!qrDrawn && qrInfo.dataUrl) {
        try {
          const imgFmt = this._detectPdfImageFormat(qrInfo.dataUrl);
          doc.addImage(qrInfo.dataUrl, imgFmt, 18.5, finalY + 2.5, 24, 24);
          qrDrawn = true;
        } catch (imgErr) {
          console.warn('Lỗi chèn ảnh QR vào PDF:', imgErr);
        }
      }

      const qrTextX = qrDrawn ? 46 : 20;
      doc.setFont('Roboto', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(22, 101, 52);
      doc.text(
        qrInfo.type === 'vietqr' ? 'QUÉT MÃ VIETQR THANH TOÁN / CHUYỂN KHOẢN' : 'QUÉT MÃ QR THANH TOÁN / CHUYỂN KHOẢN',
        qrTextX,
        finalY + 6.5
      );

      let lineY = finalY + 11.5;
      doc.setFontSize(8);
      doc.setTextColor(...darkColor);
      for (const item of detailLines) {
        doc.setFont('Roboto', item.bold ? 'bold' : 'normal');
        doc.text(item.text, qrTextX, lineY);
        lineY += 4.2;
      }

      finalY += qrBoxH + 4;
    } else if (shop.bankInfo) {
      doc.setFont('Roboto', 'normal');
      doc.setFontSize(8.5);
      const bankLines = doc.splitTextToSize(`Thông tin chuyển khoản: ${shop.bankInfo}`, 176);
      ensureSpace(bankLines.length * 4.5 + 3);
      doc.setTextColor(...darkColor);
      doc.text(bankLines, 16, finalY);
      finalY += bankLines.length * 4.5 + 3;
    }

    // 7. Khối chữ ký 2 bên + Footnote (luôn đi cùng nhau, tự sang trang nếu thiếu chỗ)
    ensureSpace(34);
    finalY += 3;
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...darkColor);
    doc.text('NGƯỜI MUA HÀNG', 55, finalY, { align: 'center' });
    doc.text('NGƯỜI BÁN HÀNG', 155, finalY, { align: 'center' });

    doc.setFont('Roboto', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(...grayColor);
    doc.text('(Ký, ghi rõ họ, tên)', 55, finalY + 4, { align: 'center' });
    doc.text('(Ký, đóng dấu, ghi rõ họ, tên)', 155, finalY + 4, { align: 'center' });

    doc.setFont('Roboto', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...darkColor);
    if (order.customerName && order.customerName !== 'Khách lẻ') {
      const sigCust = doc.splitTextToSize(order.customerName, 75);
      doc.text(sigCust[0] || '', 55, finalY + 21, { align: 'center' });
    }
    const sigShop = doc.splitTextToSize(shop.shopName || '', 75);
    doc.text(sigShop[0] || '', 155, finalY + 21, { align: 'center' });

    // Footnote luôn nằm an toàn trong khung trang cuối
    const footnoteY = Math.max(finalY + 27, 279);
    doc.setFont('Roboto', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(156, 163, 175);
    doc.text('(Cần kiểm tra, đối chiếu khi lập, giao, nhận phiếu thu)', 105, Math.min(footnoteY, 281), { align: 'center' });

    // 8. Vẽ khung viền chữ nhật trên TẤT CẢ các trang để không bao giờ bị cắt chữ khi sang trang 2+
    const pageCount = doc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setDrawColor(20, 20, 20);
      doc.setLineWidth(0.4);
      doc.rect(12, 12, 186, 273);
      if (pageCount > 1) {
        doc.setFont('Roboto', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(`Trang ${p}/${pageCount}`, 195, 283, { align: 'right' });
      }
    }

    const pdfBlob = doc.output('blob');
    const filename = `PhieuThu-${order.id}.pdf`;
    return { doc, pdfBlob, filename };
  }

  // Tạo và xuất File PDF Hóa Đơn Bán Hàng theo mẫu 02GTTT3/001 chuẩn quốc gia
  async generateOrderPDF(orderId) {
    const order = await db.getById('orders', orderId);
    if (!order) return;
    const shop = (await db.getSetting('shop_info')) || {};
    let customer = null;
    if (order.customerId) {
      customer = await db.getById('customers', order.customerId);
    }

    try {
      const { pdfBlob, filename } = this._buildOrderPdf(order, shop, customer);
      this._showOrderPdfExportModal(pdfBlob, filename, order);
    } catch (err) {
      console.error('Lỗi xuất PDF hóa đơn:', err);
      alert('Lỗi tạo file PDF: ' + err.message);
    }
  }

  _showOrderPdfExportModal(pdfBlob, filename, order) {
    const old = document.getElementById('order-pdf-export-modal');
    if (old) old.remove();

    const modalHtml = `
      <div class="modal-backdrop" id="order-pdf-export-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">📄 Xuất Phiếu Thu PDF</h2>
            <button class="modal-close" id="btn-close-opdfmodal">&times;</button>
          </div>
          <div class="modal-body">
            <div class="card p-3 mb-3 bg-light">
              <div class="text-bold">Phiếu thu: ${escapeHTML(order.id)}</div>
              <div class="text-xs text-muted mt-1">Tên file: <code>${escapeHTML(filename)}</code></div>
              <div class="text-xs text-muted mt-1">Khách hàng: <b>${escapeHTML(order.customerName || 'Khách lẻ')}</b> • Tổng: <b class="text-primary">${formatVND(order.totalAmount)}</b></div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 10px;">
              <button type="button" class="btn btn-primary btn-block btn-lg" id="btn-opdf-download">
                ⬇️ Tải File PDF Về Máy
              </button>
              <button type="button" class="btn btn-success btn-block btn-lg" id="btn-opdf-share">
                📤 Gửi File PDF Qua Zalo / Chia Sẻ
              </button>
            </div>
          </div>
          <div class="modal-footer" style="justify-content: flex-end;">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-opdfmodal">Đóng</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById('order-pdf-export-modal');
    const close = () => modal.remove();
    document.getElementById('btn-close-opdfmodal').addEventListener('click', close);
    document.getElementById('btn-cancel-opdfmodal').addEventListener('click', close);

    document.getElementById('btn-opdf-download').addEventListener('click', () => {
      downloadBlobFile(pdfBlob, filename);
      close();
    });

    document.getElementById('btn-opdf-share').addEventListener('click', async () => {
      const file = new File([pdfBlob], filename, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `Phiếu thu ${order.id}`,
            text: `Phiếu thu đơn hàng ${order.id} - ${order.customerName || 'Khách lẻ'}`
          });
          close();
          return;
        } catch (err) {
          if (err.name === 'AbortError') return;
        }
      }
      downloadBlobFile(pdfBlob, filename);
      alert(`Trình duyệt không hỗ trợ chia sẻ trực tiếp. Đã tải "${filename}" về máy để bạn gửi qua Zalo!`);
      close();
    });
  }

  // Modal phóng to mã QR toàn màn hình sáng rõ cho khách quét
  showFullScreenQrModal(qrSource, bankInfo = '', amount = 0, options = {}) {
    const isQrObj = qrSource && typeof qrSource === 'object' && qrSource.dataUrl;
    const imgSrc = isQrObj ? qrSource.dataUrl : qrSource;
    if (!imgSrc) {
      alert('Chưa có cấu hình VietQR hoặc ảnh mã QR! Vui lòng vào Cài Đặt để thiết lập.');
      return;
    }

    const bankDisplay = isQrObj && qrSource.type === 'vietqr'
      ? `${qrSource.bankLabel} • STK: ${qrSource.account}${qrSource.accountName ? ` (${qrSource.accountName})` : ''}`
      : bankInfo;
    const descDisplay = options.description || (isQrObj ? qrSource.normalizedDesc : '');
    const hasConfirm = typeof options.onConfirmPaid === 'function';

    const modalHtml = `
      <div class="modal-backdrop fullscreen-qr-backdrop" id="fullscreen-qr-modal">
        <div class="fullscreen-qr-container">
          <div class="fullscreen-qr-header">
            <h3 class="fullscreen-qr-title">${isQrObj && qrSource.type === 'vietqr' ? '📱 QUÉT MÃ VIETQR THANH TOÁN' : '📱 QUÉT MÃ QR THANH TOÁN'}</h3>
            <button class="fullscreen-qr-close" id="btn-close-fsqr">&times;</button>
          </div>
          <div class="fullscreen-qr-body">
            <div class="fullscreen-qr-card">
              <img src="${imgSrc}" class="fullscreen-qr-img" alt="Mã QR thanh toán">
              ${amount > 0 ? `
                <div class="fullscreen-qr-amount">
                  <span class="text-xs text-muted">Số tiền cần thanh toán:</span>
                  <div class="amount-val">${formatVND(amount)}</div>
                </div>
              ` : ''}
              ${bankDisplay ? `
                <div class="fullscreen-qr-bank-info">
                  ${escapeHTML(bankDisplay)}
                </div>
              ` : ''}
              ${descDisplay ? `
                <div class="text-xs text-muted mt-2">
                  Nội dung CK: <code>${escapeHTML(descDisplay)}</code>
                </div>
              ` : ''}
              <div class="fullscreen-qr-hint">
                Dùng camera điện thoại hoặc app ngân hàng / MoMo / ZaloPay để quét
              </div>
              <div class="text-xs mt-2 text-left" style="padding: 8px 10px; border-radius: 8px; background: #fffbeb; border: 1px solid #fcd34d; color: #92400e; line-height: 1.4;">
                ⚠️ Lưu ý: App chạy offline nên KHÔNG tự biết khách đã chuyển tiền hay chưa. Chủ shop kiểm tra app ngân hàng rồi tự bấm xác nhận.
              </div>
            </div>
          </div>
          <div class="fullscreen-qr-footer" style="display: flex; flex-direction: column; gap: 8px;">
            ${hasConfirm ? `
              <button class="btn btn-success btn-block btn-lg" id="btn-fsqr-confirm-paid">✅ Đã nhận tiền (Hoàn tất đơn)</button>
            ` : ''}
            <button class="btn btn-secondary btn-block btn-lg" id="btn-close-fsqr2">✕ Đóng Lại</button>
          </div>
        </div>
      </div>
    `;

    const old = document.getElementById('fullscreen-qr-modal');
    if (old) old.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('fullscreen-qr-modal');
    const close = () => modal.remove();
    document.getElementById('btn-close-fsqr')?.addEventListener('click', close);
    document.getElementById('btn-close-fsqr2')?.addEventListener('click', close);

    const confirmBtn = document.getElementById('btn-fsqr-confirm-paid');
    if (confirmBtn && hasConfirm) {
      confirmBtn.addEventListener('click', () => {
        close();
        options.onConfirmPaid();
      });
    }
  }
}
