// Quản lý khách hàng, lịch sử mua hàng và công nợ
import { db } from '../db.js';
import { formatVND, formatDate, formatDateTime, escapeHTML } from '../utils.js';

export class CustomerModule {
  constructor(app) {
    this.app = app;
    this.searchQuery = '';
    this.currentTab = 'list'; // 'list' | 'debts'
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

    // Đảm bảo không âm
    for (const id in customerStats) {
      if (customerStats[id].totalDebt < 0) customerStats[id].totalDebt = 0;
    }

    // Lọc theo tìm kiếm
    const filtered = customers.filter(c => {
      const q = this.searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        (c.address && c.address.toLowerCase().includes(q))
      );
    });

    // Sắp xếp
    filtered.sort((a, b) => {
      const debtA = customerStats[a.id]?.totalDebt || 0;
      const debtB = customerStats[b.id]?.totalDebt || 0;
      if (debtA !== debtB) return debtB - debtA; // Khách có nợ xếp trước
      return a.name.localeCompare(b.name, 'vi');
    });

    const totalCustomersWithDebt = Object.values(customerStats).filter(s => s.totalDebt > 0).length;
    const totalAllDebt = Object.values(customerStats).reduce((sum, s) => sum + s.totalDebt, 0);

    container.innerHTML = `
      <div class="view-header">
        <div class="header-title-row">
          <div>
            <h1 class="view-title">👥 Khách Hàng & Công Nợ</h1>
            <p class="view-subtitle">${customers.length} khách hàng • ${totalCustomersWithDebt} khách đang nợ (${formatVND(totalAllDebt)})</p>
          </div>
          <button id="btn-add-customer" class="btn btn-primary btn-sm">+ Thêm Khách</button>
        </div>

        <div class="search-filter-bar">
          <div class="search-input-wrap">
            <input type="text" id="customer-search" class="form-input" placeholder="🔍 Tìm tên, số điện thoại, địa chỉ..." value="${escapeHTML(this.searchQuery)}">
            ${this.searchQuery ? `<button id="btn-clear-customer-search" class="clear-search-btn">&times;</button>` : ''}
          </div>
        </div>
      </div>

      <!-- Danh sách khách hàng -->
      <div class="customer-list">
        ${filtered.length === 0 ? `
          <div class="empty-state">
            <p class="empty-icon">👥</p>
            <p class="empty-title">Không tìm thấy khách hàng nào</p>
            <p class="empty-desc">Bấm nút bên dưới để tạo khách hàng mới.</p>
            <button id="btn-add-customer-empty" class="btn btn-primary">+ Thêm Khách Hàng</button>
          </div>
        ` : filtered.map(c => {
          const stats = customerStats[c.id] || { totalOrders: 0, totalSpent: 0, totalDebt: 0 };
          return `
            <div class="customer-card ${stats.totalDebt > 0 ? 'card-has-debt' : ''}" data-id="${c.id}">
              <div class="customer-card-header">
                <div>
                  <h3 class="customer-name">${escapeHTML(c.name)}</h3>
                  <div class="customer-meta">
                    ${c.phone ? `<a href="tel:${escapeHTML(c.phone)}" class="customer-phone" onclick="event.stopPropagation()">📞 ${escapeHTML(c.phone)}</a>` : '<span class="text-muted">Chưa có SĐT</span>'}
                    ${c.address ? `<span class="customer-address">📍 ${escapeHTML(c.address)}</span>` : ''}
                  </div>
                </div>
                ${stats.totalDebt > 0 ? `
                  <div class="debt-tag">
                    <span class="debt-label">Nợ:</span>
                    <span class="debt-val text-danger text-bold">${formatVND(stats.totalDebt)}</span>
                  </div>
                ` : `
                  <span class="badge badge-neutral">0 ₫ nợ</span>
                `}
              </div>

              <div class="customer-card-body">
                <div class="customer-summary-item">
                  <span class="summary-lbl">Đơn đã mua:</span>
                  <span class="summary-val">${stats.totalOrders} đơn</span>
                </div>
                <div class="customer-summary-item">
                  <span class="summary-lbl">Tổng chi tiêu:</span>
                  <span class="summary-val text-bold">${formatVND(stats.totalSpent)}</span>
                </div>
              </div>

              <div class="customer-card-footer">
                <button class="btn btn-outline-primary btn-xs btn-view-history" data-id="${c.id}">📜 Lịch sử mua</button>
                ${stats.totalDebt > 0 ? `
                  <button class="btn btn-danger btn-xs btn-collect-debt-fast" data-id="${c.id}" data-name="${escapeHTML(c.name)}" data-debt="${stats.totalDebt}">💵 Thu nợ</button>
                ` : ''}
                <button class="btn btn-secondary btn-xs btn-edit-customer" data-id="${c.id}">✏️ Sửa</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const searchInput = document.getElementById('customer-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.render();
      });
    }

    const clearSearch = document.getElementById('btn-clear-customer-search');
    if (clearSearch) {
      clearSearch.addEventListener('click', () => {
        this.searchQuery = '';
        this.render();
      });
    }

    const addBtn = document.getElementById('btn-add-customer');
    const addBtnEmpty = document.getElementById('btn-add-customer-empty');
    if (addBtn) addBtn.addEventListener('click', () => this.showCustomerModal());
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
        if (this.app.debtsModule) {
          this.app.debtsModule.showPaymentModal(btn.dataset.id, btn.dataset.name, parseInt(btn.dataset.debt, 10));
        }
      });
    });

    document.querySelectorAll('.customer-card').forEach(card => {
      card.addEventListener('click', () => {
        this.showCustomerHistoryModal(card.dataset.id);
      });
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
              <textarea id="c-notes" class="form-textarea" rows="2" placeholder="Sở thích diều, loại nan thường dùng...">${escapeHTML(customer.notes || '')}</textarea>
            </div>

            <div class="modal-footer">
              ${isEdit ? `
                <button type="button" class="btn btn-outline-danger" id="btn-delete-customer">Xóa mềm</button>
              ` : ''}
              <div style="flex:1"></div>
              <button type="button" class="btn btn-secondary" id="btn-cancel-cmodal">Hủy</button>
              <button type="submit" class="btn btn-primary">Lưu Khách Hàng</button>
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
            <!-- Thống kê nhanh của khách -->
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-lbl">Tổng đơn hàng</div>
                <div class="stat-val">${customerOrders.length}</div>
              </div>
              <div class="stat-card">
                <div class="stat-lbl">Tổng tiền đã mua</div>
                <div class="stat-val text-primary">${formatVND(totalSpent)}</div>
              </div>
              <div class="stat-card ${currentDebt > 0 ? 'stat-card-danger' : ''}">
                <div class="stat-lbl">Công nợ hiện tại</div>
                <div class="stat-val ${currentDebt > 0 ? 'text-danger' : 'text-success'}">${formatVND(currentDebt)}</div>
              </div>
            </div>

            <!-- Nút hành động nhanh -->
            <div class="customer-action-bar">
              ${currentDebt > 0 ? `
                <button class="btn btn-danger btn-sm" id="btn-history-collect-debt">💵 Thu Nợ Khách Này</button>
              ` : ''}
              <button class="btn btn-primary btn-sm" id="btn-history-new-order">⚡ Tạo Đơn Cho Khách</button>
              <button class="btn btn-secondary btn-sm" id="btn-history-edit-cust">✏️ Sửa Thông Tin</button>
            </div>

            <!-- Lịch sử các đơn hàng -->
            <h3 class="section-divider-title">📦 Lịch Sử Đơn Hàng (${customerOrders.length})</h3>
            <div class="history-list">
              ${customerOrders.length === 0 ? `
                <p class="text-muted text-center py-3">Khách hàng chưa có đơn mua nào.</p>
              ` : customerOrders.map(o => `
                <div class="order-mini-card ${o.status === 'cancelled' ? 'cancelled-order' : ''}">
                  <div class="order-mini-top">
                    <div>
                      <span class="text-bold">${escapeHTML(o.id)}</span>
                      <span class="text-muted text-sm ml-2">${formatDateTime(o.createdAt)}</span>
                    </div>
                    <div>
                      ${o.status === 'cancelled' ? `
                        <span class="badge badge-danger">Đã hủy</span>
                      ` : o.debtAmount > 0 ? `
                        <span class="badge badge-warning">Còn nợ ${formatVND(o.debtAmount)}</span>
                      ` : `
                        <span class="badge badge-success">Đã thanh toán</span>
                      `}
                    </div>
                  </div>

                  <div class="order-mini-items">
                    ${(o.items || []).map(item => `
                      <div class="order-mini-item-row">
                        <span>${escapeHTML(item.productName)} x ${item.quantity} ${escapeHTML(item.unit || '')}</span>
                        <span>${formatVND(item.subtotal)}</span>
                      </div>
                    `).join('')}
                  </div>

                  <div class="order-mini-bottom">
                    <div>PTTT: <b>${o.paymentMethod === 'cash' ? 'Tiền mặt' : o.paymentMethod === 'transfer' ? 'Chuyển khoản' : 'Ghi nợ'}</b></div>
                    <div class="order-mini-total">Tổng: <b>${formatVND(o.totalAmount)}</b></div>
                  </div>
                </div>
              `).join('')}
            </div>

            <!-- Lịch sử thanh toán nợ -->
            ${customerPayments.length > 0 ? `
              <h3 class="section-divider-title mt-4">💳 Lịch Sử Thanh Toán Nợ (${customerPayments.length})</h3>
              <div class="payment-history-table">
                ${customerPayments.map(p => `
                  <div class="payment-history-row">
                    <div>
                      <div class="text-bold">${formatDateTime(p.createdAt)}</div>
                      <div class="text-muted text-xs">${escapeHTML(p.notes || 'Thu nợ')} (${p.paymentMethod === 'transfer' ? 'Chuyển khoản' : 'Tiền mặt'})</div>
                    </div>
                    <div class="text-success text-bold">+ ${formatVND(p.amount)}</div>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="btn-close-hmodal2">Đóng</button>
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
        if (this.app.debtsModule) {
          this.app.debtsModule.showPaymentModal(customer.id, customer.name, currentDebt);
        }
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
