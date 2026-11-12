// Quản lý Báo Giá (Tạo báo giá, Xuất PDF tiếng Việt có dấu, Xuất Excel, Web Share, Chuyển thành đơn bán)
import { db } from '../db.js';
import {
  formatVND,
  parseVND,
  formatDate,
  formatDateTime,
  formatDateForInput,
  addDays,
  numberToVietnameseWords,
  shareFileOrDownload,
  escapeHTML
} from '../utils.js';
import { registerVietnameseFont } from '../vendor/roboto-font.js';

export class QuotationsModule {
  constructor(app) {
    this.app = app;
    this.searchQuery = '';
    this.filterStatus = 'all';
  }

  async render() {
    const container = document.getElementById('view-container');
    const quotations = await db.getAll('quotations');
    quotations.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    this._cachedQuotations = quotations;

    const filtered = this._filterQuotations(quotations);

    container.innerHTML = `
      <div class="view-header">
        <div class="header-title-row" style="flex-wrap: wrap; align-items: center; gap: 8px;">
          <div>
            <h1 class="view-title">📑 Báo Giá Cho Khách</h1>
            <p class="view-subtitle">Lập báo giá chuyên nghiệp, xuất PDF tiếng Việt có dấu, gửi Zalo</p>
          </div>
          <button id="btn-create-quote" class="btn btn-primary btn-sm">
            <span>+</span> Tạo Báo Giá Mới
          </button>
        </div>

        <div class="search-filter-bar">
          <div class="search-input-wrap">
            <input type="text" id="quote-search" class="form-input" placeholder="🔍 Tìm theo số báo giá, khách hàng..." value="${escapeHTML(this.searchQuery)}">
            <button id="btn-clear-quote-search" class="clear-search-btn" style="display:${this.searchQuery ? 'flex' : 'none'}">&times;</button>
          </div>
          <div class="category-tabs-scroll">
            <button class="cat-pill ${this.filterStatus === 'all' ? 'active' : ''}" data-status="all">Tất cả (${quotations.length})</button>
            <button class="cat-pill ${this.filterStatus === 'draft' ? 'active' : ''}" data-status="draft">Bản nháp</button>
            <button class="cat-pill ${this.filterStatus === 'sent' ? 'active' : ''}" data-status="sent">Đã gửi khách</button>
            <button class="cat-pill ${this.filterStatus === 'converted' ? 'active' : ''}" data-status="converted">Đã chuyển thành đơn</button>
          </div>
        </div>
      </div>

      <div class="quotations-list" id="quotations-list-container">
        ${this._renderQuotationsListHtml(filtered)}
      </div>
    `;

    this.bindEvents();
  }

  _filterQuotations(quotations) {
    return quotations.filter(q => {
      const matchStatus = this.filterStatus === 'all' || q.status === this.filterStatus;
      const query = this.searchQuery.toLowerCase().trim();
      const matchQuery = !query ||
        q.id.toLowerCase().includes(query) ||
        (q.customerName && q.customerName.toLowerCase().includes(query)) ||
        (q.customerPhone && q.customerPhone.includes(query));
      return matchStatus && matchQuery;
    });
  }

  _renderQuotationsListHtml(filtered) {
    if (filtered.length === 0) {
      return `
        <div class="empty-state">
          <p class="empty-icon">📑</p>
          <p class="empty-title">Chưa có báo giá nào</p>
          <p class="empty-desc">Bấm nút bên dưới để tạo bản báo giá đầu tiên gửi khách hàng.</p>
          <button id="btn-create-quote-empty" class="btn btn-primary">+ Tạo Báo Giá Mới</button>
        </div>
      `;
    }

    return filtered.map(q => {
      const isExpired = new Date(q.validUntil) < new Date();
      const statusBadge =
        q.status === 'converted' ? '<span class="badge badge-success">✓ Đã lên đơn</span>' :
        q.status === 'sent' ? '<span class="badge badge-primary">Đã gửi</span>' :
        isExpired ? '<span class="badge badge-danger">Hết hạn</span>' :
        '<span class="badge badge-neutral">Bản nháp</span>';

      return `
        <div class="quote-card" data-id="${q.id}">
          <div class="quote-card-header" style="flex-wrap: wrap; align-items: center; gap: 8px;">
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">
              <span class="quote-id text-bold">${escapeHTML(q.id)}</span>
              <span class="text-muted text-xs ml-2">${formatDate(q.createdAt)}</span>
            </div>
            <div>${statusBadge}</div>
          </div>

          <div class="quote-card-body">
            <div class="quote-cust-name text-bold">Khách: ${escapeHTML(q.customerName || 'Khách lẻ')}</div>
            <div class="quote-cust-meta text-muted text-xs">
              ${q.customerPhone ? `📞 ${escapeHTML(q.customerPhone)}` : ''} 
              ${q.validUntil ? `• Hạn đến: ${formatDate(q.validUntil)}` : ''}
            </div>
            <div class="quote-items-preview text-xs mt-1">
              ${(q.items || []).map(i => `${escapeHTML(i.productName)} (x${i.quantity})`).join(', ')}
            </div>
          </div>

          <div class="quote-card-footer" style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px;">
            <div class="quote-total-price">
              Tổng: <span class="text-bold text-primary">${formatVND(q.totalAmount)}</span>
            </div>
            <div class="quote-action-btns" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px;">
              <button class="btn btn-outline-primary btn-xs btn-export-pdf" data-id="${q.id}" title="Xuất PDF tiếng Việt & Gửi Zalo">
                📄 Xuất PDF
              </button>
              <button class="btn btn-outline-success btn-xs btn-export-excel" data-id="${q.id}" title="Xuất file Excel">
                📊 Excel
              </button>
              ${q.status !== 'converted' ? `
                <button class="btn btn-success btn-xs btn-convert-order" data-id="${q.id}" title="Chuyển báo giá này thành đơn bán hàng">
                  ⚡ Lên Đơn Bán
                </button>
              ` : ''}
              <button class="btn btn-secondary btn-xs btn-edit-quote" data-id="${q.id}">✏️</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  bindEvents() {
    const updateQuotesOnly = () => {
      const clearBtn = document.getElementById('btn-clear-quote-search');
      if (clearBtn) clearBtn.style.display = this.searchQuery ? 'flex' : 'none';
      const listEl = document.getElementById('quotations-list-container');
      if (!listEl) return;
      const filtered = this._filterQuotations(this._cachedQuotations || []);
      listEl.innerHTML = this._renderQuotationsListHtml(filtered);
      this.bindQuotationCardEvents();
    };

    const searchInp = document.getElementById('quote-search');
    if (searchInp) {
      searchInp.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        updateQuotesOnly();
      });
    }

    const clearSearch = document.getElementById('btn-clear-quote-search');
    if (clearSearch) {
      clearSearch.addEventListener('click', () => {
        this.searchQuery = '';
        if (searchInp) searchInp.value = '';
        updateQuotesOnly();
        if (searchInp) searchInp.focus();
      });
    }

    document.querySelectorAll('.view-header .cat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        this.filterStatus = btn.dataset.status;
        this.render();
      });
    });

    const createBtn = document.getElementById('btn-create-quote');
    if (createBtn) createBtn.addEventListener('click', () => this.showQuotationFormModal());

    this.bindQuotationCardEvents();
  }

  bindQuotationCardEvents() {
    const createBtnEmpty = document.getElementById('btn-create-quote-empty');
    if (createBtnEmpty) createBtnEmpty.addEventListener('click', () => this.showQuotationFormModal());

    // Xuất PDF
    document.querySelectorAll('.btn-export-pdf').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.generateAndSharePDF(btn.dataset.id);
      });
    });

    // Xuất Excel
    document.querySelectorAll('.btn-export-excel').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.generateAndShareExcel(btn.dataset.id);
      });
    });

    // Chuyển thành đơn bán
    document.querySelectorAll('.btn-convert-order').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.handleConvertToOrder(btn.dataset.id);
      });
    });

    // Chỉnh sửa báo giá
    document.querySelectorAll('.btn-edit-quote').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showQuotationFormModal(btn.dataset.id);
      });
    });

    // Click vào card để xem trước
    document.querySelectorAll('.quote-card').forEach(card => {
      card.addEventListener('click', () => {
        this.showQuotationPreviewModal(card.dataset.id);
      });
    });
  }

  // ================= TỰ TĂNG MÃ BÁO GIÁ: BG-YYYY-XXXX =================
  async generateNextQuoteNumber() {
    const year = new Date().getFullYear();
    const allQuotes = await db.getAll('quotations', true);
    const prefix = `BG-${year}-`;

    let maxSeq = 0;
    for (const q of allQuotes) {
      if (q.id && q.id.startsWith(prefix)) {
        const seqPart = parseInt(q.id.replace(prefix, ''), 10);
        if (!isNaN(seqPart) && seqPart > maxSeq) {
          maxSeq = seqPart;
        }
      }
    }

    const nextSeq = maxSeq + 1;
    return `${prefix}${String(nextSeq).padStart(4, '0')}`;
  }

  // ================= FORM TẠO / SỬA BÁO GIÁ =================
  async showQuotationFormModal(quoteId = null) {
    const products = await db.getAll('products');
    const customers = await db.getAll('customers');
    const shopSettings = (await db.getSetting('shop_info')) || {};

    let quote = null;
    let isEdit = false;

    if (quoteId) {
      quote = await db.getById('quotations', quoteId);
      isEdit = !!quote;
    }

    if (!quote) {
      const nextId = await this.generateNextQuoteNumber();
      const validDays = shopSettings.quoteValidityDays || 7;
      const validUntil = formatDateForInput(addDays(new Date(), validDays));

      quote = {
        id: nextId,
        customerId: '',
        customerName: '',
        customerPhone: '',
        customerAddress: '',
        items: [],
        subtotal: 0,
        discountType: 'amount',
        discountValue: 0,
        discountAmount: 0,
        shippingFee: 0,
        vatRate: shopSettings.enableVat ? (shopSettings.vatRate || 8) : 0,
        vatAmount: 0,
        totalAmount: 0,
        validDays,
        validUntil,
        status: 'draft',
        notes: 'Báo giá đã bao gồm dây thả cơ bản (nếu có). Quý khách vui lòng xác nhận trước ngày hết hạn.'
      };
    }

    let items = [...(quote.items || [])];

    const modalHtml = `
      <div class="modal-backdrop" id="quote-form-modal">
        <div class="modal-content modal-lg">
          <div class="modal-header">
            <h2 class="modal-title">${isEdit ? '✏️ Sửa Báo Giá ' + quote.id : '📑 Lập Báo Giá Mới'}</h2>
            <button class="modal-close" id="btn-close-qmodal">&times;</button>
          </div>

          <form id="quote-form" class="modal-body">
            <!-- Thông tin khách hàng & số báo giá -->
            <div class="form-row">
              <div class="form-group flex-1">
                <label class="form-label text-bold">Số báo giá</label>
                <input type="text" id="q-id" class="form-input" readonly value="${escapeHTML(quote.id)}">
              </div>
              <div class="form-group flex-1">
                <label class="form-label text-bold">Hạn hiệu lực đến ngày</label>
                <input type="date" id="q-valid-until" class="form-input" value="${quote.validUntil}">
              </div>
            </div>

            <!-- Chọn khách hoặc nhập tay -->
            <div class="form-row">
              <div class="form-group flex-1">
                <label class="form-label">Chọn khách quen (tự điền SĐT)</label>
                <select id="q-select-customer" class="form-select">
                  <option value="">-- Nhập tay hoặc chọn khách --</option>
                  ${customers.map(c => `
                    <option value="${c.id}" data-name="${escapeHTML(c.name)}" data-phone="${escapeHTML(c.phone || '')}" data-address="${escapeHTML(c.address || '')}" ${quote.customerId === c.id ? 'selected' : ''}>
                      ${escapeHTML(c.name)} (${escapeHTML(c.phone || 'Không SĐT')})
                    </option>
                  `).join('')}
                </select>
              </div>
              <div class="form-group flex-1">
                <label class="form-label required">Tên người nhận báo giá</label>
                <input type="text" id="q-customer-name" class="form-input" required placeholder="VD: Anh Hải (Hội diều Bình Dương)" value="${escapeHTML(quote.customerName)}">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group flex-1">
                <label class="form-label">Số điện thoại</label>
                <input type="tel" id="q-customer-phone" class="form-input" placeholder="0901234567" value="${escapeHTML(quote.customerPhone)}">
              </div>
              <div class="form-group flex-2">
                <label class="form-label">Địa chỉ nhận hàng</label>
                <input type="text" id="q-customer-address" class="form-input" placeholder="Địa chỉ giao hàng..." value="${escapeHTML(quote.customerAddress || '')}">
              </div>
            </div>

            <!-- Chọn diều thêm vào bảng báo giá -->
            <div class="card p-3 mb-3 bg-light" style="border: 1.5px solid #cbd5e1; border-radius: 12px;">
              <h3 class="text-bold text-sm mb-2" style="color: #0284c7; display: flex; align-items: center; gap: 6px;">
                📋 Chọn Diều / Phụ Kiện Đưa Vào Báo Giá
              </h3>

              <div class="form-group mb-2">
                <label class="form-label required text-bold">1. Tên diều / Phụ kiện:</label>

                <!-- Tìm kiếm bằng gõ nhanh -->
                <div class="search-input-wrap mb-2" style="position: relative;">
                  <input type="text" id="q-product-search" class="form-input" placeholder="🔍 Gõ tên diều / phụ kiện để tìm nhanh..." autocomplete="off">
                  <button type="button" id="btn-clear-q-prod-search" class="clear-search-btn" style="display: none;">&times;</button>
                  <div id="q-product-suggestions" class="card" style="display: none; position: absolute; left: 0; right: 0; top: 100%; z-index: 60; max-height: 200px; overflow-y: auto; border: 1.5px solid #0284c7; box-shadow: 0 8px 20px rgba(0,0,0,0.16); margin-top: 2px; background: #fff;"></div>
                </div>

                <!-- Danh sách chọn (chỉ hiển thị tên mặt hàng, không hiển thị giá) -->
                <select id="q-add-product-select" class="form-select" style="font-weight: 600;">
                  <option value="">-- Hoặc bấm chọn trong danh sách (${products.length} món) --</option>
                  ${products.map(p => `
                    <option value="${p.id}" data-price="${p.sellingPrice}" data-unit="${escapeHTML(p.unit || 'Chiếc')}">
                      ${escapeHTML(p.name)}
                    </option>
                  `).join('')}
                </select>
              </div>

              <div class="form-row">
                <div class="form-group flex-1 mb-2">
                  <label class="form-label required text-bold" style="color: #0f172a;">2. SỐ LƯỢNG BÁO:</label>
                  <div style="position: relative;">
                    <input type="number" id="q-add-qty" class="form-input form-input-lg text-bold text-center" min="1" step="1" value="1" placeholder="Số lượng" style="font-size: 15px;">
                    <span id="q-unit-hint" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-size: 12px; color: #64748b; font-weight: 600; pointer-events: none;">chiếc</span>
                  </div>
                </div>

                <div class="form-group flex-1 mb-2">
                  <label class="form-label required text-bold" style="color: #0f172a;">3. ĐƠN GIÁ BÁO (VNĐ):</label>
                  <input type="text" id="q-add-price" class="form-input form-input-lg text-bold text-primary text-right" placeholder="0 ₫" style="font-size: 15px;">
                </div>
              </div>

              <button type="button" class="btn btn-primary btn-block btn-lg mt-2" id="btn-add-qitem" style="font-weight: 700;">
                ➕ Thêm Món Này Vào Báo Giá
              </button>
            </div>

            <!-- Bảng danh sách hàng hóa trong báo giá -->
            <div class="table-responsive card p-2 mb-3" style="border: 1px solid var(--border);">
              <table class="table mb-0" id="quote-table-items">
                <thead>
                  <tr style="background: #f8fafc;">
                    <th>Sản phẩm</th>
                    <th class="text-center" style="width: 80px">SL</th>
                    <th class="text-right" style="width: 110px">Đơn giá</th>
                    <th class="text-right" style="width: 120px">Thành tiền</th>
                    <th class="text-center" style="width: 50px">Xóa</th>
                  </tr>
                </thead>
                <tbody id="quote-tbody-items">
                  <tr><td colspan="5" class="text-center text-muted p-3">Chưa có sản phẩm nào</td></tr>
                </tbody>
              </table>
            </div>

            <!-- Tổng kết & Chiết khấu & Ship -->
            <div class="quote-totals-calc card p-3 mt-3">
              <div class="summary-line">
                <span>Tổng tiền hàng:</span>
                <span class="text-bold" id="q-calc-subtotal">0 ₫</span>
              </div>
              <div class="summary-line">
                <span class="text-bold text-xs">Chiết khấu giảm giá (VNĐ):</span>
                <input type="number" id="q-calc-discount" class="form-input-sm text-right text-bold" style="width: 130px" value="${quote.discountAmount || 0}" placeholder="0 ₫">
              </div>
              <div class="summary-line">
                <span class="text-bold text-xs">Phí vận chuyển (VNĐ):</span>
                <input type="number" id="q-calc-shipping" class="form-input-sm text-right text-bold" style="width: 130px" value="${quote.shippingFee || 0}" placeholder="0 ₫">
              </div>
              ${shopSettings.enableVat ? `
                <div class="summary-line text-muted">
                  <span>VAT (${shopSettings.vatRate || 8}%):</span>
                  <span id="q-calc-vat">0 ₫</span>
                </div>
              ` : ''}
              <div class="summary-line total-highlight">
                <span class="text-bold">TỔNG CỘNG BÁO GIÁ:</span>
                <span class="text-bold text-primary text-lg" id="q-calc-grandtotal">0 ₫</span>
              </div>
              <div class="text-xs text-muted mt-1" id="q-calc-inwords">Bằng chữ: Không đồng</div>
            </div>

            <div class="form-group mt-3">
              <label class="form-label">Ghi chú & Điều khoản báo giá</label>
              <textarea id="q-notes" class="form-textarea" rows="2">${escapeHTML(quote.notes || '')}</textarea>
            </div>

            <div class="modal-footer" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px;">
              ${isEdit ? `
                <button type="button" class="btn btn-outline-danger btn-sm" id="btn-soft-delete-quote" style="margin-right: auto;">Xóa vào Thùng rác</button>
              ` : ''}
              <button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-qmodal">Hủy</button>
              <button type="submit" class="btn btn-primary btn-sm">Lưu Báo Giá</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const old = document.getElementById('quote-form-modal');
    if (old) old.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('quote-form-modal');
    const close = () => modal.remove();
    document.getElementById('btn-close-qmodal').addEventListener('click', close);
    document.getElementById('btn-cancel-qmodal').addEventListener('click', close);

    // Gán dữ liệu chọn khách
    const custSelect = document.getElementById('q-select-customer');
    const nameInp = document.getElementById('q-customer-name');
    const phoneInp = document.getElementById('q-customer-phone');
    const addrInp = document.getElementById('q-customer-address');

    custSelect.addEventListener('change', () => {
      const opt = custSelect.options[custSelect.selectedIndex];
      if (opt.value) {
        nameInp.value = opt.dataset.name || '';
        phoneInp.value = opt.dataset.phone || '';
        addrInp.value = opt.dataset.address || '';
      }
    });

    // Thêm món vào báo giá
    const qProdSearch = document.getElementById('q-product-search');
    const clearQProdBtn = document.getElementById('btn-clear-q-prod-search');
    const qSuggBox = document.getElementById('q-product-suggestions');
    const prodSelect = document.getElementById('q-add-product-select');
    const addQty = document.getElementById('q-add-qty');
    const addPrice = document.getElementById('q-add-price');
    const unitHint = document.getElementById('q-unit-hint');
    const tbody = document.getElementById('quote-tbody-items');

    const renderSelectOptions = (list) => {
      prodSelect.innerHTML = `
        <option value="">-- Hoặc bấm chọn (${list.length} món) --</option>
        ${list.map(p => `
          <option value="${p.id}" data-price="${p.sellingPrice}" data-unit="${escapeHTML(p.unit || 'Chiếc')}">
            ${escapeHTML(p.name)}
          </option>
        `).join('')}
      `;
    };

    const selectProductItem = (p) => {
      if (!p) return;
      renderSelectOptions(products);
      prodSelect.value = p.id;
      if (qProdSearch) qProdSearch.value = p.name;
      if (clearQProdBtn) clearQProdBtn.style.display = 'flex';
      if (qSuggBox) qSuggBox.style.display = 'none';
      if (unitHint) unitHint.textContent = p.unit || 'chiếc';
      if (p.sellingPrice > 0) addPrice.value = formatVND(p.sellingPrice);
      else addPrice.value = '';
    };

    if (qProdSearch) {
      const updateSearchResults = () => {
        const q = qProdSearch.value.trim().toLowerCase();
        if (clearQProdBtn) clearQProdBtn.style.display = q ? 'flex' : 'none';

        const matched = !q ? products : products.filter(p =>
          p.name.toLowerCase().includes(q) ||
          (p.code && p.code.toLowerCase().includes(q))
        );

        renderSelectOptions(matched);

        if (q) {
          if (matched.length === 0) {
            qSuggBox.innerHTML = `<div class="p-3 text-xs text-muted text-center">Không tìm thấy "${escapeHTML(qProdSearch.value)}"</div>`;
          } else {
            qSuggBox.innerHTML = matched.slice(0, 30).map(p => `
              <div class="q-sugg-item" data-id="${p.id}" style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; cursor: pointer; font-weight: 600; font-size: 14px; color: #0f172a;">
                ${escapeHTML(p.name)}
              </div>
            `).join('');

            qSuggBox.querySelectorAll('.q-sugg-item').forEach(el => {
              el.addEventListener('click', () => {
                const chosen = products.find(x => x.id === el.dataset.id);
                selectProductItem(chosen);
              });
            });
          }
          qSuggBox.style.display = 'block';
        } else {
          qSuggBox.style.display = 'none';
        }
      };

      qProdSearch.addEventListener('input', updateSearchResults);
      qProdSearch.addEventListener('focus', () => {
        if (qProdSearch.value.trim()) updateSearchResults();
      });
    }

    if (clearQProdBtn) {
      clearQProdBtn.addEventListener('click', () => {
        if (qProdSearch) qProdSearch.value = '';
        clearQProdBtn.style.display = 'none';
        if (qSuggBox) qSuggBox.style.display = 'none';
        renderSelectOptions(products);
        prodSelect.value = '';
        addPrice.value = '';
        if (unitHint) unitHint.textContent = 'chiếc';
        if (qProdSearch) qProdSearch.focus();
      });
    }

    // Ẩn danh sách gợi ý khi chạm ra ngoài
    modal.addEventListener('click', (e) => {
      if (qSuggBox && !e.target.closest('#q-product-search') && !e.target.closest('#q-product-suggestions')) {
        qSuggBox.style.display = 'none';
      }
    });

    prodSelect.addEventListener('change', () => {
      const opt = prodSelect.options[prodSelect.selectedIndex];
      if (opt && opt.value) {
        const chosen = products.find(x => x.id === opt.value);
        if (chosen) {
          if (qProdSearch) qProdSearch.value = chosen.name;
          if (clearQProdBtn) clearQProdBtn.style.display = 'flex';
          if (qSuggBox) qSuggBox.style.display = 'none';
          if (unitHint) unitHint.textContent = chosen.unit || 'chiếc';
          if (chosen.sellingPrice > 0) addPrice.value = formatVND(chosen.sellingPrice);
        }
      }
    });

    addPrice.addEventListener('blur', () => {
      const val = parseVND(addPrice.value);
      addPrice.value = val > 0 ? formatVND(val) : '';
    });

    const updateItemsView = () => {
      if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted p-3">Chưa có sản phẩm nào trong báo giá.</td></tr>`;
      } else {
        tbody.innerHTML = items.map((item, idx) => `
          <tr>
            <td>
              <div class="text-bold">${escapeHTML(item.productName)}</div>
              <div class="text-muted text-xs">Mã: ${escapeHTML(item.productCode || '---')} (${escapeHTML(item.unit || 'Chiếc')})</div>
            </td>
            <td class="text-center">
              <input type="number" class="input-q-qty form-input-xs text-center text-bold" data-idx="${idx}" min="1" value="${item.quantity}" style="width: 60px">
            </td>
            <td class="text-right">
              <input type="number" class="input-q-price form-input-xs text-right" data-idx="${idx}" min="0" value="${item.unitPrice}" style="width: 105px">
            </td>
            <td class="text-right text-bold text-primary">${formatVND(item.subtotal)}</td>
            <td class="text-center">
              <button type="button" class="btn btn-outline-danger btn-xs btn-remove-qitem" data-idx="${idx}" title="Xóa món này">🗑️</button>
            </td>
          </tr>
        `).join('');

        // Gán sự kiện chỉnh sửa dòng
        document.querySelectorAll('.input-q-qty').forEach(input => {
          input.addEventListener('change', () => {
            const idx = parseInt(input.dataset.idx, 10);
            const val = parseInt(input.value, 10) || 1;
            items[idx].quantity = val;
            items[idx].subtotal = val * items[idx].unitPrice;
            updateItemsView();
          });
        });

        document.querySelectorAll('.input-q-price').forEach(input => {
          input.addEventListener('change', () => {
            const idx = parseInt(input.dataset.idx, 10);
            const val = parseInt(input.value, 10) || 0;
            items[idx].unitPrice = val;
            items[idx].subtotal = items[idx].quantity * val;
            updateItemsView();
          });
        });

        document.querySelectorAll('.btn-remove-qitem').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx, 10);
            items.splice(idx, 1);
            updateItemsView();
          });
        });
      }

      // Tính tổng
      const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
      const discount = parseInt(document.getElementById('q-calc-discount').value, 10) || 0;
      const ship = parseInt(document.getElementById('q-calc-shipping').value, 10) || 0;
      const afterDisc = Math.max(0, subtotal - discount) + ship;

      let vat = 0;
      if (shopSettings.enableVat) {
        vat = Math.round((afterDisc * (shopSettings.vatRate || 8)) / 100);
      }
      const grandTotal = afterDisc + vat;

      document.getElementById('q-calc-subtotal').textContent = formatVND(subtotal);
      const vatEl = document.getElementById('q-calc-vat');
      if (vatEl) vatEl.textContent = formatVND(vat);
      document.getElementById('q-calc-grandtotal').textContent = formatVND(grandTotal);
      document.getElementById('q-calc-inwords').textContent = `Bằng chữ: ${numberToVietnameseWords(grandTotal)}`;
    };

    document.getElementById('btn-add-qitem').addEventListener('click', () => {
      const pId = prodSelect.value;
      if (!pId) return alert('Vui lòng chọn diều/phụ kiện cần báo giá!');
      const p = products.find(x => x.id === pId);
      const qty = parseInt(addQty.value, 10) || 1;
      const price = parseVND(addPrice.value);

      if (qty <= 0) return alert('Số lượng báo giá phải lớn hơn 0!');

      items.push({
        productId: p.id,
        productCode: p.code || '',
        productName: p.name,
        unit: p.unit || 'Chiếc',
        quantity: qty,
        unitPrice: price,
        subtotal: qty * price
      });

      // Reset form chọn món để tiện thêm tiếp
      if (qProdSearch) qProdSearch.value = '';
      if (clearQProdBtn) clearQProdBtn.style.display = 'none';
      if (qSuggBox) qSuggBox.style.display = 'none';
      renderSelectOptions(products);
      prodSelect.value = '';
      addPrice.value = '';
      addQty.value = '1';
      if (unitHint) unitHint.textContent = 'chiếc';

      updateItemsView();
    });

    document.getElementById('q-calc-discount').addEventListener('input', updateItemsView);
    document.getElementById('q-calc-shipping').addEventListener('input', updateItemsView);

    updateItemsView();

    // Xóa mềm báo giá
    const deleteBtn = document.getElementById('btn-soft-delete-quote');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (confirm(`Chuyển báo giá "${quote.id}" vào Thùng rác?`)) {
          await db.softDelete('quotations', quote.id);
          close();
          this.render();
        }
      });
    }

    // Submit lưu báo giá
    document.getElementById('quote-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const customerName = nameInp.value.trim();
      if (!customerName) return alert('Vui lòng nhập tên người nhận báo giá!');
      if (items.length === 0) return alert('Báo giá phải có ít nhất 1 sản phẩm!');

      const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
      const discountAmount = parseInt(document.getElementById('q-calc-discount').value, 10) || 0;
      const shippingFee = parseInt(document.getElementById('q-calc-shipping').value, 10) || 0;
      const afterDisc = Math.max(0, subtotal - discountAmount) + shippingFee;

      let vatAmount = 0;
      if (shopSettings.enableVat) {
        vatAmount = Math.round((afterDisc * (shopSettings.vatRate || 8)) / 100);
      }
      const totalAmount = afterDisc + vatAmount;

      const updated = {
        ...quote,
        customerId: custSelect.value || null,
        customerName,
        customerPhone: phoneInp.value.trim(),
        customerAddress: addrInp.value.trim(),
        validUntil: document.getElementById('q-valid-until').value,
        items,
        subtotal,
        discountAmount,
        shippingFee,
        vatRate: shopSettings.enableVat ? (shopSettings.vatRate || 8) : 0,
        vatAmount,
        totalAmount,
        totalInWords: numberToVietnameseWords(totalAmount),
        notes: document.getElementById('q-notes').value.trim()
      };

      await db.put('quotations', updated);
      alert(`Đã lưu báo giá ${updated.id} thành công!`);
      close();
      this.render();
      this.showQuotationPreviewModal(updated.id);
    });
  }

  // ================= MODAL XEM TRƯỚC BÁO GIÁ =================
  async showQuotationPreviewModal(quoteId) {
    const q = await db.getById('quotations', quoteId);
    if (!q) return;

    const shop = (await db.getSetting('shop_info')) || {};

    const modalHtml = `
      <div class="modal-backdrop" id="quote-preview-modal">
        <div class="modal-content modal-lg">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">📑 Báo Giá: ${escapeHTML(q.id)}</h2>
              <div class="modal-subtitle">Gửi cho: ${escapeHTML(q.customerName)} • Hạn: ${formatDate(q.validUntil)}</div>
            </div>
            <button class="modal-close" id="btn-close-qpmodal">&times;</button>
          </div>

          <div class="modal-body quote-preview-document">
            <div class="quote-doc-header">
              <div class="doc-shop-info">
                ${shop.logo ? `<img src="${shop.logo}" class="doc-logo" alt="Logo">` : ''}
                <div>
                  <h3 class="doc-shop-name">${escapeHTML(shop.shopName || 'CỬA HÀNG DIỀU')}</h3>
                  <p>📍 ${escapeHTML(shop.address || '')}</p>
                  <p>📞 Hotline: ${escapeHTML(shop.phone || '')}</p>
                </div>
              </div>
              <div class="doc-quote-meta text-right">
                <div class="doc-title-big text-primary">BÁO GIÁ</div>
                <div class="text-bold">Số: ${escapeHTML(q.id)}</div>
                <div>Ngày: ${formatDate(q.createdAt)}</div>
                <div class="text-danger">Hiệu lực đến: ${formatDate(q.validUntil)}</div>
              </div>
            </div>

            <div class="doc-cust-box">
              <div><b>Kính gửi:</b> ${escapeHTML(q.customerName)}</div>
              ${q.customerPhone ? `<div><b>Số điện thoại:</b> ${escapeHTML(q.customerPhone)}</div>` : ''}
              ${q.customerAddress ? `<div><b>Địa chỉ giao hàng:</b> ${escapeHTML(q.customerAddress)}</div>` : ''}
            </div>

            <table class="table doc-table">
              <thead>
                <tr>
                  <th class="text-center" style="width: 40px">STT</th>
                  <th>Tên sản phẩm diều / Phụ kiện</th>
                  <th class="text-center" style="width: 70px">ĐVT</th>
                  <th class="text-center" style="width: 60px">SL</th>
                  <th class="text-right" style="width: 110px">Đơn giá</th>
                  <th class="text-right" style="width: 120px">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                ${(q.items || []).map((i, idx) => `
                  <tr>
                    <td class="text-center">${idx + 1}</td>
                    <td><b>${escapeHTML(i.productName)}</b></td>
                    <td class="text-center">${escapeHTML(i.unit || 'Chiếc')}</td>
                    <td class="text-center">${i.quantity}</td>
                    <td class="text-right">${formatVND(i.unitPrice)}</td>
                    <td class="text-right text-bold">${formatVND(i.subtotal)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="doc-totals-box">
              <div class="doc-total-row">
                <span>Tiền hàng:</span>
                <span>${formatVND(q.subtotal)}</span>
              </div>
              ${q.discountAmount > 0 ? `
                <div class="doc-total-row">
                  <span>Chiết khấu:</span>
                  <span>-${formatVND(q.discountAmount)}</span>
                </div>
              ` : ''}
              ${q.shippingFee > 0 ? `
                <div class="doc-total-row">
                  <span>Phí ship:</span>
                  <span>+${formatVND(q.shippingFee)}</span>
                </div>
              ` : ''}
              ${q.vatAmount > 0 ? `
                <div class="doc-total-row">
                  <span>VAT (${q.vatRate}%):</span>
                  <span>+${formatVND(q.vatAmount)}</span>
                </div>
              ` : ''}
              <div class="doc-total-row doc-grand-total">
                <span class="text-bold">TỔNG CỘNG:</span>
                <span class="text-bold text-primary text-lg">${formatVND(q.totalAmount)}</span>
              </div>
              <div class="doc-words-row">
                <em>(Bằng chữ: ${numberToVietnameseWords(q.totalAmount)})</em>
              </div>
            </div>

            ${shop.qrCode ? `
              <div class="doc-bank-box mt-3 p-2 bg-light text-center">
                <div class="text-xs text-bold text-primary mb-1">📱 Quét mã QR thanh toán đặt cọc / chuyển khoản:</div>
                <img src="${shop.qrCode}" style="width: 120px; height: 120px; object-fit: contain; background:#fff; padding:4px; border:1px solid #cbd5e1; border-radius:6px;" alt="QR Code">
                ${shop.bankInfo ? `<div class="text-xs text-bold text-muted mt-1">${escapeHTML(shop.bankInfo)}</div>` : ''}
              </div>
            ` : (shop.bankInfo ? `
              <div class="doc-bank-box mt-3 p-2 bg-light">
                <div class="text-xs text-muted">Thông tin thanh toán qua ngân hàng:</div>
                <div class="text-sm text-bold">${escapeHTML(shop.bankInfo)}</div>
              </div>
            ` : '')}

            ${q.notes ? `
              <div class="doc-notes-box mt-2 text-xs text-muted">
                <b>Ghi chú:</b> ${escapeHTML(q.notes)}
              </div>
            ` : ''}
          </div>

          <div class="modal-footer" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px;">
            <button class="btn btn-outline-primary btn-sm" id="btn-modal-pdf">📄 Xuất PDF & Gửi Zalo</button>
            <button class="btn btn-outline-success btn-sm" id="btn-modal-excel">📊 Xuất Excel</button>
            ${q.status !== 'converted' ? `
              <button class="btn btn-success btn-sm" id="btn-modal-convert">⚡ Chuyển Thành Đơn Bán</button>
            ` : ''}
            <button class="btn btn-secondary btn-sm" id="btn-close-qpmodal2" style="margin-left: auto;">Đóng</button>
          </div>
        </div>
      </div>
    `;

    const old = document.getElementById('quote-preview-modal');
    if (old) old.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('quote-preview-modal');
    const close = () => modal.remove();
    document.getElementById('btn-close-qpmodal').addEventListener('click', close);
    document.getElementById('btn-close-qpmodal2').addEventListener('click', close);

    document.getElementById('btn-modal-pdf').addEventListener('click', () => {
      this.generateAndSharePDF(q.id);
    });

    document.getElementById('btn-modal-excel').addEventListener('click', () => {
      this.generateAndShareExcel(q.id);
    });

    const convertBtn = document.getElementById('btn-modal-convert');
    if (convertBtn) {
      convertBtn.addEventListener('click', () => {
        close();
        this.handleConvertToOrder(q.id);
      });
    }
  }

  // ================= XUẤT PDF CHUẨN TIẾNG VIỆT CÓ DẤU & CHIA SẺ =================
  async generateAndSharePDF(quoteId) {
    const q = await db.getById('quotations', quoteId);
    if (!q) return;

    const shop = (await db.getSetting('shop_info')) || {};

    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
      });

      // 1. NHÚNG FONT ROBOTO HỖ TRỢ 100% TIẾNG VIỆT CÓ DẤU
      registerVietnameseFont(doc);

      // Màu sắc chủ đạo: Xanh diều (#0284c7)
      const primaryColor = [2, 132, 199];
      const darkColor = [30, 41, 59];

      let startY = 18;

      // 2. Header: Logo và thông tin cửa hàng
      if (shop.logo) {
        try {
          doc.addImage(shop.logo, 'JPEG', 14, 12, 24, 24);
        } catch {
          // Bỏ qua nếu lỗi nén ảnh
        }
      }

      const textStartX = shop.logo ? 42 : 14;
      doc.setFont('Roboto', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(...primaryColor);
      doc.text(shop.shopName || 'CỬA HÀNG BÁN DIỀU', textStartX, startY);

      doc.setFont('Roboto', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...darkColor);
      doc.text(`Địa chỉ: ${shop.address || ''}`, textStartX, startY + 6);
      doc.text(`Hotline: ${shop.phone || ''}`, textStartX, startY + 11);

      // Tiêu đề báo giá góc trên phải
      doc.setFont('Roboto', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(...primaryColor);
      doc.text('BÁO GIÁ', 196, startY, { align: 'right' });

      doc.setFont('Roboto', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...darkColor);
      doc.text(`Số: ${q.id}`, 196, startY + 6, { align: 'right' });
      doc.text(`Ngày: ${formatDate(q.createdAt)}`, 196, startY + 11, { align: 'right' });
      doc.setTextColor(220, 38, 38); // Màu đỏ cho hạn hiệu lực
      doc.text(`Hạn hiệu lực: ${formatDate(q.validUntil)}`, 196, startY + 16, { align: 'right' });

      // Đường kẻ ngăn cách header
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.line(14, 38, 196, 38);

      // 3. Thông tin người nhận báo giá
      doc.setTextColor(...darkColor);
      doc.setFont('Roboto', 'bold');
      doc.setFontSize(10);
      doc.text('KÍNH GỬI QUÝ KHÁCH HÀNG:', 14, 45);

      doc.setFont('Roboto', 'normal');
      doc.setFontSize(9);
      doc.text(`Khách hàng: ${q.customerName || 'Quý khách'}`, 14, 51);
      if (q.customerPhone) doc.text(`Số điện thoại: ${q.customerPhone}`, 14, 56);
      if (q.customerAddress) doc.text(`Địa chỉ: ${q.customerAddress}`, 14, 61);

      const tableStartY = q.customerAddress ? 66 : 61;

      // 4. Bảng danh sách hàng hóa (dùng autoTable với font Roboto)
      const tableRows = (q.items || []).map((item, index) => [
        index + 1,
        item.productName,
        item.unit || 'Chiếc',
        item.quantity,
        formatVND(item.unitPrice),
        formatVND(item.subtotal)
      ]);

      doc.autoTable({
        startY: tableStartY,
        head: [['STT', 'Tên sản phẩm diều / Phụ kiện', 'ĐVT', 'SL', 'Đơn giá', 'Thành tiền']],
        body: tableRows,
        styles: {
          font: 'Roboto',
          fontStyle: 'normal',
          fontSize: 9,
          cellPadding: 3,
          lineColor: [226, 232, 240],
          lineWidth: 0.2
        },
        headStyles: {
          font: 'Roboto',
          fontStyle: 'bold',
          fillColor: primaryColor,
          textColor: [255, 255, 255],
          halign: 'center'
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 12 },
          1: { cellWidth: 80 },
          2: { halign: 'center', cellWidth: 20 },
          3: { halign: 'center', cellWidth: 15 },
          4: { halign: 'right', cellWidth: 28 },
          5: { halign: 'right', cellWidth: 35 }
        },
        theme: 'grid'
      });

      let finalY = doc.lastAutoTable.finalY + 6;

      // 5. Tổng tiền & Chiết khấu
      doc.setFont('Roboto', 'normal');
      doc.setFontSize(9);
      doc.text('Tiền hàng:', 130, finalY);
      doc.text(formatVND(q.subtotal), 196, finalY, { align: 'right' });

      if (q.discountAmount > 0) {
        finalY += 5;
        doc.text('Chiết khấu:', 130, finalY);
        doc.text(`-${formatVND(q.discountAmount)}`, 196, finalY, { align: 'right' });
      }

      if (q.shippingFee > 0) {
        finalY += 5;
        doc.text('Phí vận chuyển:', 130, finalY);
        doc.text(`+${formatVND(q.shippingFee)}`, 196, finalY, { align: 'right' });
      }

      if (q.vatAmount > 0) {
        finalY += 5;
        doc.text(`VAT (${q.vatRate}%):`, 130, finalY);
        doc.text(`+${formatVND(q.vatAmount)}`, 196, finalY, { align: 'right' });
      }

      finalY += 6;
      doc.setFont('Roboto', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...primaryColor);
      doc.text('TỔNG CỘNG:', 130, finalY);
      doc.text(formatVND(q.totalAmount), 196, finalY, { align: 'right' });

      // Bằng chữ
      finalY += 6;
      doc.setFont('Roboto', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...darkColor);
      const inWords = `Bằng chữ: ${numberToVietnameseWords(q.totalAmount)}`;
      doc.text(inWords, 14, finalY);

      // 6. Thông tin chuyển khoản & Ghi chú & Mã QR
      if (shop.bankInfo || shop.qrCode) {
        finalY += 8;
        const boxHeight = shop.qrCode ? 36 : 14;
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(14, finalY, 182, boxHeight, 2, 2, 'FD');
        doc.setFont('Roboto', 'bold');
        doc.setFontSize(8.5);
        doc.text('Thông tin thanh toán chuyển khoản:', 18, finalY + 5);
        if (shop.bankInfo) {
          doc.setFont('Roboto', 'normal');
          doc.text(shop.bankInfo, 18, finalY + 10);
        }
        if (shop.qrCode) {
          try {
            doc.addImage(shop.qrCode, 'JPEG', 158, finalY + 3, 30, 30);
          } catch {
            // Ignored if image format issue
          }
        }
        finalY += (boxHeight + 2);
      }

      if (q.notes) {
        finalY += 4;
        doc.setFont('Roboto', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);
        doc.text(`Ghi chú: ${q.notes}`, 14, finalY);
      }

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text('Cảm ơn quý khách đã tin tưởng và ủng hộ cửa hàng! Diều bay no gió, vạn sự hanh thông!', 105, 285, { align: 'center' });

      // Xuất Blob và chia sẻ
      const pdfBlob = doc.output('blob');
      const fileName = `BaoGia-${q.id}.pdf`;
      const res = await shareFileOrDownload(
        pdfBlob,
        fileName,
        `Báo giá diều ${q.id} - ${q.customerName}`,
        `Kính gửi ${q.customerName}, gửi bạn bản báo giá ${q.id} từ ${shop.shopName || 'Cửa Hàng Diều'}.`
      );

      // Cập nhật trạng thái 'sent'
      if (q.status === 'draft') {
        q.status = 'sent';
        await db.put('quotations', q);
        this.render();
      }
    } catch (err) {
      alert('Lỗi tạo file PDF: ' + err.message);
      console.error(err);
    }
  }

  // ================= XUẤT BÁO GIÁ RA FILE EXCEL (.XLSX) =================
  async generateAndShareExcel(quoteId) {
    const q = await db.getById('quotations', quoteId);
    if (!q) return;

    const shop = (await db.getSetting('shop_info')) || {};

    try {
      const XLSX = window.XLSX;
      if (!XLSX) {
        alert('Thư viện Excel chưa sẵn sàng');
        return;
      }

      // Tạo bảng dữ liệu Excel dạng ma trận
      const data = [
        [shop.shopName || 'CỬA HÀNG BÁN DIỀU'],
        [`Địa chỉ: ${shop.address || ''}`],
        [`Hotline: ${shop.phone || ''}`],
        [''],
        ['BẢNG BÁO GIÁ SẢN PHẨM'],
        [`Số báo giá: ${q.id}`, '', '', `Ngày báo giá: ${formatDate(q.createdAt)}`],
        [`Khách hàng: ${q.customerName}`, '', '', `Hạn hiệu lực: ${formatDate(q.validUntil)}`],
        [`Số điện thoại: ${q.customerPhone || ''}`],
        [`Địa chỉ nhận: ${q.customerAddress || ''}`],
        [''],
        ['STT', 'Mã SP', 'Tên sản phẩm', 'ĐVT', 'Số lượng', 'Đơn giá (VNĐ)', 'Thành tiền (VNĐ)']
      ];

      (q.items || []).forEach((item, idx) => {
        data.push([
          idx + 1,
          item.productCode || '',
          item.productName,
          item.unit || 'Chiếc',
          item.quantity,
          item.unitPrice,
          item.subtotal
        ]);
      });

      data.push(['']);
      data.push(['', '', '', '', '', 'Tiền hàng:', q.subtotal]);
      if (q.discountAmount > 0) {
        data.push(['', '', '', '', '', 'Chiết khấu:', -q.discountAmount]);
      }
      if (q.shippingFee > 0) {
        data.push(['', '', '', '', '', 'Phí ship:', q.shippingFee]);
      }
      if (q.vatAmount > 0) {
        data.push(['', '', '', '', '', `VAT (${q.vatRate}%):`, q.vatAmount]);
      }
      data.push(['', '', '', '', '', 'TỔNG CỘNG:', q.totalAmount]);
      data.push(['', `Bằng chữ: ${numberToVietnameseWords(q.totalAmount)}`]);
      data.push(['']);
      if (shop.bankInfo) {
        data.push(['Thông tin chuyển khoản:', shop.bankInfo]);
      }
      if (q.notes) {
        data.push(['Ghi chú:', q.notes]);
      }

      const ws = XLSX.utils.aoa_to_sheet(data);

      // Căn chỉnh độ rộng cột
      ws['!cols'] = [
        { wch: 6 },  // STT
        { wch: 14 }, // Mã
        { wch: 35 }, // Tên
        { wch: 10 }, // ĐVT
        { wch: 10 }, // SL
        { wch: 16 }, // Đơn giá
        { wch: 18 }  // Thành tiền
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Báo Giá');

      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const excelBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `BaoGia-${q.id}.xlsx`;

      await shareFileOrDownload(
        excelBlob,
        fileName,
        `File Excel Báo giá ${q.id}`,
        `Báo giá chi tiết file Excel ${q.id}`
      );
    } catch (err) {
      alert('Lỗi xuất file Excel: ' + err.message);
      console.error(err);
    }
  }

  // ================= CHUYỂN BÁO GIÁ THÀNH ĐƠN BÁN HÀNG =================
  async handleConvertToOrder(quoteId) {
    const q = await db.getById('quotations', quoteId);
    if (!q) return;

    if (q.status === 'converted') {
      alert(`Báo giá này đã được chuyển thành đơn hàng ${q.convertedOrderId} trước đó.`);
      return;
    }

    const confirmConvert = confirm(
      `Bạn có muốn chuyển Báo giá "${q.id}" thành Đơn bán hàng thực tế?\n\n` +
      `- Tự động trừ tồn kho các loại diều trong báo giá\n` +
      `- Tạo đơn hàng mới mang tên khách: ${q.customerName}\n` +
      `- Tổng tiền: ${formatVND(q.totalAmount)}`
    );

    if (!confirmConvert) return;

    // Kiểm tra tồn kho trước khi chuyển
    const allProducts = await db.getAll('products');
    const warnings = [];
    for (const item of (q.items || [])) {
      const p = allProducts.find(x => x.id === item.productId);
      const stock = p ? p.stock : 0;
      if (item.quantity > stock) {
        warnings.push(`- "${item.productName}": Tồn ${stock}, cần ${item.quantity}`);
      }
    }

    if (warnings.length > 0) {
      const continueNegative = confirm(
        `⚠️ Cảnh báo tồn kho không đủ:\n\n${warnings.join('\n')}\n\nBạn có muốn tiếp tục xuất âm kho không?`
      );
      if (!continueNegative) return;
    }

    const orderId = 'DH-' + q.id.replace('BG-', '');
    const now = new Date().toISOString();

    const orderRecord = {
      id: orderId,
      customerId: q.customerId || null,
      customerName: q.customerName || 'Khách lẻ',
      customerPhone: q.customerPhone || '',
      items: q.items.map(i => ({ ...i })),
      subtotal: q.subtotal,
      discountType: q.discountType || 'amount',
      discountValue: q.discountValue || 0,
      discountAmount: q.discountAmount || 0,
      shippingFee: q.shippingFee || 0,
      vatRate: q.vatRate || 0,
      vatAmount: q.vatAmount || 0,
      totalAmount: q.totalAmount,
      paidAmount: q.totalAmount, // Mặc định đã thanh toán hoặc chỉnh lại sau
      debtAmount: 0,
      paymentMethod: 'cash',
      status: 'completed',
      notes: `Chuyển đổi từ Báo giá ${q.id}. ${q.notes || ''}`,
      createdAt: now,
      isDeleted: false
    };

    try {
      await db.runTransaction(
        ['orders', 'products', 'inventory_logs', 'quotations'],
        'readwrite',
        (tx) => {
          const orderStore = tx.objectStore('orders');
          const productStore = tx.objectStore('products');
          const logStore = tx.objectStore('inventory_logs');
          const quoteStore = tx.objectStore('quotations');

          // 1. Tạo đơn hàng
          orderStore.put(orderRecord);

          // 2. Trừ tồn kho & ghi lịch sử
          for (const item of (q.items || [])) {
            const prodReq = productStore.get(item.productId);
            prodReq.onsuccess = () => {
              const product = prodReq.result;
              if (product) {
                const stockBefore = product.stock || 0;
                const stockAfter = stockBefore - item.quantity;
                product.stock = stockAfter;
                product.updatedAt = now;
                productStore.put(product);

                logStore.put({
                  id: 'LOG-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
                  productId: product.id,
                  productCode: product.code || '',
                  productName: product.name,
                  changeType: 'sale',
                  quantityChange: -item.quantity,
                  stockBefore,
                  stockAfter,
                  referenceId: orderId,
                  reason: `Bán từ Báo giá ${q.id} (Đơn ${orderId})`,
                  createdAt: now
                });
              }
            };
          }

          // 3. Cập nhật trạng thái báo giá
          q.status = 'converted';
          q.convertedOrderId = orderId;
          quoteStore.put(q);
        }
      );

      alert(`🎉 Đã chuyển thành đơn hàng ${orderId} thành công và tự động trừ kho!`);
      this.render();
      if (this.app.salesModule) {
        this.app.salesModule.showOrderDetailModal(orderId);
      }
    } catch (err) {
      alert('Lỗi chuyển đổi đơn hàng: ' + err.message);
    }
  }
}
