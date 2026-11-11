// Quản lý Bán Hàng (POS, Tạo đơn, Trừ kho Transaction, Hủy đơn hoàn kho - Mobile Optimized)
import { db } from '../db.js';
import { formatVND, parseVND, formatDateTime, generateId, escapeHTML } from '../utils.js';
import { PRODUCT_CATEGORIES } from '../config.js';

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
    this.posCategory = 'all';
    this.orderFilterStatus = 'all';
    this.orderSearchQuery = '';
    this.isDrawerOpen = false;
  }

  async render() {
    const container = document.getElementById('view-container');

    container.innerHTML = `
      <div class="view-header">
        <div class="header-title-row">
          <div>
            <h1 class="view-title">⚡ Bán Hàng (Thu Ngân)</h1>
            <p class="view-subtitle">Chạm vào diều để thêm vào đơn bán nhanh</p>
          </div>
          <div class="header-tab-switch">
            <button class="tab-switch-btn ${this.activeTab === 'pos' ? 'active' : ''}" id="tab-btn-pos">🛍️ Bán Hàng</button>
            <button class="tab-switch-btn ${this.activeTab === 'orders' ? 'active' : ''}" id="tab-btn-orders">📋 Đơn Hàng</button>
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
    const customers = await db.getAll('customers');
    const shopSettings = (await db.getSetting('shop_info')) || {};

    const filteredProducts = products.filter(p => {
      const matchCat = this.posCategory === 'all' || p.category === this.posCategory;
      const q = this.searchProductQuery.toLowerCase().trim();
      const matchQuery = !q || p.name.toLowerCase().includes(q) || (p.code && p.code.toLowerCase().includes(q));
      return matchCat && matchQuery;
    });

    const totals = this.calculateTotals(shopSettings);
    const totalCartItems = this.cart.reduce((s, i) => s + i.quantity, 0);

    return `
      <div class="pos-layout">
        <!-- Khung danh mục diều -->
        <div class="pos-catalog-panel">
          <div class="search-filter-bar">
            <div class="search-input-wrap">
              <input type="text" id="pos-product-search" class="form-input" placeholder="🔍 Tìm tên, mã diều..." value="${escapeHTML(this.searchProductQuery)}">
              ${this.searchProductQuery ? `<button id="btn-clear-pos-search" class="clear-search-btn">&times;</button>` : ''}
            </div>
            <div class="category-tabs-scroll">
              <button class="cat-pill ${this.posCategory === 'all' ? 'active' : ''}" data-cat="all">Tất cả diều</button>
              ${PRODUCT_CATEGORIES.map(c => `
                <button class="cat-pill ${this.posCategory === c ? 'active' : ''}" data-cat="${escapeHTML(c)}">${escapeHTML(c)}</button>
              `).join('')}
            </div>
          </div>

          <div class="pos-product-grid">
            ${filteredProducts.length === 0 ? `
              <div class="empty-state" style="grid-column: 1 / -1;">
                <p class="empty-icon">🪁</p>
                <p class="empty-title">Không tìm thấy diều nào</p>
                <p class="empty-desc">Thử tìm tên khác hoặc vào mục Kho Diều để thêm mới.</p>
              </div>
            ` : filteredProducts.map(p => {
              const inCartItem = this.cart.find(i => i.productId === p.id);
              const qtyInCart = inCartItem ? inCartItem.quantity : 0;
              const isOutOfStock = p.stock <= 0;
              const isLowStock = p.stock <= (p.lowStockThreshold || 5);

              return `
                <div class="pos-item-card ${isOutOfStock ? 'out-of-stock' : ''}" data-id="${p.id}">
                  ${p.photo ? `
                    <img src="${p.photo}" class="pos-item-img" alt="${escapeHTML(p.name)}" loading="lazy">
                  ` : `
                    <div class="pos-item-img-placeholder">🪁</div>
                  `}
                  <div class="pos-item-body">
                    <div class="pos-item-name">${escapeHTML(p.name)}</div>
                    <div class="pos-item-meta">
                      <span class="pos-stock-tag ${isOutOfStock ? 'text-danger text-bold' : isLowStock ? 'text-danger' : 'text-muted'}">
                        ${isOutOfStock ? 'Hết hàng' : `Tồn: ${p.stock}`}
                      </span>
                      <span class="pos-item-price">${formatVND(p.sellingPrice)}</span>
                    </div>
                  </div>
                  ${qtyInCart > 0 ? `
                    <div class="pos-item-badge">+${qtyInCart}</div>
                  ` : ''}
                </div>
              `;
            }).join('')}
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
          
          <div class="d-flex justify-between align-center mb-2" style="display: flex; justify-content: space-between; align-items: center;">
            <h3 class="text-bold" style="font-size: 16px;">🛒 Giỏ Hàng (${totalCartItems} món)</h3>
            <button class="btn-icon btn-close-drawer" id="btn-close-drawer" style="border:none; font-size: 20px; color: #64748b; background: none; cursor: pointer;">&times;</button>
          </div>

          <!-- Chọn khách hàng -->
          <div class="cart-customer-box">
            <div class="cart-customer-header">
              <span class="cart-box-title">👤 Khách hàng:</span>
              <button id="btn-change-customer" class="btn btn-outline-primary btn-xs">
                ${this.selectedCustomer ? 'Đổi' : '+ Chọn khách'}
              </button>
            </div>
            <div class="cart-customer-info">
              ${this.selectedCustomer ? `
                <div class="selected-customer-pill">
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
                <span class="cart-empty-hint text-xs">Chạm vào sản phẩm để thêm vào đơn</span>
              </div>
            ` : this.cart.map((item, idx) => `
              <div class="cart-item-row" data-idx="${idx}">
                <div class="cart-item-info">
                  <div class="cart-item-title">${escapeHTML(item.productName)}</div>
                  <div class="cart-item-price-edit">
                    <input type="text" class="input-line-price form-input-xs" data-idx="${idx}" value="${formatVND(item.unitPrice)}" title="Chỉnh giá bán dòng này">
                    <span class="text-muted text-xs">/${escapeHTML(item.unit || 'cái')}</span>
                  </div>
                </div>

                <div class="cart-item-qty-wrap">
                  <button class="btn-qty-adj btn-qty-dec" data-idx="${idx}">-</button>
                  <input type="number" class="input-item-qty" data-idx="${idx}" min="1" value="${item.quantity}">
                  <button class="btn-qty-adj btn-qty-inc" data-idx="${idx}">+</button>
                </div>

                <div class="cart-item-subtotal">
                  <span class="text-bold">${formatVND(item.subtotal)}</span>
                  <button class="btn-remove-cart-item" data-idx="${idx}" title="Xóa món này">&times;</button>
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
              <div class="summary-line">
                <div class="discount-label-row">
                  <span>Chiết khấu:</span>
                  <div class="discount-toggle-group">
                    <button class="btn-toggle-disc ${this.discountType === 'amount' ? 'active' : ''}" id="disc-type-amt">₫</button>
                    <button class="btn-toggle-disc ${this.discountType === 'percent' ? 'active' : ''}" id="disc-type-pct">%</button>
                  </div>
                </div>
                <input type="number" id="input-discount-val" class="form-input-sm text-right" style="width: 100px" value="${this.discountValue || ''}" placeholder="0">
              </div>

              <div class="summary-line">
                <span>Phí ship:</span>
                <input type="number" id="input-shipping-fee" class="form-input-sm text-right" style="width: 100px" value="${this.shippingFee || ''}" placeholder="0 ₫">
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
                <div class="pos-qr-payment-card card p-2 mt-2 bg-light text-center border-primary-subtle">
                  ${shopSettings.qrCode ? `
                    <div class="text-xs text-bold text-primary mb-1">📱 MÃ QR THANH TOÁN (VIETQR / NGÂN HÀNG)</div>
                    <div class="pos-qr-img-wrap" style="position:relative; display:inline-block; margin: 4px auto;">
                      <img src="${shopSettings.qrCode}" class="pos-qr-img" alt="Mã QR thanh toán">
                    </div>
                    <div class="text-xs text-muted mt-1">Số tiền cần thanh toán: <b class="text-success text-sm">${formatVND(totals.totalAmount)}</b></div>
                    ${shopSettings.bankInfo ? `<div class="text-xs text-bold text-muted mt-1">${escapeHTML(shopSettings.bankInfo)}</div>` : ''}
                    <button type="button" class="btn btn-primary btn-block btn-sm mt-2" id="btn-open-fullscreen-qr">
                      🔍 Mở QR Toàn Màn Hình Cho Khách Quét
                    </button>
                  ` : `
                    <div class="text-xs text-bold text-warning mb-1">⚠️ Chưa có ảnh mã QR thanh toán</div>
                    <p class="text-xs text-muted mb-2">Thêm ảnh mã QR ngân hàng để khách quét trả tiền trên điện thoại</p>
                    ${shopSettings.bankInfo ? `<div class="text-xs text-bold mb-2">${escapeHTML(shopSettings.bankInfo)}</div>` : ''}
                    <button type="button" class="btn btn-outline-primary btn-sm" id="btn-quick-upload-qr">
                      ➕ Thêm Ảnh Mã QR Ngay
                    </button>
                    <input type="file" id="pos-qr-file-input" accept="image/*" style="display:none">
                  `}
                </div>
              ` : ''}

              ${this.paymentMethod === 'partial' ? `
                <div class="partial-pay-box card p-2 bg-light mt-1">
                  <div class="summary-line">
                    <span>Khách trả trước:</span>
                    <input type="number" id="input-paid-amount" class="form-input-sm text-right" style="width: 120px" value="${this.paidAmount || 0}">
                  </div>
                  <div class="summary-line text-danger mt-1">
                    <span>Ghi nợ lại:</span>
                    <span class="text-bold">${formatVND(Math.max(0, totals.totalAmount - this.paidAmount))}</span>
                  </div>
                </div>
              ` : ''}

              <!-- Ghi chú đơn -->
              <div class="form-group mb-1 mt-1">
                <input type="text" id="input-order-notes" class="form-input-sm" placeholder="Ghi chú đơn hàng (nếu có)..." value="${escapeHTML(this.notes)}">
              </div>

              <!-- Nút hoàn tất đơn to bấm 1 tay -->
              <button id="btn-complete-order" class="btn btn-success btn-block btn-lg btn-complete-order">
                <span>✓ HOÀN TẤT ĐƠN (${formatVND(totals.totalAmount)})</span>
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // ================= TAB 2: DANH SÁCH ĐƠN HÀNG =================
  async renderOrdersView() {
    const orders = await db.getAll('orders');
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

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
            ${this.orderSearchQuery ? `<button id="btn-clear-order-search" class="clear-search-btn">&times;</button>` : ''}
          </div>
          <div class="category-tabs-scroll">
            <button class="cat-pill ${this.orderFilterStatus === 'all' ? 'active' : ''}" data-status="all">Tất cả (${orders.length})</button>
            <button class="cat-pill ${this.orderFilterStatus === 'completed' ? 'active' : ''}" data-status="completed">Hoàn thành</button>
            <button class="cat-pill ${this.orderFilterStatus === 'cancelled' ? 'active' : ''}" data-status="cancelled">Đã hủy</button>
          </div>
        </div>

        <div class="orders-list">
          ${filtered.length === 0 ? `
            <div class="empty-state">
              <p class="empty-icon">📦</p>
              <p class="empty-title">Không tìm thấy đơn hàng nào</p>
            </div>
          ` : filtered.map(o => {
            const isCancelled = o.status === 'cancelled';
            return `
              <div class="order-card ${isCancelled ? 'card-cancelled' : ''}" data-id="${o.id}">
                <div class="order-card-top">
                  <div>
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

                <div class="order-card-bottom">
                  <div class="order-pay-info text-xs">
                    <span>${o.paymentMethod === 'cash' ? '💵 Tiền mặt' : o.paymentMethod === 'qr' ? '📱 Quét mã QR' : o.paymentMethod === 'transfer' ? '🏦 Chuyển khoản' : o.paymentMethod === 'debt' ? '📝 Ghi nợ' : '💳 Trả một phần'}</span>
                  </div>
                  <div class="order-total-price">
                    Tổng: <span class="text-bold text-primary">${formatVND(o.totalAmount)}</span>
                  </div>
                </div>

                <div class="order-card-actions mt-2" style="display:flex; justify-content: flex-end; gap:6px;">
                  <button class="btn btn-outline-primary btn-xs btn-view-order-detail" data-id="${o.id}">👁️ Hóa đơn</button>
                  ${!isCancelled ? `
                    <button class="btn btn-outline-danger btn-xs btn-cancel-order" data-id="${o.id}">❌ Hủy đơn & hoàn kho</button>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
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

    // Tìm sản phẩm
    const searchInput = document.getElementById('pos-product-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchProductQuery = e.target.value;
        this.render();
      });
    }
    const clearSearch = document.getElementById('btn-clear-pos-search');
    if (clearSearch) {
      clearSearch.addEventListener('click', () => {
        this.searchProductQuery = '';
        this.render();
      });
    }

    // Lọc danh mục POS
    document.querySelectorAll('.pos-catalog-panel .cat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        this.posCategory = btn.dataset.cat;
        this.render();
      });
    });

    // Thêm sản phẩm vào giỏ khi chạm card
    document.querySelectorAll('.pos-item-card').forEach(card => {
      card.addEventListener('click', async () => {
        const p = await db.getById('products', card.dataset.id);
        if (p) this.addItemToCart(p);
      });
    });

    // Thao tác giỏ hàng
    document.querySelectorAll('.btn-qty-inc').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        if (this.cart[idx]) {
          this.cart[idx].quantity += 1;
          this.cart[idx].subtotal = this.cart[idx].quantity * this.cart[idx].unitPrice;
          this.render();
        }
      });
    });

    document.querySelectorAll('.btn-qty-dec').forEach(btn => {
      btn.addEventListener('click', () => {
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

    document.querySelectorAll('.input-item-qty').forEach(input => {
      input.addEventListener('change', () => {
        const idx = parseInt(input.dataset.idx, 10);
        const val = parseInt(input.value, 10);
        if (this.cart[idx]) {
          if (val > 0) {
            this.cart[idx].quantity = val;
            this.cart[idx].subtotal = this.cart[idx].quantity * this.cart[idx].unitPrice;
          } else {
            this.cart.splice(idx, 1);
            if (this.cart.length === 0) closeDrawer();
          }
          this.render();
        }
      });
    });

    document.querySelectorAll('.input-line-price').forEach(input => {
      input.addEventListener('change', () => {
        const idx = parseInt(input.dataset.idx, 10);
        const val = parseVND(input.value);
        if (this.cart[idx]) {
          this.cart[idx].unitPrice = val;
          this.cart[idx].subtotal = this.cart[idx].quantity * val;
          this.render();
        }
      });
    });

    document.querySelectorAll('.btn-remove-cart-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        this.cart.splice(idx, 1);
        if (this.cart.length === 0) closeDrawer();
        this.render();
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
      paidInput.addEventListener('input', (e) => {
        this.paidAmount = parseInt(e.target.value, 10) || 0;
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

    // Mở QR toàn màn hình cho khách quét từ giỏ hàng
    const openFullscreenQrBtn = document.getElementById('btn-open-fullscreen-qr');
    if (openFullscreenQrBtn) {
      openFullscreenQrBtn.addEventListener('click', async () => {
        const shop = (await db.getSetting('shop_info')) || {};
        const totals = this.calculateTotals(shop);
        this.showFullScreenQrModal(shop.qrCode, shop.bankInfo, totals.totalAmount);
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
    const totals = this.calculateTotals(shopSettings);
    const totalEl = document.querySelector('.total-val');
    const completeBtnSpan = document.querySelector('#btn-complete-order span');
    const floatingTotalEl = document.querySelector('.floating-cart-total');

    if (totalEl) totalEl.textContent = formatVND(totals.totalAmount);
    if (completeBtnSpan) completeBtnSpan.textContent = `✓ HOÀN TẤT ĐƠN (${formatVND(totals.totalAmount)})`;
    if (floatingTotalEl) floatingTotalEl.textContent = formatVND(totals.totalAmount);
  }

  bindOrdersEvents() {
    const searchInput = document.getElementById('order-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.orderSearchQuery = e.target.value;
        this.render();
      });
    }

    const clearSearch = document.getElementById('btn-clear-order-search');
    if (clearSearch) {
      clearSearch.addEventListener('click', () => {
        this.orderSearchQuery = '';
        this.render();
      });
    }

    document.querySelectorAll('.orders-view-panel .cat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        this.orderFilterStatus = btn.dataset.status;
        this.render();
      });
    });

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

  // Modal hóa đơn
  async showOrderDetailModal(orderId) {
    const order = await db.getById('orders', orderId);
    if (!order) return;

    const shopSettings = (await db.getSetting('shop_info')) || {};
    const ptttText = order.paymentMethod === 'cash' ? 'Tiền mặt' :
                     order.paymentMethod === 'qr' ? 'Quét mã QR' :
                     order.paymentMethod === 'transfer' ? 'Chuyển khoản' :
                     order.paymentMethod === 'debt' ? 'Ghi nợ' : 'Trả một phần';

    const modalHtml = `
      <div class="modal-backdrop" id="order-detail-modal">
        <div class="modal-content">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">🧾 Hóa Đơn Bán Hàng</h2>
              <div class="modal-subtitle">Mã đơn: ${escapeHTML(order.id)}</div>
            </div>
            <button class="modal-close" id="btn-close-odmodal">&times;</button>
          </div>

          <div class="modal-body receipt-view" id="printable-receipt">
            <div class="receipt-header text-center">
              ${shopSettings.logo ? `<img src="${shopSettings.logo}" class="receipt-logo" alt="Logo">` : ''}
              <h2 class="receipt-shop-name">${escapeHTML(shopSettings.shopName || 'CỬA HÀNG DIỀU')}</h2>
              <p class="receipt-shop-meta text-xs">${escapeHTML(shopSettings.address || '')}</p>
              <p class="receipt-shop-meta text-xs">Hotline: ${escapeHTML(shopSettings.phone || '')}</p>
              <div class="receipt-divider text-muted">********************************</div>
            </div>

            <div class="receipt-meta-grid text-xs mt-2 mb-2">
              <div><b>Khách hàng:</b> ${escapeHTML(order.customerName || 'Khách lẻ')}</div>
              <div><b>Ngày:</b> ${formatDateTime(order.createdAt)}</div>
              ${order.customerPhone ? `<div><b>SĐT:</b> ${escapeHTML(order.customerPhone)}</div>` : ''}
              <div><b>PTTT:</b> ${ptttText}</div>
            </div>

            <table class="receipt-table">
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th class="text-center">SL</th>
                  <th class="text-right">Đơn giá</th>
                  <th class="text-right">T.Tiền</th>
                </tr>
              </thead>
              <tbody>
                ${(order.items || []).map(i => `
                  <tr>
                    <td>${escapeHTML(i.productName)}</td>
                    <td class="text-center">${i.quantity}</td>
                    <td class="text-right">${formatVND(i.unitPrice)}</td>
                    <td class="text-right">${formatVND(i.subtotal)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="receipt-totals text-sm">
              <div class="receipt-total-row">
                <span>Tiền hàng:</span>
                <span>${formatVND(order.subtotal)}</span>
              </div>
              ${order.discountAmount > 0 ? `
                <div class="receipt-total-row">
                  <span>Chiết khấu:</span>
                  <span>-${formatVND(order.discountAmount)}</span>
                </div>
              ` : ''}
              ${order.shippingFee > 0 ? `
                <div class="receipt-total-row">
                  <span>Phí ship:</span>
                  <span>+${formatVND(order.shippingFee)}</span>
                </div>
              ` : ''}
              ${order.vatAmount > 0 ? `
                <div class="receipt-total-row">
                  <span>VAT:</span>
                  <span>+${formatVND(order.vatAmount)}</span>
                </div>
              ` : ''}
              <div class="receipt-total-row text-bold receipt-grand-total">
                <span>TỔNG CỘNG:</span>
                <span>${formatVND(order.totalAmount)}</span>
              </div>
              <div class="receipt-total-row">
                <span>Đã thanh toán:</span>
                <span>${formatVND(order.paidAmount || 0)}</span>
              </div>
              ${order.debtAmount > 0 ? `
                <div class="receipt-total-row text-danger text-bold">
                  <span>Còn nợ:</span>
                  <span>${formatVND(order.debtAmount)}</span>
                </div>
              ` : ''}
            </div>

            ${shopSettings.bankInfo ? `
              <div class="receipt-bank-box card p-2 bg-light mt-2">
                <div class="text-xs text-muted">Thông tin chuyển khoản:</div>
                <div class="text-xs text-bold">${escapeHTML(shopSettings.bankInfo)}</div>
              </div>
            ` : ''}

            ${shopSettings.qrCode ? `
              <div class="receipt-qr-box text-center mt-2">
                <img src="${shopSettings.qrCode}" class="receipt-qr-img" alt="Mã QR thanh toán">
                <div class="text-xs text-muted mt-1">(Quét mã QR để thanh toán)</div>
                <button type="button" class="btn btn-outline-primary btn-xs mt-1 no-print" id="btn-zoom-receipt-qr">
                  🔍 Phóng to mã QR
                </button>
              </div>
            ` : ''}

            <div class="receipt-footer text-center mt-3 text-xs text-muted">
              <p>Cảm ơn quý khách và hẹn gặp lại! 🪁</p>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn btn-outline-primary btn-sm" id="btn-print-receipt">🖨️ In Hóa Đơn</button>
            <div style="flex:1"></div>
            <button class="btn btn-secondary btn-sm" id="btn-close-odmodal2">Đóng</button>
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

    document.getElementById('btn-print-receipt').addEventListener('click', () => {
      window.print();
    });

    const openQrZoom = () => {
      this.showFullScreenQrModal(shopSettings.qrCode, shopSettings.bankInfo, (order.debtAmount > 0 ? order.debtAmount : order.totalAmount));
    };

    document.getElementById('btn-zoom-receipt-qr')?.addEventListener('click', openQrZoom);
  }

  // Modal phóng to mã QR toàn màn hình sáng rõ cho khách quét
  showFullScreenQrModal(qrImageBase64, bankInfo, amount = 0) {
    if (!qrImageBase64) {
      alert('Chưa có ảnh mã QR! Vui lòng vào Cài Đặt để tải ảnh mã QR ngân hàng hoặc MoMo lên.');
      return;
    }

    const modalHtml = `
      <div class="modal-backdrop fullscreen-qr-backdrop" id="fullscreen-qr-modal">
        <div class="fullscreen-qr-container">
          <div class="fullscreen-qr-header">
            <h3 class="fullscreen-qr-title">📱 QUÉT MÃ QR THANH TOÁN</h3>
            <button class="fullscreen-qr-close" id="btn-close-fsqr">&times;</button>
          </div>
          <div class="fullscreen-qr-body">
            <div class="fullscreen-qr-card">
              <img src="${qrImageBase64}" class="fullscreen-qr-img" alt="Mã QR thanh toán">
              ${amount > 0 ? `
                <div class="fullscreen-qr-amount">
                  <span class="text-xs text-muted">Số tiền cần thanh toán:</span>
                  <div class="amount-val">${formatVND(amount)}</div>
                </div>
              ` : ''}
              ${bankInfo ? `
                <div class="fullscreen-qr-bank-info">
                  ${escapeHTML(bankInfo)}
                </div>
              ` : ''}
              <div class="fullscreen-qr-hint">
                Dùng camera điện thoại hoặc app ngân hàng / MoMo / ZaloPay để quét
              </div>
            </div>
          </div>
          <div class="fullscreen-qr-footer">
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
  }
}
