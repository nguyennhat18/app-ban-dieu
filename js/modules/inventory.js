// Quản lý Kho Hàng (Phiếu Nhập Hàng, Kiểm Kê/Điều Chỉnh Tồn Kho, Lịch Sử Kho)
import { db } from '../db.js';
import { formatVND, parseVND, formatDateTime, generateId, escapeHTML } from '../utils.js';

export class InventoryModule {
  constructor(app) {
    this.app = app;
    this.activeTab = 'history'; // 'history' | 'import' | 'adjust'
    this.historyFilterType = 'all';
    this.historySearchQuery = '';
  }

  async render() {
    const container = document.getElementById('view-container');

    container.innerHTML = `
      <div class="view-header">
        <div class="header-title-row">
          <div>
            <h1 class="view-title">📦 Quản Lý Kho & Nhập Hàng</h1>
            <p class="view-subtitle">Nhập hàng, kiểm kho, truy vết lịch sử biến động kho</p>
          </div>
          <div class="header-tab-switch">
            <button class="tab-switch-btn ${this.activeTab === 'history' ? 'active' : ''}" id="tab-btn-inv-history">📜 Lịch Sử Kho</button>
            <button class="tab-switch-btn ${this.activeTab === 'import' ? 'active' : ''}" id="tab-btn-inv-import">📥 Nhập Hàng</button>
            <button class="tab-switch-btn ${this.activeTab === 'adjust' ? 'active' : ''}" id="tab-btn-inv-adjust">⚖️ Kiểm/Cân Kho</button>
          </div>
        </div>
      </div>

      <div id="inv-tab-content">
        ${this.activeTab === 'history' ? await this.renderHistoryView() :
          this.activeTab === 'import' ? await this.renderImportView() :
          await this.renderAdjustView()}
      </div>
    `;

    this.bindEvents();
  }

  // ================= TAB 1: LỊCH SỬ KHO (AUDIT TRAIL) =================
  async renderHistoryView() {
    const logs = await db.getAll('inventory_logs');
    logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    this._cachedInvLogs = logs;

    const filtered = logs.filter(l => {
      const matchType = this.historyFilterType === 'all' || l.changeType === this.historyFilterType;
      const q = this.historySearchQuery.toLowerCase().trim();
      const matchQ = !q ||
        (l.productName && l.productName.toLowerCase().includes(q)) ||
        (l.productCode && l.productCode.toLowerCase().includes(q)) ||
        (l.reason && l.reason.toLowerCase().includes(q)) ||
        (l.referenceId && l.referenceId.toLowerCase().includes(q));
      return matchType && matchQ;
    });

    return `
      <div class="inventory-history-panel">
        <div class="search-filter-bar">
          <div class="search-input-wrap">
            <input type="text" id="inv-history-search" class="form-input" placeholder="🔍 Tìm theo diều, mã đơn, lý do..." value="${escapeHTML(this.historySearchQuery)}">
            <button id="btn-clear-inv-search" class="clear-search-btn" style="display:${this.historySearchQuery ? 'flex' : 'none'}">&times;</button>
          </div>
          <div class="category-tabs-scroll">
            <button class="cat-pill ${this.historyFilterType === 'all' ? 'active' : ''}" data-type="all">Tất cả (${logs.length})</button>
            <button class="cat-pill ${this.historyFilterType === 'sale' ? 'active' : ''}" data-type="sale">Bán hàng</button>
            <button class="cat-pill ${this.historyFilterType === 'import' ? 'active' : ''}" data-type="import">Nhập kho</button>
            <button class="cat-pill ${this.historyFilterType === 'cancel_order' ? 'active' : ''}" data-type="cancel_order">Hoàn kho (Hủy đơn)</button>
            <button class="cat-pill ${this.historyFilterType === 'adjustment' ? 'active' : ''}" data-type="adjustment">Điều chỉnh / Kiểm kê</button>
          </div>
        </div>

        <div class="inv-log-list" id="inv-log-list-container">
          ${this._renderInvLogsHtml(filtered)}
        </div>
      </div>
    `;
  }

  _renderInvLogsHtml(filtered) {
    if (filtered.length === 0) {
      return `
        <div class="empty-state">
          <p class="empty-icon">📜</p>
          <p class="empty-title">Chưa có lịch sử biến động kho nào</p>
        </div>
      `;
    }

    return filtered.map(log => {
      const isPlus = log.quantityChange > 0;
      const typeLabel =
        log.changeType === 'sale' ? 'Bán hàng' :
        log.changeType === 'import' ? 'Nhập kho' :
        log.changeType === 'cancel_order' ? 'Hủy đơn hoàn kho' : 'Điều chỉnh';
      const typeBadgeClass =
        log.changeType === 'sale' ? 'badge-primary' :
        log.changeType === 'import' ? 'badge-success' :
        log.changeType === 'cancel_order' ? 'badge-warning' : 'badge-neutral';

      return `
        <div class="inv-log-card">
          <div class="inv-log-top">
            <div>
              <span class="badge ${typeBadgeClass}">${typeLabel}</span>
              <span class="text-bold ml-2">${escapeHTML(log.productName)}</span>
              ${log.productCode ? `<span class="text-muted text-xs">(${escapeHTML(log.productCode)})</span>` : ''}
            </div>
            <div class="inv-qty-change ${isPlus ? 'text-success' : 'text-danger'} text-bold">
              ${isPlus ? '+' : ''}${log.quantityChange}
            </div>
          </div>

          <div class="inv-log-mid">
            <span class="inv-reason-text">${escapeHTML(log.reason || 'Biến động kho')}</span>
          </div>

          <div class="inv-log-bottom">
            <span class="text-muted text-xs">Tồn trước: <b>${log.stockBefore}</b> ➔ Sau: <b>${log.stockAfter}</b></span>
            <span class="text-muted text-xs">${formatDateTime(log.createdAt)}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // ================= TAB 2: NHẬP HÀNG (TĂNG TỒN, CẬP NHẬT GIÁ NHẬP) =================
  async renderImportView() {
    const products = await db.getAll('products');
    const imports = await db.getAll('stock_imports');
    imports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return `
      <div class="inventory-import-panel">
        <div class="action-top-bar mb-3">
          <button id="btn-create-import-sheet" class="btn btn-primary btn-block">
            <span>➕ Tạo Phiếu Nhập Hàng Mới</span>
          </button>
        </div>

        <h3 class="section-divider-title">📋 Danh Sách Phiếu Nhập Hàng (${imports.length})</h3>
        <div class="import-sheet-list">
          ${imports.length === 0 ? `
            <div class="empty-state">
              <p class="empty-icon">📥</p>
              <p class="empty-title">Chưa có phiếu nhập hàng nào</p>
              <p class="empty-desc">Bấm nút trên để ghi nhận lô hàng diều mới về kho.</p>
            </div>
          ` : imports.map(imp => `
            <div class="import-card" data-id="${imp.id}">
              <div class="import-card-header">
                <div>
                  <span class="import-id text-bold">${escapeHTML(imp.id)}</span>
                  <span class="text-muted text-xs ml-2">${formatDateTime(imp.createdAt)}</span>
                </div>
                <div class="text-success text-bold">${formatVND(imp.totalAmount)}</div>
              </div>

              <div class="import-card-body">
                <div class="text-sm"><b>Nhà cung cấp / Nguồn:</b> ${escapeHTML(imp.supplierName || 'Xưởng diều')}</div>
                <div class="import-items-summary text-muted text-xs mt-1">
                  ${(imp.items || []).map(i => `${escapeHTML(i.productName)} (x${i.quantity} @ ${formatVND(i.costPrice)})`).join(', ')}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ================= TAB 3: KIỂM KHO / ĐIỀU CHỈNH TỒN KHO =================
  async renderAdjustView() {
    const products = await db.getAll('products');
    products.sort((a, b) => a.name.localeCompare(b.name, 'vi'));

    return `
      <div class="inventory-adjust-panel">
        <div class="card mb-3 p-3">
          <h3 class="card-title">⚖️ Điều Chỉnh Tồn Kho / Kiểm Kê</h3>
          <p class="text-muted text-xs mb-3">Dùng khi đếm thực tế lệch với máy, diều bị rách/hỏng nan hoặc bù trừ tồn.</p>

          <form id="form-adjust-stock">
            <div class="form-group">
              <label class="form-label required">Chọn sản phẩm (diều/phụ kiện)</label>
              <select id="adj-product" class="form-select" required>
                <option value="">-- Chọn diều cần điều chỉnh --</option>
                ${products.map(p => `
                  <option value="${p.id}" data-stock="${p.stock}">
                    ${escapeHTML(p.name)} (Hiện tồn: ${p.stock} ${escapeHTML(p.unit || 'cái')})
                  </option>
                `).join('')}
              </select>
            </div>

            <div class="form-row">
              <div class="form-group flex-1">
                <label class="form-label text-bold text-muted">📊 TỒN HIỆN TẠI (MÁY):</label>
                <input type="number" id="adj-current-stock" class="form-input form-input-lg text-center text-bold bg-light" readonly value="0">
              </div>
              <div class="form-group flex-1">
                <label class="form-label required text-bold text-primary">📦 TỒN THỰC TẾ MỚI:</label>
                <input type="number" id="adj-new-stock" class="form-input form-input-lg text-bold text-primary text-center" required min="0" step="1" value="0">
              </div>
            </div>
            <div id="adj-diff-hint" class="text-xs text-muted mb-3" style="text-align: right;">Độ lệch tồn: <b>0</b></div>

            <div class="form-group">
              <label class="form-label required">Lý do điều chỉnh (bắt buộc để truy vết)</label>
              <input type="text" id="adj-reason" class="form-input" required placeholder="VD: Rách vải khi thả thử, gãy nan carbon, kiểm kho cuối tháng...">
            </div>

            <button type="submit" class="btn btn-warning btn-block btn-lg mt-3">
              <span>Xác Nhận Cân Tồn Kho</span>
            </button>
          </form>
        </div>
      </div>
    `;
  }

  bindEvents() {
    // Chuyển Tab
    const tabHistory = document.getElementById('tab-btn-inv-history');
    const tabImport = document.getElementById('tab-btn-inv-import');
    const tabAdjust = document.getElementById('tab-btn-inv-adjust');

    if (tabHistory) tabHistory.addEventListener('click', () => { this.activeTab = 'history'; this.render(); });
    if (tabImport) tabImport.addEventListener('click', () => { this.activeTab = 'import'; this.render(); });
    if (tabAdjust) tabAdjust.addEventListener('click', () => { this.activeTab = 'adjust'; this.render(); });

    // Events Tab 1: Lịch sử kho
    const updateInvLogsOnly = () => {
      const clearBtn = document.getElementById('btn-clear-inv-search');
      if (clearBtn) clearBtn.style.display = this.historySearchQuery ? 'flex' : 'none';
      const listEl = document.getElementById('inv-log-list-container');
      if (!listEl) return;
      const logs = this._cachedInvLogs || [];
      const q = this.historySearchQuery.toLowerCase().trim();
      const filtered = logs.filter(l => {
        const matchType = this.historyFilterType === 'all' || l.changeType === this.historyFilterType;
        const matchQ = !q ||
          (l.productName && l.productName.toLowerCase().includes(q)) ||
          (l.productCode && l.productCode.toLowerCase().includes(q)) ||
          (l.reason && l.reason.toLowerCase().includes(q)) ||
          (l.referenceId && l.referenceId.toLowerCase().includes(q));
        return matchType && matchQ;
      });
      listEl.innerHTML = this._renderInvLogsHtml(filtered);
    };

    const searchInp = document.getElementById('inv-history-search');
    if (searchInp) {
      searchInp.addEventListener('input', (e) => {
        this.historySearchQuery = e.target.value;
        updateInvLogsOnly();
      });
    }
    const clearSearch = document.getElementById('btn-clear-inv-search');
    if (clearSearch) {
      clearSearch.addEventListener('click', () => {
        this.historySearchQuery = '';
        if (searchInp) searchInp.value = '';
        updateInvLogsOnly();
        if (searchInp) searchInp.focus();
      });
    }

    document.querySelectorAll('.inventory-history-panel .cat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        this.historyFilterType = btn.dataset.type;
        this.render();
      });
    });

    // Events Tab 2: Nhập hàng
    const createImportBtn = document.getElementById('btn-create-import-sheet');
    if (createImportBtn) {
      createImportBtn.addEventListener('click', () => this.showImportModal());
    }

    // Events Tab 3: Cân kho
    const selectProduct = document.getElementById('adj-product');
    const currentStockInp = document.getElementById('adj-current-stock');
    const newStockInp = document.getElementById('adj-new-stock');
    if (selectProduct) {
      const updateDiff = () => {
        const cur = parseInt(currentStockInp.value, 10) || 0;
        const nxt = parseInt(newStockInp.value, 10) || 0;
        const diff = nxt - cur;
        const diffEl = document.getElementById('adj-diff-hint');
        if (diffEl) {
          if (diff > 0) diffEl.innerHTML = `<span class="text-success text-bold">📈 Tăng thêm +${diff} sản phẩm vào kho</span>`;
          else if (diff < 0) diffEl.innerHTML = `<span class="text-danger text-bold">📉 Giảm bớt ${diff} sản phẩm khỏi kho</span>`;
          else diffEl.innerHTML = `<span>Tồn kho không thay đổi</span>`;
        }
      };

      selectProduct.addEventListener('change', () => {
        const selected = selectProduct.options[selectProduct.selectedIndex];
        const stock = parseInt(selected.dataset.stock, 10) || 0;
        currentStockInp.value = stock;
        newStockInp.value = stock;
        updateDiff();
      });

      if (newStockInp) {
        newStockInp.addEventListener('input', updateDiff);
      }
    }

    const adjustForm = document.getElementById('form-adjust-stock');
    if (adjustForm) {
      adjustForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pId = selectProduct.value;
        if (!pId) {
          alert('Vui lòng chọn sản phẩm cần điều chỉnh');
          return;
        }

        const newStock = parseInt(newStockInp.value, 10);
        if (isNaN(newStock) || newStock < 0) {
          alert('Số lượng tồn mới không hợp lệ');
          return;
        }

        const reason = document.getElementById('adj-reason').value.trim();
        if (!reason) {
          alert('Vui lòng nhập lý do điều chỉnh để lưu lịch sử kho');
          return;
        }

        await this.handleAdjustStock(pId, newStock, reason);
      });
    }
  }

  // ================= XỬ LÝ ĐIỀU CHỈNH KHO (TRANSACTION) =================
  async handleAdjustStock(productId, newStock, reason) {
    const now = new Date().toISOString();
    try {
      await db.runTransaction(
        ['products', 'inventory_logs'],
        'readwrite',
        (tx) => {
          const productStore = tx.objectStore('products');
          const logStore = tx.objectStore('inventory_logs');

          const req = productStore.get(productId);
          req.onsuccess = () => {
            const product = req.result;
            if (!product) return;

            const stockBefore = product.stock || 0;
            const diff = newStock - stockBefore;
            if (diff === 0) {
              alert('Số lượng tồn thực tế không thay đổi');
              return;
            }

            product.stock = newStock;
            product.updatedAt = now;
            productStore.put(product);

            // Ghi nhận biến động
            logStore.put({
              id: 'LOG-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
              productId: product.id,
              productCode: product.code || '',
              productName: product.name,
              changeType: 'adjustment',
              quantityChange: diff,
              stockBefore,
              stockAfter: newStock,
              referenceId: null,
              reason: `Điều chỉnh kiểm kho: ${reason}`,
              createdAt: now
            });
          };
        }
      );

      alert('Đã điều chỉnh và cập nhật tồn kho thành công!');
      this.activeTab = 'history';
      this.render();
    } catch (err) {
      alert('Lỗi điều chỉnh tồn kho: ' + err.message);
    }
  }

  // ================= MODAL TẠO PHIẾU NHẬP HÀNG =================
  async showImportModal() {
    const products = await db.getAll('products');
    const importItems = [];

    const modalHtml = `
      <div class="modal-backdrop" id="import-sheet-modal">
        <div class="modal-content modal-lg">
          <div class="modal-header">
            <h2 class="modal-title">📥 Tạo Phiếu Nhập Hàng Mới</h2>
            <button class="modal-close" id="btn-close-imp-modal">&times;</button>
          </div>

          <div class="modal-body">
            <div class="form-group mb-3">
              <label class="form-label text-bold">🏢 Nhà cung cấp / Nguồn nhập hàng</label>
              <input type="text" id="imp-supplier" class="form-input" placeholder="VD: Xưởng may diều Nam Định, Mai Ngọc, Huân nguyễn..." value="Xưởng diều">
            </div>

            <!-- Thêm sản phẩm vào phiếu nhập -->
            <div class="add-to-import-box card p-3 mb-3 bg-light" style="border: 1.5px solid #cbd5e1; border-radius: 12px;">
              <h3 class="text-bold text-sm mb-2" style="color: #0369a1; display: flex; align-items: center; gap: 6px;">
                📦 Chọn Mặt Hàng Nhập Về Kho
              </h3>

              <div class="form-group mb-2">
                <label class="form-label required text-bold">1. Tên diều / Phụ kiện cần nhập:</label>
                <select id="imp-select-prod" class="form-select" style="font-weight: 600;">
                  <option value="">-- Bấm để chọn diều / phụ kiện --</option>
                  ${products.map(p => `
                    <option value="${p.id}" data-cost="${p.costPrice || 0}" data-unit="${escapeHTML(p.unit || 'chiếc')}">
                      ${escapeHTML(p.name)} (Giá nhập cũ: ${formatVND(p.costPrice || 0)})
                    </option>
                  `).join('')}
                </select>
              </div>

              <div class="form-row">
                <div class="form-group flex-1 mb-2">
                  <label class="form-label required text-bold" style="color: #0f172a;">2. SỐ LƯỢNG NHẬP:</label>
                  <div style="position: relative;">
                    <input type="number" id="imp-qty" class="form-input form-input-lg text-bold text-center" min="1" step="1" value="10" placeholder="Số lượng" style="font-size: 15px;">
                    <span id="imp-unit-hint" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-size: 12px; color: #64748b; font-weight: 600; pointer-events: none;">chiếc</span>
                  </div>
                </div>

                <div class="form-group flex-1 mb-2">
                  <label class="form-label required text-bold" style="color: #0f172a;">3. GIÁ NHẬP VỐN (VNĐ):</label>
                  <input type="text" id="imp-cost" class="form-input form-input-lg text-bold text-primary text-right" placeholder="0 ₫" style="font-size: 15px;">
                </div>
              </div>

              <button type="button" class="btn btn-primary btn-block btn-lg mt-2" id="btn-add-imp-item" style="font-weight: 700;">
                ➕ Thêm Món Này Vào Phiếu Nhập
              </button>
            </div>

            <!-- Bảng danh sách các món nhập -->
            <div class="table-responsive card p-2 mb-3" style="border: 1px solid var(--border);">
              <table class="table mb-0" id="table-imp-items">
                <thead>
                  <tr style="background: #f8fafc;">
                    <th>Sản phẩm</th>
                    <th class="text-center" style="width: 80px;">Số lượng</th>
                    <th class="text-right" style="width: 110px;">Giá nhập</th>
                    <th class="text-right" style="width: 120px;">Thành tiền</th>
                    <th class="text-center" style="width: 50px;">Xóa</th>
                  </tr>
                </thead>
                <tbody id="tbody-imp-items">
                  <tr><td colspan="5" class="text-center text-muted p-3">Chưa có sản phẩm nào trong phiếu nhập.</td></tr>
                </tbody>
              </table>
            </div>

            <div class="import-total-box mt-2 text-right">
              <span class="text-lg">Tổng tiền nhập hàng: </span>
              <span class="text-lg text-bold text-success" id="imp-total-amount">0 ₫</span>
            </div>

            <div class="form-group mt-3">
              <label class="form-label">Ghi chú phiếu nhập</label>
              <textarea id="imp-notes" class="form-textarea" rows="2" placeholder="Ghi chú số hóa đơn xưởng, số chuyến xe..."></textarea>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="btn-cancel-imp-modal">Hủy</button>
            <button type="button" class="btn btn-primary" id="btn-save-import-sheet">✓ Lưu Phiếu & Tăng Tồn Kho</button>
          </div>
        </div>
      </div>
    `;

    const old = document.getElementById('import-sheet-modal');
    if (old) old.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('import-sheet-modal');
    const close = () => modal.remove();
    document.getElementById('btn-close-imp-modal').addEventListener('click', close);
    document.getElementById('btn-cancel-imp-modal').addEventListener('click', close);

    const selectProd = document.getElementById('imp-select-prod');
    const qtyInp = document.getElementById('imp-qty');
    const costInp = document.getElementById('imp-cost');
    const unitHint = document.getElementById('imp-unit-hint');
    const tbody = document.getElementById('tbody-imp-items');
    const totalEl = document.getElementById('imp-total-amount');

    selectProd.addEventListener('change', () => {
      const opt = selectProd.options[selectProd.selectedIndex];
      if (opt && opt.value) {
        const cost = parseInt(opt.dataset.cost, 10) || 0;
        const unit = opt.dataset.unit || 'chiếc';
        if (unitHint) unitHint.textContent = unit;
        if (cost > 0) costInp.value = formatVND(cost);
      }
    });

    costInp.addEventListener('blur', () => {
      const val = parseVND(costInp.value);
      costInp.value = val > 0 ? formatVND(val) : '';
    });

    const updateTable = () => {
      if (importItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted p-3">Chưa có sản phẩm nào trong phiếu nhập.</td></tr>`;
        totalEl.textContent = '0 ₫';
        return;
      }

      let grandTotal = 0;
      tbody.innerHTML = importItems.map((item, idx) => {
        grandTotal += item.subtotal;
        return `
          <tr>
            <td>
              <b>${escapeHTML(item.productName)}</b>
              <div class="text-xs text-muted">Mã: ${escapeHTML(item.productCode || '---')}</div>
            </td>
            <td class="text-center"><b>${item.quantity}</b></td>
            <td class="text-right">${formatVND(item.costPrice)}</td>
            <td class="text-right text-bold text-success">${formatVND(item.subtotal)}</td>
            <td class="text-center">
              <button type="button" class="btn btn-outline-danger btn-xs btn-remove-imp-item" data-idx="${idx}" title="Xóa món này">🗑️</button>
            </td>
          </tr>
        `;
      }).join('');

      totalEl.textContent = formatVND(grandTotal);

      document.querySelectorAll('.btn-remove-imp-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.idx, 10);
          importItems.splice(idx, 1);
          updateTable();
        });
      });
    };

    document.getElementById('btn-add-imp-item').addEventListener('click', () => {
      const pId = selectProd.value;
      if (!pId) return alert('Vui lòng chọn sản phẩm cần nhập!');
      const p = products.find(x => x.id === pId);
      const qty = parseInt(qtyInp.value, 10) || 1;
      const cost = parseVND(costInp.value);

      if (qty <= 0) return alert('Số lượng nhập phải lớn hơn 0!');

      importItems.push({
        productId: p.id,
        productCode: p.code || '',
        productName: p.name,
        quantity: qty,
        costPrice: cost,
        subtotal: qty * cost
      });

      // Reset form chọn món để tiện thêm món tiếp theo
      selectProd.value = '';
      costInp.value = '';
      qtyInp.value = '10';
      if (unitHint) unitHint.textContent = 'chiếc';

      updateTable();
    });

    // Lưu phiếu nhập
    document.getElementById('btn-save-import-sheet').addEventListener('click', async () => {
      if (importItems.length === 0) {
        alert('Phiếu nhập chưa có sản phẩm nào!');
        return;
      }

      const supplier = document.getElementById('imp-supplier').value.trim() || 'Xưởng diều';
      const notes = document.getElementById('imp-notes').value.trim();
      const importId = generateId('PN');
      const now = new Date().toISOString();
      const totalAmount = importItems.reduce((s, i) => s + i.subtotal, 0);

      const importRecord = {
        id: importId,
        supplierName: supplier,
        items: importItems,
        totalAmount,
        notes,
        createdAt: now
      };

      try {
        await db.runTransaction(
          ['stock_imports', 'products', 'inventory_logs'],
          'readwrite',
          (tx) => {
            const impStore = tx.objectStore('stock_imports');
            const prodStore = tx.objectStore('products');
            const logStore = tx.objectStore('inventory_logs');

            impStore.put(importRecord);

            // Tăng tồn kho & Cập nhật giá nhập mới nhất cho từng món
            for (const item of importItems) {
              const req = prodStore.get(item.productId);
              req.onsuccess = () => {
                const product = req.result;
                if (product) {
                  const stockBefore = product.stock || 0;
                  const stockAfter = stockBefore + item.quantity;
                  product.stock = stockAfter;
                  if (item.costPrice > 0) {
                    product.costPrice = item.costPrice; // Cập nhật giá nhập gần nhất
                  }
                  product.updatedAt = now;
                  prodStore.put(product);

                  // Ghi log kho
                  logStore.put({
                    id: 'LOG-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
                    productId: product.id,
                    productCode: product.code || '',
                    productName: product.name,
                    changeType: 'import',
                    quantityChange: +item.quantity,
                    stockBefore,
                    stockAfter,
                    referenceId: importId,
                    reason: `Nhập kho phiếu ${importId} từ ${supplier}`,
                    createdAt: now
                  });
                }
              };
            }
          }
        );

        alert(`Đã lưu phiếu nhập ${importId} và tăng tồn kho thành công!`);
        close();
        this.render();
      } catch (err) {
        alert('Lỗi lưu phiếu nhập hàng: ' + err.message);
      }
    });
  }
}
