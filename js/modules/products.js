// Quản lý sản phẩm (Diều)
import { db } from '../db.js';
import { formatVND, parseVND, compressImage, escapeHTML } from '../utils.js';
import { PRODUCT_CATEGORIES, PRODUCT_UNITS } from '../config.js';

export class ProductModule {
  constructor(app) {
    this.app = app;
    this.currentCategory = 'all';
    this.searchQuery = '';
  }

  async render() {
    const container = document.getElementById('view-container');
    const products = await db.getAll('products');

    // Lọc theo tìm kiếm và danh mục
    const filtered = products.filter(p => {
      const matchCat = this.currentCategory === 'all' || p.category === this.currentCategory;
      const query = this.searchQuery.toLowerCase().trim();
      const matchSearch = !query ||
        p.name.toLowerCase().includes(query) ||
        (p.code && p.code.toLowerCase().includes(query)) ||
        (p.size && p.size.toLowerCase().includes(query)) ||
        (p.color && p.color.toLowerCase().includes(query));
      return matchCat && matchSearch;
    });

    // Sắp xếp: hàng sắp hết lên đầu, sau đó theo tên
    filtered.sort((a, b) => {
      const aLow = (a.stock <= (a.lowStockThreshold || 5)) ? 1 : 0;
      const bLow = (b.stock <= (b.lowStockThreshold || 5)) ? 1 : 0;
      if (aLow !== bLow) return bLow - aLow;
      return a.name.localeCompare(b.name, 'vi');
    });

    container.innerHTML = `
      <div class="view-header">
        <div class="header-title-row">
          <div>
            <h1 class="view-title">🪁 Danh Sách Diều & Phụ Kiện</h1>
            <p class="view-subtitle">Tổng ${products.length} sản phẩm (${filtered.length} đang hiển thị)</p>
          </div>
          <button id="btn-add-product" class="btn btn-primary btn-sm">
            <span>+</span> Thêm Diều
          </button>
        </div>

        <!-- Tìm kiếm & Bộ lọc danh mục -->
        <div class="search-filter-bar">
          <div class="search-input-wrap">
            <input type="text" id="product-search" class="form-input" placeholder="🔍 Tìm tên, mã, kích thước, màu..." value="${escapeHTML(this.searchQuery)}">
            ${this.searchQuery ? `<button id="btn-clear-search" class="clear-search-btn">&times;</button>` : ''}
          </div>
          <div class="category-tabs-scroll">
            <button class="cat-pill ${this.currentCategory === 'all' ? 'active' : ''}" data-cat="all">Tất cả</button>
            ${PRODUCT_CATEGORIES.map(cat => `
              <button class="cat-pill ${this.currentCategory === cat ? 'active' : ''}" data-cat="${escapeHTML(cat)}">${escapeHTML(cat)}</button>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Danh sách sản phẩm -->
      <div class="product-grid">
        ${filtered.length === 0 ? `
          <div class="empty-state">
            <p class="empty-icon">🪁</p>
            <p class="empty-title">Không tìm thấy sản phẩm nào</p>
            <p class="empty-desc">${this.searchQuery ? 'Thử tìm với từ khóa khác hoặc' : 'Hãy bấm nút dưới để'} thêm diều mới.</p>
            <button id="btn-add-product-empty" class="btn btn-primary">+ Thêm Sản Phẩm Mới</button>
          </div>
        ` : filtered.map(p => {
          const isLowStock = p.stock <= (p.lowStockThreshold || 5);
          return `
            <div class="product-card ${isLowStock ? 'card-warning' : ''}" data-id="${p.id}">
              <div class="product-thumb-wrap">
                ${p.photo ? `
                  <img src="${p.photo}" alt="${escapeHTML(p.name)}" class="product-thumb" loading="lazy">
                ` : `
                  <div class="product-thumb-placeholder">
                    <span>🪁</span>
                  </div>
                `}
                ${isLowStock ? `
                  <span class="badge badge-danger low-stock-badge">Sắp hết hàng (${p.stock})</span>
                ` : `
                  <span class="badge badge-success stock-badge">Tồn: ${p.stock} ${escapeHTML(p.unit || 'cái')}</span>
                `}
              </div>

              <div class="product-info">
                <div class="product-category-tag">${escapeHTML(p.category || 'Diều')}</div>
                <h3 class="product-name">${escapeHTML(p.name)}</h3>
                <div class="product-code-meta">
                  <span class="meta-tag">Mã: ${escapeHTML(p.code || '---')}</span>
                  ${p.size ? `<span class="meta-tag">KT: ${escapeHTML(p.size)}</span>` : ''}
                  ${p.color ? `<span class="meta-tag">Màu: ${escapeHTML(p.color)}</span>` : ''}
                </div>
                <div class="product-price-row">
                  <div>
                    <div class="selling-price">${formatVND(p.sellingPrice)}</div>
                    <div class="cost-price-hint">Giá nhập: ${formatVND(p.costPrice)}</div>
                  </div>
                  <div class="product-card-actions">
                    <button class="btn-icon btn-edit-product" data-id="${p.id}" title="Chỉnh sửa">✏️</button>
                    <button class="btn-icon btn-quick-sell" data-id="${p.id}" title="Bán nhanh">⚡ Bán</button>
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    // Tìm kiếm
    const searchInput = document.getElementById('product-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.render();
      });
    }

    const clearSearch = document.getElementById('btn-clear-search');
    if (clearSearch) {
      clearSearch.addEventListener('click', () => {
        this.searchQuery = '';
        this.render();
      });
    }

    // Lọc danh mục
    document.querySelectorAll('.cat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentCategory = btn.dataset.cat;
        this.render();
      });
    });

    // Thêm mới
    const addBtn = document.getElementById('btn-add-product');
    const addBtnEmpty = document.getElementById('btn-add-product-empty');
    if (addBtn) addBtn.addEventListener('click', () => this.showProductModal());
    if (addBtnEmpty) addBtnEmpty.addEventListener('click', () => this.showProductModal());

    // Chỉnh sửa
    document.querySelectorAll('.btn-edit-product').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showProductModal(btn.dataset.id);
      });
    });

    // Bán nhanh
    document.querySelectorAll('.btn-quick-sell').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const p = await db.getById('products', btn.dataset.id);
        if (p && this.app.salesModule) {
          this.app.navigateTo('sales');
          this.app.salesModule.addItemToCart(p);
        }
      });
    });

    // Click vào card xem chi tiết/sửa
    document.querySelectorAll('.product-card').forEach(card => {
      card.addEventListener('click', () => {
        this.showProductModal(card.dataset.id);
      });
    });
  }

  async showProductModal(productId = null) {
    let product = null;
    let isEdit = false;

    if (productId) {
      product = await db.getById('products', productId);
      isEdit = !!product;
    }

    if (!product) {
      // Tự sinh mã sản phẩm nếu thêm mới
      const count = (await db.getAll('products', true)).length + 1;
      const code = 'DIEU-' + String(count).padStart(3, '0');
      product = {
        id: 'SP-' + Date.now(),
        code,
        name: '',
        category: PRODUCT_CATEGORIES[0],
        size: '',
        color: '',
        unit: 'Chiếc',
        costPrice: 0,
        sellingPrice: 0,
        stock: 10,
        lowStockThreshold: 5,
        photo: '',
        notes: ''
      };
    }

    let photoBase64 = product.photo || '';

    const modalHtml = `
      <div class="modal-backdrop" id="product-modal">
        <div class="modal-content modal-lg">
          <div class="modal-header">
            <h2 class="modal-title">${isEdit ? '✏️ Chỉnh Sửa Diều' : '➕ Thêm Diều Mới'}</h2>
            <button class="modal-close" id="btn-modal-close">&times;</button>
          </div>

          <form id="product-form" class="modal-body">
            <!-- Ảnh sản phẩm -->
            <div class="photo-upload-section">
              <div class="photo-preview-box" id="photo-preview-wrap">
                ${photoBase64 ? `
                  <img src="${photoBase64}" id="photo-preview-img" class="uploaded-img" alt="Ảnh diều">
                  <button type="button" class="btn-remove-photo" id="btn-remove-photo">&times;</button>
                ` : `
                  <div class="photo-placeholder" id="photo-placeholder">
                    <span class="photo-icon">📷</span>
                    <span class="photo-hint">Chạm để tải ảnh diều (tự nén nhỏ)</span>
                  </div>
                `}
              </div>
              <input type="file" id="photo-input" accept="image/*" style="display:none">
            </div>

            <!-- Tên & Mã -->
            <div class="form-row">
              <div class="form-group flex-2">
                <label class="form-label required">Tên diều / Phụ kiện</label>
                <input type="text" id="p-name" class="form-input" required placeholder="VD: Diều Sáo Cánh Bầu 2m" value="${escapeHTML(product.name)}">
              </div>
              <div class="form-group flex-1">
                <label class="form-label">Mã sản phẩm</label>
                <input type="text" id="p-code" class="form-input" placeholder="Tự sinh nếu trống" value="${escapeHTML(product.code)}">
              </div>
            </div>

            <!-- Nhóm / Loại & Đơn vị tính -->
            <div class="form-row">
              <div class="form-group flex-2">
                <label class="form-label">Nhóm / Danh mục</label>
                <select id="p-category" class="form-select">
                  ${PRODUCT_CATEGORIES.map(c => `
                    <option value="${escapeHTML(c)}" ${product.category === c ? 'selected' : ''}>${escapeHTML(c)}</option>
                  `).join('')}
                </select>
              </div>
              <div class="form-group flex-1">
                <label class="form-label">Đơn vị tính</label>
                <select id="p-unit" class="form-select">
                  ${PRODUCT_UNITS.map(u => `
                    <option value="${escapeHTML(u)}" ${product.unit === u ? 'selected' : ''}>${escapeHTML(u)}</option>
                  `).join('')}
                </select>
              </div>
            </div>

            <!-- Kích thước & Màu sắc -->
            <div class="form-row">
              <div class="form-group flex-1">
                <label class="form-label">Kích thước</label>
                <input type="text" id="p-size" class="form-input" placeholder="VD: 2.2m x 1m hoặc đuôi 5m" value="${escapeHTML(product.size || '')}">
              </div>
              <div class="form-group flex-1">
                <label class="form-label">Màu sắc / Họa tiết</label>
                <input type="text" id="p-color" class="form-input" placeholder="VD: Đỏ vàng, Phượng hoàng" value="${escapeHTML(product.color || '')}">
              </div>
            </div>

            <!-- Giá nhập & Giá bán -->
            <div class="form-row price-highlight-row">
              <div class="form-group flex-1">
                <label class="form-label required">Giá bán (VNĐ)</label>
                <input type="text" id="p-selling-price" class="form-input form-input-lg text-primary text-bold" required value="${product.sellingPrice ? formatVND(product.sellingPrice) : ''}" placeholder="0 ₫">
              </div>
              <div class="form-group flex-1">
                <label class="form-label">Giá nhập gốc (VNĐ)</label>
                <input type="text" id="p-cost-price" class="form-input form-input-lg" value="${product.costPrice ? formatVND(product.costPrice) : ''}" placeholder="0 ₫">
              </div>
            </div>

            <!-- Tồn kho & Mức cảnh báo tồn thấp -->
            <div class="form-row">
              <div class="form-group flex-1">
                <label class="form-label required">Tồn kho hiện tại</label>
                <input type="number" id="p-stock" class="form-input" required min="0" step="1" value="${product.stock !== undefined ? product.stock : 10}">
              </div>
              <div class="form-group flex-1">
                <label class="form-label">Báo động khi tồn dưới</label>
                <input type="number" id="p-low-stock" class="form-input" min="0" step="1" value="${product.lowStockThreshold || 5}">
              </div>
            </div>

            <!-- Ghi chú -->
            <div class="form-group">
              <label class="form-label">Ghi chú sản phẩm</label>
              <textarea id="p-notes" class="form-textarea" rows="2" placeholder="Ghi chú về chất liệu nan diều, loại vải caro, sáo gắn kèm...">${escapeHTML(product.notes || '')}</textarea>
            </div>

            <div class="modal-footer">
              ${isEdit ? `
                <button type="button" class="btn btn-outline-danger" id="btn-soft-delete-product">Xóa vào Thùng rác</button>
              ` : ''}
              <div style="flex:1"></div>
              <button type="button" class="btn btn-secondary" id="btn-cancel-modal">Hủy</button>
              <button type="submit" class="btn btn-primary" id="btn-save-product">Lưu Sản Phẩm</button>
            </div>
          </form>
        </div>
      </div>
    `;

    // Chèn modal vào DOM
    const oldModal = document.getElementById('product-modal');
    if (oldModal) oldModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Gán sự kiện modal
    const modalEl = document.getElementById('product-modal');
    const closeBtn = document.getElementById('btn-modal-close');
    const cancelBtn = document.getElementById('btn-cancel-modal');
    const deleteBtn = document.getElementById('btn-soft-delete-product');
    const form = document.getElementById('product-form');

    const photoWrap = document.getElementById('photo-preview-wrap');
    const photoInput = document.getElementById('photo-input');
    const removePhotoBtn = document.getElementById('btn-remove-photo');

    const closeModal = () => modalEl.remove();
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    // Xử lý nạp ảnh
    photoWrap.addEventListener('click', (e) => {
      if (e.target.id === 'btn-remove-photo') return;
      photoInput.click();
    });

    photoInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        try {
          photoBase64 = await compressImage(file, 600, 0.7);
          photoWrap.innerHTML = `
            <img src="${photoBase64}" id="photo-preview-img" class="uploaded-img" alt="Ảnh diều">
            <button type="button" class="btn-remove-photo" id="btn-remove-photo">&times;</button>
          `;
          document.getElementById('btn-remove-photo').addEventListener('click', (ev) => {
            ev.stopPropagation();
            photoBase64 = '';
            photoWrap.innerHTML = `
              <div class="photo-placeholder">
                <span class="photo-icon">📷</span>
                <span class="photo-hint">Chạm để tải ảnh diều</span>
              </div>
            `;
          });
        } catch (err) {
          alert('Lỗi nén ảnh: ' + err.message);
        }
      }
    });

    if (removePhotoBtn) {
      removePhotoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        photoBase64 = '';
        photoWrap.innerHTML = `
          <div class="photo-placeholder">
            <span class="photo-icon">📷</span>
            <span class="photo-hint">Chạm để tải ảnh diều</span>
          </div>
        `;
      });
    }

    // Tự động format tiền tệ khi gõ
    const sellingPriceInput = document.getElementById('p-selling-price');
    const costPriceInput = document.getElementById('p-cost-price');

    const formatInputPrice = (input) => {
      const val = parseVND(input.value);
      input.value = val > 0 ? formatVND(val) : '';
    };

    sellingPriceInput.addEventListener('blur', () => formatInputPrice(sellingPriceInput));
    costPriceInput.addEventListener('blur', () => formatInputPrice(costPriceInput));

    // Xóa mềm
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (confirm(`Bạn có chắc muốn chuyển "${product.name}" vào Thùng rác không?\n(Bạn luôn có thể khôi phục lại trong Cài đặt > Thùng rác)`)) {
          await db.softDelete('products', product.id);
          closeModal();
          this.render();
        }
      });
    }

    // Lưu
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('p-name').value.trim();
      if (!name) {
        alert('Vui lòng nhập tên diều!');
        return;
      }

      const sellingPrice = parseVND(sellingPriceInput.value);
      const costPrice = parseVND(costPriceInput.value);
      const stock = parseInt(document.getElementById('p-stock').value, 10) || 0;
      const lowStock = parseInt(document.getElementById('p-low-stock').value, 10) || 5;
      const code = document.getElementById('p-code').value.trim() || product.code;

      const updated = {
        ...product,
        name,
        code,
        category: document.getElementById('p-category').value,
        unit: document.getElementById('p-unit').value,
        size: document.getElementById('p-size').value.trim(),
        color: document.getElementById('p-color').value.trim(),
        sellingPrice,
        costPrice,
        stock,
        lowStockThreshold: lowStock,
        photo: photoBase64,
        notes: document.getElementById('p-notes').value.trim()
      };

      await db.put('products', updated);
      closeModal();
      this.render();
    });
  }
}
