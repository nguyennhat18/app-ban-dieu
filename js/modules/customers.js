// Quản lý Khách Hàng, Công Nợ & Thu Nợ (Mobile First Unified)
import { db } from '../db.js';
import { formatVND, formatDate, formatDateTime, escapeHTML } from '../utils.js';

export class CustomerModule {
  constructor(app) {
    this.app = app;
    this.searchQuery = '';
    this.activeTab = 'list'; // 'list' | 'debts' | 'payments'
  }

  async render() {
    const container = document.getElementById('view-container');
    const customers = await db.getAll('customers');
    const orders = await db.getAll('orders');
    const debtPayments = await db.getAll('debt_payments');

    // Tính toán công nợ và tổng tiền mua của từng khách
    const customerStats = {};
    for (const c of customers) {
      customerStats[c.id] = {
        customer: c,
        totalOrders: 0,
        totalSpent: 0,
        totalDebt: 0
      };
    }

    for (const o of orders) {
      if (o.status !== 'cancelled' && o.customerId && customerStats[o.customerId]) {
        customerStats[o.customerId].totalOrders += 1;
        customerStats[o.customerId].totalSpent += (o.totalAmount || 0);
        customerStats[o.customerId].totalDebt += (o.debtAmount || 0);
      }
    }

    // Trừ đi số tiền khách đã trả nợ sau đó
    for (const p of debtPayments) {
      if (p.customerId && customerStats[p.customerId]) {
        customerStats[p.customerId].totalDebt -= (p.amount || 0);
      }
    }

    for (const id in customerStats) {
      if (customerStats[id].totalDebt < 0) customerStats[id].totalDebt = 0;
    }

    // Lọc khách còn nợ
    const debtors = Object.values(customerStats).filter(s => s.totalDebt > 0);
    const totalAllDebt = debtors.reduce((sum, s) => sum + s.totalDebt, 0);

    // Lọc theo tìm kiếm
    const q = this.searchQuery.toLowerCase().trim();
    const filteredCustomers = customers.filter(c => {
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        (c.address && c.address.toLowerCase().includes(q))
      );
    });

    const filteredDebtors = debtors.filter(d => {
      if (!q) return true;
      return (
        d.customer.name.toLowerCase().includes(q) ||
        (d.customer.phone && d.customer.phone.includes(q))
      );
    });

    // Lịch sử thu nợ sắp xếp mới nhất
    debtPayments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    this._cachedCustomersData = { customers, debtors, customerStats, debtPayments };

    container.innerHTML = `
      <div class="view-header">
        <div class="header-title-row" style="flex-wrap: wrap; gap: 10px;">
          <div style="min-width: 0; flex: 1 1 180px;">
            <h1 class="view-title">👥 Khách Hàng & Công Nợ</h1>
            <p class="view-subtitle">${customers.length} khách • ${debtors.length} khách nợ (<b class="text-danger">${formatVND(totalAllDebt)}</b>)</p>
          </div>
          <button id="btn-add-customer" class="btn btn-primary btn-sm" style="flex-shrink: 0; white-space: nowrap;">+ Thêm Khách</button>
        </div>

        <!-- 3 Tab chuyển đổi tiện lợi -->
        <div class="header-tab-switch mb-2" style="gap: 4px; margin-bottom: 8px;">
          <button class="tab-switch-btn ${this.activeTab === 'list' ? 'active' : ''}" id="tab-cust-list" style="flex: 1 0 auto;">👥 Danh Sách (${customers.length})</button>
          <button class="tab-switch-btn ${this.activeTab === 'debts' ? 'active' : ''}" id="tab-cust-debts" style="flex: 1 0 auto;">💵 Đang Nợ (${debtors.length})</button>
          <button class="tab-switch-btn ${this.activeTab === 'payments' ? 'active' : ''}" id="tab-cust-payments" style="flex: 1 0 auto;">📜 Lịch Sử Thu</button>
        </div>

        ${this.activeTab !== 'payments' ? `
          <div class="search-filter-bar">
            <div class="search-input-wrap">
              <input type="text" id="customer-search" class="form-input" placeholder="🔍 Tìm tên khách, số điện thoại..." value="${escapeHTML(this.searchQuery)}">
              <button id="btn-clear-customer-search" class="clear-search-btn" style="display:${this.searchQuery ? 'flex' : 'none'}">&times;</button>
            </div>
          </div>
        ` : ''}
      </div>

      <!-- NỘI DUNG THEO TAB -->
      <div id="customer-content">
        ${this._renderCustomerContentHtml(filteredCustomers, filteredDebtors, customerStats, debtPayments)}
      </div>
    `;

    this.bindEvents();
  }

  _renderCustomerContentHtml(filteredCustomers, filteredDebtors, customerStats, debtPayments) {
    if (this.activeTab === 'list') {
      return `
        <!-- TAB 1: DANH SÁCH KHÁCH HÀNG -->
        <div class="customer-list">
          ${filteredCustomers.length === 0 ? `
            <div class="empty-state">
              <p class="empty-icon">👥</p>
              <p class="empty-title">Không tìm thấy khách hàng nào</p>
              <p class="empty-desc">Bấm nút bên dưới để tạo khách hàng mới.</p>
              <button id="btn-add-customer-empty" class="btn btn-primary btn-sm">+ Thêm Khách Hàng</button>
            </div>
          ` : filteredCustomers.map(c => {
            const stats = customerStats[c.id] || { totalOrders: 0, totalSpent: 0, totalDebt: 0 };
            return `
              <div class="customer-card ${stats.totalDebt > 0 ? 'card-has-debt' : ''}" data-id="${c.id}">
                <div class="customer-card-header" style="gap: 8px;">
                  <div style="min-width: 0; flex: 1;">
                    <h3 class="customer-name text-bold">${escapeHTML(c.name)}</h3>
                    <div class="customer-meta text-xs text-muted mt-1" style="display: flex; flex-wrap: wrap; gap: 2px 8px; margin-top: 4px;">
                      ${c.phone ? `<a href="tel:${escapeHTML(c.phone)}" class="customer-phone" onclick="event.stopPropagation()" style="color:#0284c7; text-decoration:none;">📞 ${escapeHTML(c.phone)}</a>` : '<span>Chưa có SĐT</span>'}
                      ${c.address ? `<span class="customer-address ml-1">• 📍 ${escapeHTML(c.address)}</span>` : ''}
                    </div>
                  </div>
                  ${stats.totalDebt > 0 ? `
                    <span class="badge badge-danger text-bold" style="flex-shrink: 0; white-space: nowrap;">Nợ: ${formatVND(stats.totalDebt)}</span>
                  ` : `
                    <span class="badge badge-neutral" style="flex-shrink: 0; white-space: nowrap;">0 ₫ nợ</span>
                  `}
                </div>

                <div class="customer-card-body d-flex gap-3 text-xs text-muted mt-1" style="display:flex; flex-wrap:wrap; gap:6px 12px; margin-top: 4px;">
                  <div>Đã mua: <b>${stats.totalOrders} đơn</b></div>
                  <div>Tổng chi: <b>${formatVND(stats.totalSpent)}</b></div>
                </div>

                <div class="customer-card-footer" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px;">
                  <button class="btn btn-outline-primary btn-xs btn-view-history" style="white-space: nowrap;" data-id="${c.id}">📜 Lịch sử mua</button>
                  ${stats.totalDebt > 0 ? `
                    <button class="btn btn-danger btn-xs btn-collect-debt-fast" style="white-space: nowrap;" data-id="${c.id}" data-name="${escapeHTML(c.name)}" data-debt="${stats.totalDebt}">💵 Thu nợ</button>
                  ` : ''}
                  <button class="btn btn-secondary btn-xs btn-edit-customer" style="white-space: nowrap;" data-id="${c.id}">✏️ Sửa</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }
    if (this.activeTab === 'debts') {
      return `
        <!-- TAB 2: KHÁCH ĐANG NỢ TIỀN -->
        <div class="debtors-list">
          ${filteredDebtors.length === 0 ? `
            <div class="empty-state">
              <p class="empty-icon">🎉</p>
              <p class="empty-title">Tuyệt vời! Không có ai còn nợ</p>
              <p class="empty-desc">Tất cả khách hàng đã thanh toán đầy đủ tiền diều.</p>
            </div>
          ` : filteredDebtors.map(d => `
            <div class="debtor-card card p-3 mb-2" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
              <div style="min-width: 0; flex: 1 1 180px;">
                <h3 class="text-bold" style="font-size:15px;">${escapeHTML(d.customer.name)}</h3>
                <div class="text-xs text-muted mt-1" style="margin-top: 4px;">
                  ${d.customer.phone ? `📞 ${escapeHTML(d.customer.phone)}` : 'Chưa có SĐT'}
                </div>
                <div class="text-xs text-danger text-bold mt-1" style="margin-top: 4px;">
                  Còn nợ: ${formatVND(d.totalDebt)}
                </div>
              </div>
              <div style="flex-shrink: 0; margin-left: auto;">
                <button class="btn btn-danger btn-sm btn-collect-debt-fast" style="white-space: nowrap;" data-id="${d.customer.id}" data-name="${escapeHTML(d.customer.name)}" data-debt="${d.totalDebt}">
                  💵 Thu Tiền
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
    return `
      <!-- TAB 3: LỊCH SỬ CÁC LẦN THU TIỀN -->
      <div class="payments-list">
        ${debtPayments.length === 0 ? `
          <div class="empty-state">
            <p class="empty-icon">📜</p>
            <p class="empty-title">Chưa có lịch sử thu nợ nào</p>
          </div>
        ` : debtPayments.map(p => `
          <div class="card p-3 mb-2" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; padding:12px; margin-bottom:8px;">
            <div style="min-width: 0; flex: 1 1 180px;">
              <div class="text-bold">${escapeHTML(p.customerName)}</div>
              <div class="text-muted text-xs">${formatDateTime(p.createdAt)} • ${p.paymentMethod === 'transfer' ? 'Chuyển khoản' : 'Tiền mặt'}</div>
              ${p.notes ? `<div class="text-xs text-muted mt-1" style="margin-top: 4px;">Ghi chú: ${escapeHTML(p.notes)}</div>` : ''}
            </div>
            <div class="text-success text-bold text-lg" style="flex-shrink: 0; white-space: nowrap;">+ ${formatVND(p.amount)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  bindEvents() {
    // Chuyển 3 tabs
    const tabList = document.getElementById('tab-cust-list');
    const tabDebts = document.getElementById('tab-cust-debts');
    const tabPay = document.getElementById('tab-cust-payments');

    if (tabList) tabList.addEventListener('click', () => { this.activeTab = 'list'; this.render(); });
    if (tabDebts) tabDebts.addEventListener('click', () => { this.activeTab = 'debts'; this.render(); });
    if (tabPay) tabPay.addEventListener('click', () => { this.activeTab = 'payments'; this.render(); });

    const updateContentOnly = () => {
      const clearBtn = document.getElementById('btn-clear-customer-search');
      if (clearBtn) clearBtn.style.display = this.searchQuery ? 'flex' : 'none';
      const contentEl = document.getElementById('customer-content');
      if (!contentEl || !this._cachedCustomersData) return;

      const { customers, debtors, customerStats, debtPayments } = this._cachedCustomersData;
      const q = this.searchQuery.toLowerCase().trim();
      const filteredCustomers = customers.filter(c => !q || c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q)) || (c.address && c.address.toLowerCase().includes(q)));
      const filteredDebtors = debtors.filter(d => !q || d.customer.name.toLowerCase().includes(q) || (d.customer.phone && d.customer.phone.includes(q)));

      contentEl.innerHTML = this._renderCustomerContentHtml(filteredCustomers, filteredDebtors, customerStats, debtPayments);
      this.bindCustomerContentEvents();
    };

    const searchInput = document.getElementById('customer-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        updateContentOnly();
      });
    }

    const clearSearch = document.getElementById('btn-clear-customer-search');
    if (clearSearch) {
      clearSearch.addEventListener('click', () => {
        this.searchQuery = '';
        if (searchInput) searchInput.value = '';
        updateContentOnly();
        if (searchInput) searchInput.focus();
      });
    }

    const addBtn = document.getElementById('btn-add-customer');
    if (addBtn) addBtn.addEventListener('click', () => this.showCustomerModal());

    this.bindCustomerContentEvents();
  }

  bindCustomerContentEvents() {
    const addBtnEmpty = document.getElementById('btn-add-customer-empty');
    if (addBtnEmpty) addBtnEmpty.addEventListener('click', () => this.showCustomerModal());

    document.querySelectorAll('.btn-edit-customer').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showCustomerModal(btn.dataset.id);
      });
    });

    document.querySelectorAll('.btn-view-history').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showCustomerHistoryModal(btn.dataset.id);
      });
    });

    document.querySelectorAll('.btn-collect-debt-fast').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showDebtPaymentModal(btn.dataset.id, btn.dataset.name, parseInt(btn.dataset.debt, 10));
      });
    });

    document.querySelectorAll('.customer-card').forEach(card => {
      card.addEventListener('click', () => {
        this.showCustomerHistoryModal(card.dataset.id);
      });
    });
  }

  showDebtPaymentModal(customerId, customerName, currentDebt) {
    const modalHtml = `
      <div class="modal-backdrop" id="debt-payment-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">💵 Thu Tiền Nợ</h2>
            <button class="modal-close" id="btn-close-dpmodal">&times;</button>
          </div>

          <form id="debt-payment-form" class="modal-body">
            <div class="card p-3 mb-3 bg-light">
              <div>Khách hàng: <b>${escapeHTML(customerName)}</b></div>
              <div class="mt-1">Số tiền đang nợ: <b class="text-danger text-lg">${formatVND(currentDebt)}</b></div>
            </div>

            <div class="form-group">
              <label class="form-label required">Số tiền thu đợt này (VNĐ)</label>
              <input type="number" id="dp-amount" class="form-input form-input-lg text-primary text-bold" required min="1000" max="${currentDebt}" value="${currentDebt}">
              <div class="quick-amount-buttons mt-2" style="display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-top:8px;">
                <button type="button" class="btn btn-outline-secondary btn-xs btn-set-full-debt" data-amt="${currentDebt}">Thu hết (${formatVND(currentDebt)})</button>
                ${currentDebt > 200000 ? `<button type="button" class="btn btn-outline-secondary btn-xs btn-set-debt-half" data-amt="${Math.round(currentDebt / 2)}">Thu 50%</button>` : ''}
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Hình thức nhận tiền</label>
              <select id="dp-method" class="form-select">
                <option value="cash">💵 Tiền mặt</option>
                <option value="transfer">🏦 Chuyển khoản ngân hàng</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Ghi chú thu nợ</label>
              <input type="text" id="dp-notes" class="form-input" placeholder="VD: Khách chuyển khoản Vietcombank...">
            </div>

            <div class="modal-footer" style="display:flex; flex-wrap:wrap; align-items:center; justify-content:flex-end; gap:8px; margin-top:12px;">
              <button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-dpmodal">Hủy</button>
              <button type="submit" class="btn btn-success btn-sm">✓ Xác Nhận Thu Tiền</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const old = document.getElementById('debt-payment-modal');
    if (old) old.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('debt-payment-modal');
    const close = () => modal.remove();
    document.getElementById('btn-close-dpmodal').addEventListener('click', close);
    document.getElementById('btn-cancel-dpmodal').addEventListener('click', close);

    const amtInp = document.getElementById('dp-amount');
    const fullBtn = document.querySelector('.btn-set-full-debt');
    if (fullBtn) fullBtn.addEventListener('click', () => { amtInp.value = currentDebt; });
    const halfBtn = document.querySelector('.btn-set-debt-half');
    if (halfBtn) halfBtn.addEventListener('click', () => { amtInp.value = Math.round(currentDebt / 2); });

    document.getElementById('debt-payment-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = parseInt(amtInp.value, 10);
      if (isNaN(amount) || amount <= 0) {
        alert('Số tiền thu không hợp lệ!');
        return;
      }

      const method = document.getElementById('dp-method').value;
      const notes = document.getElementById('dp-notes').value.trim();
      const now = new Date().toISOString();

      const paymentRecord = {
        id: 'THU-' + Date.now(),
        customerId,
        customerName,
        amount,
        paymentMethod: method,
        notes,
        createdAt: now
      };

      try {
        await db.put('debt_payments', paymentRecord);
        alert(`✓ Đã ghi nhận thu ${formatVND(amount)} từ ${customerName}!`);
        close();
        this.render();
      } catch (err) {
        alert('Lỗi lưu phiếu thu nợ: ' + err.message);
      }
    });
  }

  async showCustomerModal(customerId = null) {
    let customer = null;
    let isEdit = false;
    if (customerId) {
      customer = await db.getById('customers', customerId);
      isEdit = !!customer;
    }

    if (!customer) {
      customer = {
        id: 'KH-' + Date.now(),
        name: '',
        phone: '',
        address: '',
        notes: ''
      };
    }

    const modalHtml = `
      <div class="modal-backdrop" id="customer-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">${isEdit ? '✏️ Chỉnh Sửa Khách Hàng' : '➕ Thêm Khách Hàng Mới'}</h2>
            <button class="modal-close" id="btn-close-cmodal">&times;</button>
          </div>

          <form id="customer-form" class="modal-body">
            <div class="form-group">
              <label class="form-label required">Tên khách hàng</label>
              <input type="text" id="c-name" class="form-input" required placeholder="VD: Anh Tuấn (Thả diều Thủ Đức)" value="${escapeHTML(customer.name)}">
            </div>

            <div class="form-group">
              <label class="form-label">Số điện thoại (Zalo)</label>
              <input type="tel" id="c-phone" class="form-input" placeholder="VD: 0901234567" value="${escapeHTML(customer.phone || '')}">
            </div>

            <div class="form-group">
              <label class="form-label">Địa chỉ nhận hàng</label>
              <input type="text" id="c-address" class="form-input" placeholder="VD: 45 Đường số 8, Linh Xuân, Thủ Đức" value="${escapeHTML(customer.address || '')}">
            </div>

            <div class="form-group">
              <label class="form-label">Ghi chú về khách</label>
              <textarea id="c-notes" class="form-textarea" rows="2" placeholder="Sở thích diều, nan carbon...">${escapeHTML(customer.notes || '')}</textarea>
            </div>

            <div class="modal-footer" style="flex-wrap: wrap; gap: 8px; justify-content: flex-end;">
              ${isEdit ? `
                <button type="button" class="btn btn-outline-danger btn-sm" id="btn-delete-customer" style="white-space: nowrap;">Xóa mềm</button>
              ` : ''}
              <div style="flex:1"></div>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-cmodal" style="white-space: nowrap;">Hủy</button>
              <button type="submit" class="btn btn-primary btn-sm" style="white-space: nowrap;">Lưu Khách Hàng</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const old = document.getElementById('customer-modal');
    if (old) old.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('customer-modal');
    const close = () => modal.remove();
    document.getElementById('btn-close-cmodal').addEventListener('click', close);
    document.getElementById('btn-cancel-cmodal').addEventListener('click', close);

    const deleteBtn = document.getElementById('btn-delete-customer');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (confirm(`Chuyển khách "${customer.name}" vào Thùng rác?\n(Các đơn hàng cũ vẫn được giữ nguyên).`)) {
          await db.softDelete('customers', customer.id);
          close();
          this.render();
        }
      });
    }

    document.getElementById('customer-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('c-name').value.trim();
      if (!name) {
        alert('Vui lòng nhập tên khách hàng');
        return;
      }

      const updated = {
        ...customer,
        name,
        phone: document.getElementById('c-phone').value.trim(),
        address: document.getElementById('c-address').value.trim(),
        notes: document.getElementById('c-notes').value.trim()
      };

      await db.put('customers', updated);
      close();
      this.render();
    });
  }

  async showCustomerHistoryModal(customerId) {
    const customer = await db.getById('customers', customerId);
    if (!customer) return;

    const allOrders = await db.getAll('orders');
    const allDebts = await db.getAll('debt_payments');

    const customerOrders = allOrders.filter(o => o.customerId === customerId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const customerPayments = allDebts.filter(p => p.customerId === customerId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    let totalSpent = 0;
    let currentDebt = 0;
    for (const o of customerOrders) {
      if (o.status !== 'cancelled') {
        totalSpent += (o.totalAmount || 0);
        currentDebt += (o.debtAmount || 0);
      }
    }
    for (const p of customerPayments) {
      currentDebt -= (p.amount || 0);
    }
    if (currentDebt < 0) currentDebt = 0;

    const modalHtml = `
      <div class="modal-backdrop" id="customer-history-modal">
        <div class="modal-content modal-lg">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">👤 ${escapeHTML(customer.name)}</h2>
              <div class="modal-subtitle">
                ${customer.phone ? `📞 ${escapeHTML(customer.phone)}` : ''} 
                ${customer.address ? `• 📍 ${escapeHTML(customer.address)}` : ''}
              </div>
            </div>
            <button class="modal-close" id="btn-close-hmodal">&times;</button>
          </div>

          <div class="modal-body">
            <div class="stats-grid mb-3">
              <div class="stat-card">
                <div class="stat-lbl">Tổng đơn mua</div>
                <div class="stat-val">${customerOrders.length}</div>
              </div>
              <div class="stat-card">
                <div class="stat-lbl">Tổng chi tiêu</div>
                <div class="stat-val text-primary">${formatVND(totalSpent)}</div>
              </div>
              <div class="stat-card ${currentDebt > 0 ? 'stat-card-danger' : ''}">
                <div class="stat-lbl">Công nợ hiện tại</div>
                <div class="stat-val ${currentDebt > 0 ? 'text-danger' : 'text-success'}">${formatVND(currentDebt)}</div>
              </div>
            </div>

            <div class="customer-action-bar mb-3" style="display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:12px;">
              ${currentDebt > 0 ? `
                <button class="btn btn-danger btn-sm" id="btn-history-collect-debt" style="white-space: nowrap;">💵 Thu Nợ</button>
              ` : ''}
              <button class="btn btn-primary btn-sm" id="btn-history-new-order" style="white-space: nowrap;">⚡ Tạo Đơn Cho Khách</button>
              <button class="btn btn-secondary btn-sm" id="btn-history-edit-cust" style="white-space: nowrap;">✏️ Sửa</button>
            </div>

            <h3 class="section-divider-title mb-2" style="font-size:14px; font-weight:700; margin-bottom:8px;">📦 Lịch Sử Đơn Hàng (${customerOrders.length})</h3>
            <div class="history-list">
              ${customerOrders.length === 0 ? `
                <p class="text-muted text-center py-2 text-xs">Khách chưa có đơn mua nào.</p>
              ` : customerOrders.map(o => `
                <div class="order-mini-card card p-2 mb-2 ${o.status === 'cancelled' ? 'cancelled-order' : ''}" style="padding:10px; margin-bottom:8px;">
                  <div class="d-flex justify-between" style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:6px;">
                    <div style="min-width: 0; flex: 1;">
                      <span class="text-bold text-sm">${escapeHTML(o.id)}</span>
                      <span class="text-muted text-xs ml-1">${formatDateTime(o.createdAt)}</span>
                    </div>
                    <div style="flex-shrink: 0;">
                      ${o.status === 'cancelled' ? `
                        <span class="badge badge-danger">Đã hủy</span>
                      ` : o.debtAmount > 0 ? `
                        <span class="badge badge-warning">Nợ ${formatVND(o.debtAmount)}</span>
                      ` : `
                        <span class="badge badge-success">Đã thanh toán</span>
                      `}
                    </div>
                  </div>

                  <div class="order-mini-items text-xs text-muted mt-1" style="margin-top:4px;">
                    ${(o.items || []).map(item => `${escapeHTML(item.productName)} x${item.quantity}`).join(', ')}
                  </div>

                  <div class="order-mini-bottom text-xs mt-1" style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:4px;">
                    <span>${o.paymentMethod === 'cash' ? 'Tiền mặt' : o.paymentMethod === 'transfer' ? 'Chuyển khoản' : 'Ghi nợ'}</span>
                    <span class="text-bold text-primary" style="white-space: nowrap;">${formatVND(o.totalAmount)}</span>
                  </div>
                </div>
              `).join('')}
            </div>

            ${customerPayments.length > 0 ? `
              <h3 class="section-divider-title mt-3 mb-2" style="font-size:14px; font-weight:700; margin:12px 0 8px;">💳 Lịch Sử Thanh Toán Nợ (${customerPayments.length})</h3>
              <div class="payment-history-table">
                ${customerPayments.map(p => `
                  <div class="card p-2 mb-1" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; padding:10px; margin-bottom:6px;">
                    <div style="min-width: 0; flex: 1 1 160px;">
                      <div class="text-bold text-xs">${formatDateTime(p.createdAt)}</div>
                      <div class="text-muted text-xs">${escapeHTML(p.notes || 'Thu nợ')} (${p.paymentMethod === 'transfer' ? 'Chuyển khoản' : 'Tiền mặt'})</div>
                    </div>
                    <div class="text-success text-bold" style="flex-shrink: 0; white-space: nowrap;">+ ${formatVND(p.amount)}</div>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>

          <div class="modal-footer" style="justify-content: flex-end; flex-wrap: wrap; gap: 8px;">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-close-hmodal2">Đóng</button>
          </div>
        </div>
      </div>
    `;

    const old = document.getElementById('customer-history-modal');
    if (old) old.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('customer-history-modal');
    const close = () => modal.remove();
    document.getElementById('btn-close-hmodal').addEventListener('click', close);
    document.getElementById('btn-close-hmodal2').addEventListener('click', close);

    const collectDebtBtn = document.getElementById('btn-history-collect-debt');
    if (collectDebtBtn) {
      collectDebtBtn.addEventListener('click', () => {
        close();
        this.showDebtPaymentModal(customer.id, customer.name, currentDebt);
      });
    }

    const newOrderBtn = document.getElementById('btn-history-new-order');
    if (newOrderBtn) {
      newOrderBtn.addEventListener('click', () => {
        close();
        this.app.navigateTo('sales');
        if (this.app.salesModule) {
          this.app.salesModule.setCustomer(customer);
        }
      });
    }

    const editBtn = document.getElementById('btn-history-edit-cust');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        close();
        this.showCustomerModal(customer.id);
      });
    }
  }
}

export { CustomerModule as CustomersModule };
