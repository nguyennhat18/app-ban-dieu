// Quản lý Công Nợ & Thu Nợ Khách Hàng
import { db } from '../db.js';
import { formatVND, parseVND, formatDateTime, escapeHTML } from '../utils.js';

export class DebtsModule {
  constructor(app) {
    this.app = app;
    this.searchQuery = '';
    this.activeTab = 'customers'; // 'customers' | 'payments'
  }

  async render() {
    const container = document.getElementById('view-container');
    const customers = await db.getAll('customers');
    const orders = await db.getAll('orders');
    const payments = await db.getAll('debt_payments');

    // Tính nợ hiện tại của từng khách
    const debtMap = {};
    for (const c of customers) {
      debtMap[c.id] = {
        customer: c,
        totalDebt: 0,
        ordersWithDebt: []
      };
    }

    for (const o of orders) {
      if (o.status !== 'cancelled' && o.customerId && debtMap[o.customerId]) {
        if ((o.debtAmount || 0) > 0) {
          debtMap[o.customerId].totalDebt += o.debtAmount;
          debtMap[o.customerId].ordersWithDebt.push(o);
        }
      }
    }

    // Trừ đi số tiền đã trả
    for (const p of payments) {
      if (p.customerId && debtMap[p.customerId]) {
        debtMap[p.customerId].totalDebt -= (p.amount || 0);
      }
    }

    // Lọc danh sách khách còn nợ > 0
    const allDebtors = Object.values(debtMap).filter(d => d.totalDebt > 0);
    allDebtors.sort((a, b) => b.totalDebt - a.totalDebt);
    const totalShopDebt = allDebtors.reduce((sum, d) => sum + d.totalDebt, 0);

    // Lịch sử thu nợ
    payments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    this._cachedDebtors = allDebtors;
    this._cachedDebtPayments = payments;

    // Lọc theo tìm kiếm
    const q = this.searchQuery.toLowerCase().trim();
    const debtors = !q ? allDebtors : allDebtors.filter(d =>
      d.customer.name.toLowerCase().includes(q) ||
      (d.customer.phone && d.customer.phone.includes(q))
    );

    container.innerHTML = `
      <div class="view-header">
        <div class="header-title-row">
          <div>
            <h1 class="view-title">💵 Theo Dõi Công Nợ</h1>
            <p class="view-subtitle">${allDebtors.length} khách đang nợ • Tổng tiền cần thu: <b class="text-danger">${formatVND(totalShopDebt)}</b></p>
          </div>
          <div class="header-tab-switch">
            <button class="tab-switch-btn ${this.activeTab === 'customers' ? 'active' : ''}" id="tab-btn-debt-cust">👥 Khách Còn Nợ</button>
            <button class="tab-switch-btn ${this.activeTab === 'payments' ? 'active' : ''}" id="tab-btn-debt-history">📜 Lịch Sử Thu</button>
          </div>
        </div>

        ${this.activeTab === 'customers' ? `
          <div class="search-filter-bar">
            <div class="search-input-wrap">
              <input type="text" id="debt-search" class="form-input" placeholder="🔍 Tìm khách nợ theo tên, số điện thoại..." value="${escapeHTML(this.searchQuery)}">
              <button id="btn-clear-debt-search" class="clear-search-btn" style="display:${this.searchQuery ? 'flex' : 'none'}">&times;</button>
            </div>
          </div>
        ` : ''}
      </div>

      <div id="debts-content">
        ${this._renderDebtsContentHtml(debtors, payments)}
      </div>
    `;

    this.bindEvents();
  }

  _renderDebtsContentHtml(debtors, payments) {
    if (this.activeTab === 'customers') {
      return `
        <div class="debtors-list">
          ${debtors.length === 0 ? `
            <div class="empty-state">
              <p class="empty-icon">🎉</p>
              <p class="empty-title">Không có công nợ nào!</p>
              <p class="empty-desc">Tất cả khách hàng đã thanh toán đủ tiền diều.</p>
            </div>
          ` : debtors.map(d => `
            <div class="debtor-card">
              <div class="debtor-info">
                <h3 class="debtor-name">${escapeHTML(d.customer.name)}</h3>
                <div class="debtor-meta">
                  ${d.customer.phone ? `<span>📞 ${escapeHTML(d.customer.phone)}</span>` : ''}
                  ${d.customer.address ? `<span>📍 ${escapeHTML(d.customer.address)}</span>` : ''}
                </div>
                <div class="text-xs text-muted mt-1">
                  ${d.ordersWithDebt.length} đơn hàng chưa trả hết
                </div>
              </div>

              <div class="debtor-amount-box text-right">
                <div class="debtor-debt-val text-danger text-bold">${formatVND(d.totalDebt)}</div>
                <button class="btn btn-danger btn-sm btn-record-debt-payment mt-2" data-id="${d.customer.id}" data-name="${escapeHTML(d.customer.name)}" data-debt="${d.totalDebt}">
                  💵 Thu Tiền Nợ
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
    return `
      <!-- Lịch sử các lần thu nợ -->
      <div class="payments-history-list">
        ${payments.length === 0 ? `
          <div class="empty-state">
            <p class="empty-icon">📜</p>
            <p class="empty-title">Chưa có phiếu thu nợ nào</p>
          </div>
        ` : payments.map(p => `
          <div class="payment-record-card">
            <div>
              <div class="text-bold">${escapeHTML(p.customerName)}</div>
              <div class="text-muted text-xs">${formatDateTime(p.createdAt)} • ${p.paymentMethod === 'transfer' ? 'Chuyển khoản' : 'Tiền mặt'}</div>
              ${p.notes ? `<div class="text-xs mt-1">Ghi chú: ${escapeHTML(p.notes)}</div>` : ''}
            </div>
            <div class="text-success text-bold text-lg">+ ${formatVND(p.amount)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  bindEvents() {
    const tabCust = document.getElementById('tab-btn-debt-cust');
    const tabHist = document.getElementById('tab-btn-debt-history');
    if (tabCust) tabCust.addEventListener('click', () => { this.activeTab = 'customers'; this.render(); });
    if (tabHist) tabHist.addEventListener('click', () => { this.activeTab = 'payments'; this.render(); });

    const updateDebtContentOnly = () => {
      const clearBtn = document.getElementById('btn-clear-debt-search');
      if (clearBtn) clearBtn.style.display = this.searchQuery ? 'flex' : 'none';
      const contentEl = document.getElementById('debts-content');
      if (!contentEl) return;
      const allDebtors = this._cachedDebtors || [];
      const q = this.searchQuery.toLowerCase().trim();
      const filtered = !q ? allDebtors : allDebtors.filter(d =>
        d.customer.name.toLowerCase().includes(q) ||
        (d.customer.phone && d.customer.phone.includes(q))
      );
      contentEl.innerHTML = this._renderDebtsContentHtml(filtered, this._cachedDebtPayments || []);
      this.bindDebtCardEvents();
    };

    const searchInp = document.getElementById('debt-search');
    if (searchInp) {
      searchInp.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        updateDebtContentOnly();
      });
    }

    const clearSearch = document.getElementById('btn-clear-debt-search');
    if (clearSearch) {
      clearSearch.addEventListener('click', () => {
        this.searchQuery = '';
        if (searchInp) searchInp.value = '';
        updateDebtContentOnly();
        if (searchInp) searchInp.focus();
      });
    }

    this.bindDebtCardEvents();
  }

  bindDebtCardEvents() {
    document.querySelectorAll('.btn-record-debt-payment').forEach(btn => {
      btn.addEventListener('click', () => {
        this.showPaymentModal(
          btn.dataset.id,
          btn.dataset.name,
          parseInt(btn.dataset.debt, 10)
        );
      });
    });
  }

  // ================= MODAL GHI NHẬN THU NỢ =================
  showPaymentModal(customerId, customerName, currentDebt) {
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
              <div class="quick-amount-buttons mt-2">
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

            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" id="btn-cancel-dpmodal">Hủy</button>
              <button type="submit" class="btn btn-success">✓ Xác Nhận Thu Tiền</button>
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
}
