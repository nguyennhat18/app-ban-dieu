// Quản lý sản phẩm (Diều & Phụ kiện - Mobile First - Hỗ Trợ Nhiều Kho Linh Hoạt)
import { db } from '../db.js';
import { formatVND, parseVND, compressImage, escapeHTML, mergeImportedProductsByName } from '../utils.js';
import { DEFAULT_WAREHOUSES, normalizeWarehouseId, PRODUCT_CATEGORIES, PRODUCT_UNITS } from '../config.js';
import { parseStockArray2D, SAMPLE_STOCK_INVENTORY, detectCategory, detectUnit, downloadProductExcelTemplate } from '../excel-importer.js';

export class ProductModule {
  constructor(app) {
    this.app = app;
    this.currentWarehouse = 'kho-ao-dieu';
    this.currentCategory = 'all';
    this.stockFilter = 'all'; // 'all' | 'low' | 'out'
    this.searchQuery = '';
    this._cachedWarehouses = [...DEFAULT_WAREHOUSES];
  }

  _getWarehousesSync() {
    return (Array.isArray(this._cachedWarehouses) && this._cachedWarehouses.length > 0)
      ? this._cachedWarehouses
      : DEFAULT_WAREHOUSES;
  }

  _resolveWarehouse(whId, warehouses = this._getWarehousesSync()) {
    const resolvedId = normalizeWarehouseId(whId, warehouses);
    return warehouses.find(w => w.id === resolvedId) || warehouses[0] || { id: resolvedId, name: 'Kho Diều', icon: '🪁' };
  }

  async render() {
    const container = document.getElementById('view-container');
    const allProducts = await db.getAll('products');
    const loadedWarehouses = await db.getWarehouses();
    const warehouses = (Array.isArray(loadedWarehouses) && loadedWarehouses.length > 0)
      ? loadedWarehouses
      : [...DEFAULT_WAREHOUSES];
    this._cachedWarehouses = warehouses;

    if (!warehouses.some(w => w.id === this.currentWarehouse)) {
      this.currentWarehouse = warehouses[0]?.id || 'stock';
    }

    const categories = await db.getCategories(this.currentWarehouse);
    if (this.currentCategory !== 'all' && !categories.includes(this.currentCategory)) {
      this.currentCategory = 'all';
    }

    // Phân loại sản phẩm theo từng kho (tự động map 'new' cũ sang 'kho-dieu')
    const countByWarehouse = {};
    warehouses.forEach(w => { countByWarehouse[w.id] = 0; });
    const warehouseProducts = [];

    for (const p of allProducts) {
      const normalizedWh = normalizeWarehouseId(p.warehouse, warehouses);
      countByWarehouse[normalizedWh] = (countByWarehouse[normalizedWh] || 0) + 1;
      if (normalizedWh === this.currentWarehouse) {
        warehouseProducts.push(p);
      }
    }
    this._cachedWarehouseProducts = warehouseProducts;

    const activeWh = this._resolveWarehouse(this.currentWarehouse, warehouses);

    // Lọc theo tìm kiếm, danh mục và trạng thái tồn kho trong kho đang chọn
    const filtered = this._filterWarehouseProducts(warehouseProducts);

    const lowStockCount = warehouseProducts.filter(p => p.stock > 0 && p.stock <= (p.lowStockThreshold || 5)).length;
    const outStockCount = warehouseProducts.filter(p => p.stock <= 0).length;

    container.innerHTML = `
      <!-- THANH CHUYỂN ĐỔI CÁC KHO HÀNG & TẠO KHO MỚI -->
      <div class="warehouse-tabs-bar-wrap mb-3">
        <button type="button" class="warehouse-create-btn" id="btn-open-create-warehouse" title="Tạo kho hàng mới">
          ➕ Tạo Kho
        </button>
        <div class="warehouse-tabs-bar">
          ${warehouses.map(w => {
            const count = countByWarehouse[w.id] || 0;
            const isActive = this.currentWarehouse === w.id;
            const badgeClass = isActive
              ? (w.id === 'stock' ? 'badge-warning' : 'badge-primary')
              : 'badge-light';
            return `
              <button type="button" class="warehouse-tab-btn ${isActive ? 'active' : ''}" data-warehouse="${escapeHTML(w.id)}">
                <span class="wh-tab-icon">${w.icon || '📦'}</span>
                <span class="wh-tab-title">${escapeHTML(w.name)}</span>
                <span class="wh-tab-badge badge ${badgeClass}">${count}</span>
              </button>
            `;
          }).join('')}
        </div>
      </div>

      <div class="view-header">
        <div class="header-title-row" style="flex-wrap: wrap; align-items: center; gap: 8px;">
          <div>
            <h1 class="view-title">
              ${activeWh.icon || '📦'} ${escapeHTML(activeWh.name)}
            </h1>
            <p class="view-subtitle">${warehouseProducts.length} mặt hàng • ${lowStockCount} sắp hết • ${outStockCount} hết hàng</p>
          </div>
          <div class="d-flex flex-wrap align-center gap-2" style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">
            <button id="btn-goto-inventory-from-products" class="btn btn-outline-info btn-sm" title="Quản lý phiếu nhập hàng & lịch sử kho"><span>📥</span> Nhập Hàng</button>
            <button id="btn-download-excel-template" class="btn btn-outline-primary btn-sm" title="Tải file Excel mẫu chuẩn để tự điền dữ liệu"><span>📄</span> Tải File Mẫu Excel</button>
            ${this.currentWarehouse === 'stock' ? `
              <button id="btn-import-stock-excel" class="btn btn-outline-success btn-sm" title="Đẩy file Excel hoặc CSV vào Kho Tồn">
                <span>📥</span> Đẩy File Excel
              </button>
              <input type="file" id="stock-excel-file-input" accept=".xlsx, .xls, .csv" style="display:none">
            ` : ''}
            <button id="btn-add-product" class="btn btn-primary btn-sm">
              <span>+</span> Thêm mới
            </button>
          </div>
        </div>

        ${this.currentWarehouse === 'stock' ? `
          <div class="stock-tools-bar mb-2 p-2 d-flex justify-between align-center flex-wrap gap-2" style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 10px; margin-bottom: 8px;">
            <div class="text-xs text-muted" style="flex: 1 1 200px;">
              💡 <b>Kho Tồn:</b> Nan, pass, sáo, dây, phụ kiện tồn kho. Bạn có thể đẩy file Excel lên bất cứ lúc nào.
            </div>
            <button id="btn-load-sample-stock-69" class="btn btn-outline-primary btn-xs" title="Nạp nhanh 69 mặt hàng phụ kiện từ file mẫu bạn gửi">
              ⚡ Nạp 69 Mặt Hàng Mẫu
            </button>
          </div>
        ` : ''}

        <!-- Tìm kiếm & Bộ lọc nhanh -->
        <div class="search-filter-bar">
          <div class="search-input-wrap">
            <input type="text" id="product-search" class="form-input" placeholder="🔍 Tìm tên, mã, kích thước, nhà cung cấp..." value="${escapeHTML(this.searchQuery)}">
            <button id="btn-clear-search" class="clear-search-btn" style="display:${this.searchQuery ? 'flex' : 'none'}">&times;</button>
          </div>

          <!-- Lọc nhanh theo tồn kho -->
          <div class="category-tabs-scroll mb-2">
            <button class="cat-pill ${this.stockFilter === 'all' ? 'active' : ''}" data-stock="all">Tất cả (${warehouseProducts.length})</button>
            <button class="cat-pill ${this.stockFilter === 'low' ? 'active' : ''}" data-stock="low">⚠️ Sắp hết (${lowStockCount})</button>
            <button class="cat-pill ${this.stockFilter === 'out' ? 'active' : ''}" data-stock="out">❌ Hết hàng (${outStockCount})</button>
          </div>

          <!-- Lọc theo danh mục diều -->
          <div class="category-tabs-scroll">
            <button class="cat-pill ${this.currentCategory === 'all' ? 'active' : ''}" data-cat="all">Tất cả loại</button>
            ${categories.map(cat => `
              <button class="cat-pill ${this.currentCategory === cat ? 'active' : ''}" data-cat="${escapeHTML(cat)}">${escapeHTML(cat)}</button>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Danh sách diều dạng lưới 2 cột mobile -->
      <div class="product-grid" id="products-grid-container">
        ${this._renderProductGridHtml(filtered)}
      </div>

      <!-- Nút tròn nổi (FAB) ở góc dưới phải để thêm diều bằng ngón cái -->
      <button class="fab-btn" id="btn-fab-add-product" title="Thêm mặt hàng mới">
        <span>+ Thêm Hàng</span>
      </button>
    `;

    this.bindEvents();
  }

  _filterWarehouseProducts(warehouseProducts) {
    const filtered = warehouseProducts.filter(p => {
      const matchCat = this.currentCategory === 'all' || p.category === this.currentCategory;
      const q = this.searchQuery.toLowerCase().trim();
      const matchSearch = !q ||
        p.name.toLowerCase().includes(q) ||
        (p.code && p.code.toLowerCase().includes(q)) ||
        (p.supplier && p.supplier.toLowerCase().includes(q)) ||
        (p.size && p.size.toLowerCase().includes(q)) ||
        (p.color && p.color.toLowerCase().includes(q));

      let matchStock = true;
      if (this.stockFilter === 'low') {
        matchStock = p.stock > 0 && p.stock <= (p.lowStockThreshold || 5);
      } else if (this.stockFilter === 'out') {
        matchStock = p.stock <= 0;
      }

      return matchCat && matchSearch && matchStock;
    });

    filtered.sort((a, b) => {
      const aLow = (a.stock <= (a.lowStockThreshold || 5)) ? 1 : 0;
      const bLow = (b.stock <= (b.lowStockThreshold || 5)) ? 1 : 0;
      if (aLow !== bLow) return bLow - aLow;
      return a.name.localeCompare(b.name, 'vi');
    });

    return filtered;
  }

  _renderProductGridHtml(filtered) {
    const warehouses = this._getWarehousesSync();
    const activeWh = this._resolveWarehouse(this.currentWarehouse, warehouses);

    if (filtered.length === 0) {
      return `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <p class="empty-icon">${activeWh.icon || '📦'}</p>
          <p class="empty-title">${this.currentWarehouse === 'stock' ? 'Kho Tồn Chưa Có Mặt Hàng Nào' : `${escapeHTML(activeWh.name)} chưa có mặt hàng phù hợp`}</p>
          <p class="empty-desc">${this.currentWarehouse === 'stock' ? 'Bạn có thể đẩy file Excel tồn kho lên hoặc nạp sẵn 69 mặt hàng mẫu từ file bạn cung cấp.' : 'Thử tìm từ khóa khác hoặc bấm nút thêm mặt hàng mới vào kho này.'}</p>
          <div class="d-flex justify-center gap-2 mt-2 flex-wrap" style="display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 8px; margin-top: 8px;">
            <button id="btn-download-excel-template" class="btn btn-outline-primary btn-sm" title="Tải file Excel mẫu chuẩn để tự điền dữ liệu"><span>📄</span> Tải File Mẫu Excel</button>
            ${this.currentWarehouse === 'stock' ? `
              <button id="btn-trigger-upload-excel" class="btn btn-success btn-sm">
                <span>📥</span> Đẩy File Excel Lên
              </button>
              <button id="btn-trigger-sample-69" class="btn btn-primary btn-sm">
                <span>⚡</span> Nạp 69 Mặt Hàng Mẫu
              </button>
            ` : `
              <button id="btn-add-product-empty" class="btn btn-primary btn-sm">+ Thêm mới</button>
            `}
          </div>
        </div>
      `;
    }

    return filtered.map(p => {
      const isOut = p.stock <= 0;
      const isLow = !isOut && p.stock <= (p.lowStockThreshold || 5);

      const stockBadge = isOut ?
        `<span class="badge badge-danger low-stock-badge">Hết hàng</span>` :
        isLow ?
        `<span class="badge badge-warning low-stock-badge">Còn ${p.stock}</span>` :
        `<span class="badge badge-success stock-badge">Còn ${p.stock}</span>`;

      const wh = this._resolveWarehouse(p.warehouse, warehouses);
      const warehouseBadgeClass = wh.id === 'stock' ? 'badge-warning' : 'badge-primary-subtle';
      const warehouseBadge = `<span class="badge ${warehouseBadgeClass} text-xs" style="position:absolute; bottom:6px; left:6px;">${wh.icon || '📦'} ${escapeHTML(wh.name)}</span>`;

      return `
        <div class="product-card ${isLow || isOut ? 'card-warning' : ''}" data-id="${p.id}">
          <div class="product-thumb-wrap">
            ${p.photo ? `
              <img src="${p.photo}" alt="${escapeHTML(p.name)}" class="product-thumb" loading="lazy">
            ` : `
              <div class="product-thumb-placeholder">
                <span>${wh.icon || '🪁'}</span>
              </div>
            `}
            ${stockBadge}
            ${warehouseBadge}
          </div>

          <div class="product-info">
            <div class="product-category-tag">${escapeHTML(p.category || 'Phụ kiện diều')}</div>
            <h3 class="product-name" title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</h3>
            <div class="product-code-meta">
              <span class="meta-tag">Mã: ${escapeHTML(p.code || '---')}</span>
              ${p.supplier ? `<span class="meta-tag text-primary">Nguồn: ${escapeHTML(p.supplier)}</span>` : ''}
            </div>
            <div class="product-price-row" style="flex-wrap: wrap; gap: 6px;">
              <div>
                <div class="selling-price">${formatVND(p.sellingPrice)}</div>
                <div class="cost-price-hint">Vốn: ${formatVND(p.costPrice)}</div>
              </div>
              <div class="product-card-actions" style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">
                <button type="button" class="btn-icon btn-switch-warehouse" style="display: inline-flex; align-items: center; justify-content: center; gap: 4px;" data-id="${p.id}" data-current="${escapeHTML(wh.id)}" title="Chuyển sang kho khác">
                  🔄 Chuyển kho
                </button>
                <button type="button" class="btn-icon btn-edit-product" style="display: inline-flex; align-items: center; justify-content: center;" data-id="${p.id}" title="Chỉnh sửa">✏️</button>
                <button type="button" class="btn-icon btn-quick-sell" style="display: inline-flex; align-items: center; justify-content: center; gap: 4px;" data-id="${p.id}" title="Thêm vào giỏ bán">⚡ Bán</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  bindEvents() {
    // Chuyển đổi giữa các Kho
    document.querySelectorAll('[data-warehouse]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentWarehouse = btn.dataset.warehouse;
        this.currentCategory = 'all';
        this.render();
      });
    });

    // Tải file mẫu Excel chuẩn
    document.querySelectorAll('#btn-download-excel-template').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await downloadProductExcelTemplate(this._cachedWarehouses);
        } catch (err) {
          alert('Lỗi tải file mẫu: ' + err.message);
        }
      });
    });

    // Cuộn nhẹ để tab kho đang chọn luôn nằm trong vùng nhìn thấy
    const activeTabEl = document.querySelector('.warehouse-tab-btn.active');
    if (activeTabEl && typeof activeTabEl.scrollIntoView === 'function') {
      activeTabEl.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    }

    // Nút tạo kho mới trực tiếp trên thanh kho
    const createWarehouseBtn = document.getElementById('btn-open-create-warehouse');
    if (createWarehouseBtn) {
      createWarehouseBtn.addEventListener('click', () => this.showCreateWarehouseModal());
    }

    // Lối tắt sang Quản Lý Nhập Hàng
    const gotoInvBtn = document.getElementById('btn-goto-inventory-from-products');
    if (gotoInvBtn) {
      gotoInvBtn.addEventListener('click', () => this.app.navigateTo('inventory'));
    }

    // Đẩy file Excel lên Kho Tồn
    const importExcelBtn = document.getElementById('btn-import-stock-excel');
    const fileInput = document.getElementById('stock-excel-file-input');

    if (importExcelBtn && fileInput) {
      importExcelBtn.addEventListener('click', () => fileInput.click());
    }
    if (fileInput) {
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
          await this.handleExcelUpload(file);
          fileInput.value = '';
        }
      });
    }

    // Nạp sẵn 69 mặt hàng mẫu
    const sampleStockBtn = document.getElementById('btn-load-sample-stock-69');
    if (sampleStockBtn) sampleStockBtn.addEventListener('click', () => this.loadSampleStockProducts());

    const updateGridOnly = () => {
      const clearBtn = document.getElementById('btn-clear-search');
      if (clearBtn) clearBtn.style.display = this.searchQuery ? 'flex' : 'none';
      const gridEl = document.getElementById('products-grid-container');
      if (!gridEl) return;
      const filtered = this._filterWarehouseProducts(this._cachedWarehouseProducts || []);
      gridEl.innerHTML = this._renderProductGridHtml(filtered);
      this.bindProductGridEvents();
    };

    const searchInput = document.getElementById('product-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        updateGridOnly();
      });
    }

    const clearSearch = document.getElementById('btn-clear-search');
    if (clearSearch) {
      clearSearch.addEventListener('click', () => {
        this.searchQuery = '';
        if (searchInput) searchInput.value = '';
        updateGridOnly();
        if (searchInput) searchInput.focus();
      });
    }

    // Lọc theo tồn kho
    document.querySelectorAll('[data-stock]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.stockFilter = btn.dataset.stock;
        this.render();
      });
    });

    // Lọc theo danh mục
    document.querySelectorAll('[data-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentCategory = btn.dataset.cat;
        this.render();
      });
    });

    // Thêm mới
    const addBtn = document.getElementById('btn-add-product');
    const fabBtn = document.getElementById('btn-fab-add-product');

    if (addBtn) addBtn.addEventListener('click', () => this.showProductModal());
    if (fabBtn) fabBtn.addEventListener('click', () => this.showProductModal());

    this.bindProductGridEvents();
  }

  bindProductGridEvents() {
    // Tải file mẫu Excel chuẩn trong empty-state
    document.querySelectorAll('#products-grid-container #btn-download-excel-template').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await downloadProductExcelTemplate(this._cachedWarehouses);
        } catch (err) {
          alert('Lỗi tải file mẫu: ' + err.message);
        }
      });
    });

    const fileInput = document.getElementById('stock-excel-file-input');
    const triggerUploadBtn = document.getElementById('btn-trigger-upload-excel');
    if (triggerUploadBtn && fileInput) {
      triggerUploadBtn.addEventListener('click', () => fileInput.click());
    }
    const triggerSampleBtn = document.getElementById('btn-trigger-sample-69');
    if (triggerSampleBtn) triggerSampleBtn.addEventListener('click', () => this.loadSampleStockProducts());

    const addBtnEmpty = document.getElementById('btn-add-product-empty');
    if (addBtnEmpty) addBtnEmpty.addEventListener('click', () => this.showProductModal());

    // Mở modal chọn kho để chuyển nhanh 1 chạm sang bất kỳ kho nào
    document.querySelectorAll('.btn-switch-warehouse').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const p = await db.getById('products', id);
        if (p) {
          await this.showMoveWarehouseModal(p);
        }
      });
    });

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

    // Chạm vào card để xem/sửa
    document.querySelectorAll('.product-card').forEach(card => {
      card.addEventListener('click', () => {
        this.showProductModal(card.dataset.id);
      });
    });
  }

  // ================= XỬ LÝ ĐẨY FILE EXCEL / CSV LÊN KHO TỒN =================
  async handleExcelUpload(file) {
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const XLSX = window.XLSX;
          if (!XLSX) {
            alert('Thư viện đọc Excel chưa sẵn sàng!');
            return;
          }
          const wb = XLSX.read(data, { type: 'array' });
          const firstSheetName = wb.SheetNames[0];
          const ws = wb.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

          const parsedProducts = parseStockArray2D(rows, this.currentWarehouse, this._cachedWarehouses);
          if (parsedProducts.length === 0) {
            alert('Không tìm thấy dữ liệu mặt hàng hợp lệ trong file Excel/CSV!');
            return;
          }

          const targetWh = this._resolveWarehouse(this.currentWarehouse, this._cachedWarehouses);
          const confirmed = confirm(
            `📊 PHÁT HIỆN ${parsedProducts.length} MẶT HÀNG TRONG FILE:\n"${file.name}"\n\n` +
            `Bạn có muốn GỘP THÊM toàn bộ danh sách này vào hệ thống (${targetWh ? targetWh.name : 'Kho hàng'}) không?\n` +
            `(Hệ thống sẽ tự nhận diện tên, kho, chủng loại, giá nhập, giá bán, số lượng và nhà cung cấp)`
          );

          if (confirmed) {
            const existingProducts = await db.getAll('products');
            const { added, merged, recordsToSave } = mergeImportedProductsByName(existingProducts, parsedProducts);
            for (const rec of recordsToSave) {
              await db.put('products', rec);
            }
            alert(`🎉 Đã xử lý ${parsedProducts.length} dòng: thêm mới ${added} mặt hàng, cộng thêm số lượng cho ${merged} mặt hàng trùng tên!`);
            await this.render();
          }
        } catch (err) {
          alert('Lỗi phân tích file Excel: ' + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      alert('Lỗi đọc file: ' + err.message);
    }
  }

  // ================= NẠP NHANH 69 MẶT HÀNG TỪ FILE MẪU =================
  async loadSampleStockProducts() {
    if (confirm(`Bạn có muốn nạp nhanh 69 mặt hàng phụ kiện diều, nan, pass, sáo, dây từ file mẫu bạn gửi vào KHO TỒN không?`)) {
      let count = 1;
      for (const item of SAMPLE_STOCK_INVENTORY) {
        const p = {
          id: 'SP-STOCK-SAMPLE-' + Date.now() + '-' + (count++),
          code: 'TON-' + String(count).padStart(3, '0'),
          name: item.name,
          warehouse: 'stock',
          category: detectCategory(item.name),
          unit: detectUnit(item.name),
          size: '',
          color: '',
          stock: item.stock || 0,
          costPrice: item.costPrice || 0,
          sellingPrice: item.sellingPrice || 0,
          lowStockThreshold: 3,
          supplier: item.supplier || '',
          importDate: item.importDate || '',
          photo: '',
          notes: item.supplier ? `Nguồn: ${item.supplier}` : 'Hàng nhập kho tồn'
        };
        await db.put('products', p);
      }
      alert('🎉 Đã nạp thành công 69 mặt hàng vào Kho Tồn!');
      this.currentWarehouse = 'stock';
      await this.render();
    }
  }

  async showProductModal(productId = null) {
    let product = null;
    let isEdit = false;
    const loadedWarehouses = await db.getWarehouses();
    const warehouses = (Array.isArray(loadedWarehouses) && loadedWarehouses.length > 0)
      ? loadedWarehouses
      : [...DEFAULT_WAREHOUSES];
    this._cachedWarehouses = warehouses;

    if (productId) {
      product = await db.getById('products', productId);
      isEdit = !!product;
    }

    const selectedWarehouseId = normalizeWarehouseId(product?.warehouse || this.currentWarehouse, warehouses);
    const categories = await db.getCategories(selectedWarehouseId);
    const units = await db.getUnits();

    if (!product) {
      const count = (await db.getAll('products', true)).length + 1;
      const code = 'DIEU-' + String(count).padStart(3, '0');
      product = {
        id: 'SP-' + Date.now(),
        code,
        name: '',
        warehouse: selectedWarehouseId,
        category: categories[0] || 'Chủng loại 1',
        size: '',
        color: '',
        unit: units[0] || 'Chiếc',
        costPrice: 0,
        sellingPrice: 0,
        stock: 10,
        lowStockThreshold: 5,
        supplier: '',
        photo: '',
        notes: ''
      };
    }
    let photoBase64 = product.photo || '';

    const modalHtml = `
      <div class="modal-backdrop" id="product-modal">
        <div class="modal-content modal-lg">
          <div class="modal-header">
            <h2 class="modal-title">${isEdit ? '✏️ Chỉnh Sửa Mặt Hàng' : '➕ Thêm mới'}</h2>
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
                    <span style="font-size: 28px;">📷</span>
                    <span class="text-xs">Chạm để tải ảnh diều (tự động nén gọn)</span>
                  </div>
                `}
              </div>
              <input type="file" id="photo-input" accept="image/*" style="display:none">
            </div>

            <!-- Tên & Mã -->
            <div class="form-row">
              <div class="form-group flex-2">
                <label class="form-label required">Tên diều / Phụ kiện</label>
                <input type="text" id="p-name" class="form-input" required placeholder="VD: Diều Sáo Cánh Bầu 2.5m" value="${escapeHTML(product.name)}">
              </div>
              <div class="form-group flex-1">
                <label class="form-label">Mã</label>
                <input type="text" id="p-code" class="form-input" placeholder="Tự sinh" value="${escapeHTML(product.code)}">
              </div>
            </div>

            <!-- Phân loại Kho hàng & Nguồn nhập -->
            <div class="form-row">
              <div class="form-group flex-1">
                <label class="form-label required">Kho lưu trữ</label>
                <select id="p-warehouse" class="form-select">
                  ${warehouses.map(w => `
                    <option value="${escapeHTML(w.id)}" ${selectedWarehouseId === w.id ? 'selected' : ''}>${w.icon || '📦'} ${escapeHTML(w.name)}</option>
                  `).join('')}
                </select>
              </div>
              <div class="form-group flex-1">
                <label class="form-label">Nguồn nhập / NCC</label>
                <input type="text" id="p-supplier" class="form-input" placeholder="VD: Mai Ngọc, Huân nguyễn..." value="${escapeHTML(product.supplier || '')}">
              </div>
            </div>

            <!-- Nhóm & ĐVT -->
            <div class="form-row">
              <div class="form-group flex-2">
                <label class="form-label">Chủng loại</label>
                <select id="p-category" class="form-select">
                  ${(product.category && !categories.includes(product.category) ? [product.category, ...categories] : categories).map(c => `
                    <option value="${escapeHTML(c)}" ${product.category === c ? 'selected' : ''}>${escapeHTML(c)}</option>
                  `).join('')}
                </select>
              </div>
              <div class="form-group flex-1">
                <label class="form-label">Đơn vị</label>
                <select id="p-unit" class="form-select">
                  ${units.map(u => `
                    <option value="${escapeHTML(u)}" ${product.unit === u ? 'selected' : ''}>${escapeHTML(u)}</option>
                  `).join('')}
                </select>
              </div>
            </div>

            <!-- Kích thước & Màu -->
            <div class="form-row">
              <div class="form-group flex-1">
                <label class="form-label">Kích thước</label>
                <input type="text" id="p-size" class="form-input" placeholder="VD: 2.5m, đuôi 5m" value="${escapeHTML(product.size || '')}">
              </div>
              <div class="form-group flex-1">
                <label class="form-label">Màu sắc</label>
                <input type="text" id="p-color" class="form-input" placeholder="VD: Đỏ vàng, Xanh ngọc" value="${escapeHTML(product.color || '')}">
              </div>
            </div>

            <!-- Giá bán & Giá nhập -->
            <div class="form-row card p-2 bg-light mb-3">
              <div class="form-group flex-1 mb-0">
                <label class="form-label required text-primary">Giá bán (VNĐ)</label>
                <input type="text" id="p-selling-price" class="form-input form-input-lg text-primary text-bold" required value="${product.sellingPrice ? formatVND(product.sellingPrice) : ''}" placeholder="0 ₫">
              </div>
              <div class="form-group flex-1 mb-0">
                <label class="form-label text-muted">Giá vốn nhập (VNĐ)</label>
                <input type="text" id="p-cost-price" class="form-input form-input-lg text-muted" value="${product.costPrice ? formatVND(product.costPrice) : ''}" placeholder="0 ₫">
              </div>
            </div>

            <!-- Tồn kho & Mức báo động -->
            <div class="form-row">
              <div class="form-group flex-1">
                <label class="form-label required">Tồn kho hiện tại</label>
                <input type="number" id="p-stock" class="form-input" required min="0" step="1" value="${product.stock !== undefined ? product.stock : 10}">
              </div>
              <div class="form-group flex-1">
                <label class="form-label">Báo động khi dưới</label>
                <input type="number" id="p-low-stock" class="form-input" min="0" step="1" value="${product.lowStockThreshold || 5}">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Ghi chú sản phẩm</label>
              <textarea id="p-notes" class="form-textarea" rows="2" placeholder="Chất liệu nan carbon, vải dù, pas khóa sáo...">${escapeHTML(product.notes || '')}</textarea>
            </div>

            <div class="modal-footer" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px;">
              ${isEdit ? `
                <button type="button" class="btn btn-outline-danger btn-sm" id="btn-soft-delete-product" style="margin-right: auto;">Xóa vào Thùng rác</button>
              ` : ''}
              <button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-modal">Hủy</button>
              <button type="submit" class="btn btn-primary btn-sm" id="btn-save-product">Lưu Diều</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const oldModal = document.getElementById('product-modal');
    if (oldModal) oldModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);

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
                <span style="font-size:28px;">📷</span>
                <span class="text-xs">Chạm để tải ảnh diều</span>
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
            <span style="font-size:28px;">📷</span>
            <span class="text-xs">Chạm để tải ảnh diều</span>
          </div>
        `;
      });
    }

    const sellingPriceInput = document.getElementById('p-selling-price');
    const costPriceInput = document.getElementById('p-cost-price');

    const formatInputPrice = (input) => {
      const val = parseVND(input.value);
      input.value = val > 0 ? formatVND(val) : '';
    };

    sellingPriceInput.addEventListener('blur', () => formatInputPrice(sellingPriceInput));
    costPriceInput.addEventListener('blur', () => formatInputPrice(costPriceInput));

    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (confirm(`Bạn có chắc muốn chuyển "${product.name}" vào Thùng rác không?\n(Bạn luôn có thể khôi phục lại trong Cài đặt > Thùng rác)`)) {
          await db.softDelete('products', product.id);
          closeModal();
          if (this.app.currentView === 'settings') {
            this.app.settingsModule.render();
          } else {
            this.render();
          }
        }
      });
    }

    // Khi đổi kho trong modal: tự động nạp lại danh sách chủng loại tương ứng của kho đó
    const warehouseSelect = document.getElementById('p-warehouse');
    const categorySelect = document.getElementById('p-category');

    if (warehouseSelect && categorySelect) {
      warehouseSelect.addEventListener('change', async (e) => {
        const newWarehouseId = e.target.value;
        try {
          const newCategories = await db.getCategories(newWarehouseId);
          const currentCatVal = categorySelect.value;
          categorySelect.innerHTML = newCategories.map(c => `
            <option value="${escapeHTML(c)}" ${c === currentCatVal ? 'selected' : ''}>${escapeHTML(c)}</option>
          `).join('');
          if (!newCategories.includes(currentCatVal) && newCategories.length > 0) {
            categorySelect.value = newCategories[0];
          }
        } catch (err) {
          console.error('Lỗi nạp chủng loại theo kho:', err);
        }
      });
    }

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
        warehouse: document.getElementById('p-warehouse').value,
        category: document.getElementById('p-category').value,
        unit: document.getElementById('p-unit').value,
        size: document.getElementById('p-size').value.trim(),
        color: document.getElementById('p-color').value.trim(),
        supplier: document.getElementById('p-supplier').value.trim(),
        sellingPrice,
        costPrice,
        stock,
        lowStockThreshold: lowStock,
        photo: photoBase64,
        notes: document.getElementById('p-notes').value.trim()
      };

      await db.put('products', updated);
      closeModal();
      if (this.app.currentView === 'settings') {
        this.app.settingsModule.render();
      } else {
        this.render();
      }
    });
  }

  async showMoveWarehouseModal(product) {
    if (!product) return;
    const loadedWarehouses = await db.getWarehouses();
    const warehouses = (Array.isArray(loadedWarehouses) && loadedWarehouses.length > 0)
      ? loadedWarehouses
      : [...DEFAULT_WAREHOUSES];
    this._cachedWarehouses = warehouses;

    const currentWh = this._resolveWarehouse(product.warehouse, warehouses);

    const modalHtml = `
      <div class="modal-backdrop" id="move-warehouse-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">🔄 Chuyển Kho Sản Phẩm</h2>
            <button type="button" class="modal-close" id="btn-close-move-wh">&times;</button>
          </div>

          <div class="modal-body">
            <div class="move-wh-product-summary mb-3">
              <div class="text-bold" style="font-size: 14px;">${escapeHTML(product.name)}</div>
              <div class="text-xs text-muted mt-1">
                Mã: ${escapeHTML(product.code || '---')} • Kho hiện tại:
                <span class="badge badge-primary">${currentWh.icon || '📦'} ${escapeHTML(currentWh.name)}</span>
              </div>
            </div>

            <p class="text-sm text-muted mb-2">Chọn kho muốn chuyển đến (chạm 1 lần):</p>

            <div class="move-warehouse-grid">
              ${warehouses.map(w => {
                const isCurrent = w.id === currentWh.id;
                return `
                  <button type="button"
                    class="move-wh-option ${isCurrent ? 'is-current' : ''}"
                    data-target-wh="${escapeHTML(w.id)}"
                    ${isCurrent ? 'disabled' : ''}>
                    <span class="move-wh-icon">${w.icon || '📦'}</span>
                    <span class="move-wh-info">
                      <span class="move-wh-name">${escapeHTML(w.name)}</span>
                      ${isCurrent ? '<span class="move-wh-tag">Đang ở đây</span>' : '<span class="move-wh-tag">Chuyển tới</span>'}
                    </span>
                  </button>
                `;
              }).join('')}
            </div>

            <div class="modal-footer" style="display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px;">
              <button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-move-wh">Đóng</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const oldModal = document.getElementById('move-warehouse-modal');
    if (oldModal) oldModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modalEl = document.getElementById('move-warehouse-modal');
    const close = () => modalEl.remove();

    document.getElementById('btn-close-move-wh').addEventListener('click', close);
    document.getElementById('btn-cancel-move-wh').addEventListener('click', close);
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) close();
    });

    modalEl.querySelectorAll('.move-wh-option:not([disabled])').forEach(btn => {
      btn.addEventListener('click', async () => {
        const targetId = btn.dataset.targetWh;
        if (!targetId || targetId === currentWh.id) return;
        const targetWh = warehouses.find(w => w.id === targetId);
        product.warehouse = targetId;
        await db.put('products', product);
        close();
        alert(`✅ Đã chuyển "${product.name}" sang ${targetWh ? `${targetWh.icon || '📦'} ${targetWh.name}` : targetId}!`);
        await this.render();
      });
    });
  }

  showCreateWarehouseModal() {
    const icons = ['📦', '🪁', '👕', '🎋', '🔩', '📏', '🎡', '🧵', '🎶', '🧰', '🏷️', '✨'];
    let selectedIcon = icons[0];

    const modalHtml = `
      <div class="modal-backdrop" id="create-warehouse-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">➕ Tạo Kho Hàng Mới</h2>
            <button type="button" class="modal-close" id="btn-close-create-wh">&times;</button>
          </div>

          <form id="create-warehouse-form" class="modal-body">
            <div class="form-group">
              <label class="form-label required" for="cw-name">Tên kho mới</label>
              <input type="text" id="cw-name" class="form-input" required maxlength="60" placeholder="VD: Kho Đuôi Diều, Kho Phụ Kiện VIP...">
            </div>

            <div class="form-group">
              <label class="form-label">Chọn biểu tượng (Icon)</label>
              <div class="wh-icon-picker" id="cw-icon-picker">
                ${icons.map((ic, idx) => `
                  <button type="button" class="wh-icon-chip ${idx === 0 ? 'active' : ''}" data-icon="${ic}" title="Chọn biểu tượng ${ic}">
                    ${ic}
                  </button>
                `).join('')}
              </div>
            </div>

            <div class="modal-footer" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px;">
              <button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-create-wh">Hủy</button>
              <button type="submit" class="btn btn-primary btn-sm" id="btn-submit-create-wh">➕ Tạo Kho Ngay</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const oldModal = document.getElementById('create-warehouse-modal');
    if (oldModal) oldModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modalEl = document.getElementById('create-warehouse-modal');
    const nameInput = document.getElementById('cw-name');
    const form = document.getElementById('create-warehouse-form');
    const close = () => modalEl.remove();

    document.getElementById('btn-close-create-wh').addEventListener('click', close);
    document.getElementById('btn-cancel-create-wh').addEventListener('click', close);
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) close();
    });

    modalEl.querySelectorAll('.wh-icon-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        selectedIcon = chip.dataset.icon || '📦';
        modalEl.querySelectorAll('.wh-icon-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = nameInput.value.trim();
      if (!name) {
        alert('Vui lòng nhập tên kho mới!');
        nameInput.focus();
        return;
      }
      try {
        const created = await db.addWarehouse(name, selectedIcon);
        this.currentWarehouse = created.id;
        close();
        await this.render();
      } catch (err) {
        alert(err.message || 'Không thể tạo kho mới!');
      }
    });

    setTimeout(() => nameInput.focus(), 50);
  }
}
