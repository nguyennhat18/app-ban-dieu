// Báo Cáo Doanh Thu, Lợi Nhuận Gộp, Sản Phẩm Bán Chạy, Tồn Kho & Xuất Excel
import { db } from '../db.js';
import {
  formatVND,
  formatDate,
  formatDateForInput,
  shareFileOrDownload,
  escapeHTML
} from '../utils.js';

export class ReportsModule {
  constructor(app) {
    this.app = app;
    this.period = 'today'; // 'today' | 'week' | 'month' | 'custom'
    this.customStartDate = formatDateForInput(new Date());
    this.customEndDate = formatDateForInput(new Date());
  }

  async render() {
    const container = document.getElementById('view-container');
    const orders = await db.getAll('orders');
    const products = await db.getAll('products');

    // Xác định khoảng thời gian lọc
    const { start, end } = this.getDateRange();

    // Lọc các đơn hoàn thành trong khoảng thời gian
    const periodOrders = orders.filter(o => {
      if (o.status === 'cancelled') return false;
      const orderDate = new Date(o.createdAt);
      return orderDate >= start && orderDate <= end;
    });

    // 1. Tính toán Doanh thu, Giá vốn, Lợi nhuận gộp
    let totalRevenue = 0;
    let totalCostOfGoods = 0;
    let totalCash = 0;
    let totalTransfer = 0;
    let totalDebt = 0;
    const productSalesMap = {};

    for (const o of periodOrders) {
      totalRevenue += (o.totalAmount || 0);

      // Phân bổ phương thức thanh toán
      if (o.paymentMethod === 'cash') {
        totalCash += (o.paidAmount || 0);
      } else if (o.paymentMethod === 'transfer') {
        totalTransfer += (o.paidAmount || 0);
      } else if (o.paymentMethod === 'partial') {
        totalCash += (o.paidAmount || 0);
      }
      totalDebt += (o.debtAmount || 0);

      // Tính giá vốn từng mặt hàng trong đơn
      for (const item of (o.items || [])) {
        const itemCost = (item.costPrice || 0) * (item.quantity || 0);
        totalCostOfGoods += itemCost;

        // Thống kê diều bán chạy
        if (!productSalesMap[item.productId]) {
          productSalesMap[item.productId] = {
            id: item.productId,
            name: item.productName,
            unit: item.unit || 'Chiếc',
            quantity: 0,
            revenue: 0
          };
        }
        productSalesMap[item.productId].quantity += item.quantity;
        productSalesMap[item.productId].revenue += item.subtotal;
      }
    }

    const grossProfit = totalRevenue - totalCostOfGoods;

    // 2. Top sản phẩm bán chạy
    const topProducts = Object.values(productSalesMap).sort((a, b) => b.quantity - a.quantity).slice(0, 5);

    // 3. Tồn kho hiện tại & Giá trị tồn kho
    let totalStockQty = 0;
    let totalStockCostValue = 0;
    let totalStockSellValue = 0;
    const lowStockItems = [];

    for (const p of products) {
      totalStockQty += (p.stock || 0);
      totalStockCostValue += (p.stock || 0) * (p.costPrice || 0);
      totalStockSellValue += (p.stock || 0) * (p.sellingPrice || 0);

      if (p.stock <= (p.lowStockThreshold || 5)) {
        lowStockItems.push(p);
      }
    }

    lowStockItems.sort((a, b) => a.stock - b.stock);

    container.innerHTML = `
      <div class="view-header">
        <div class="header-title-row">
          <div>
            <h1 class="view-title">📊 Báo Cáo Kinh Doanh & Tồn Kho</h1>
            <p class="view-subtitle">Doanh thu, lợi nhuận gộp, hàng bán chạy và tồn kho</p>
          </div>
          <button id="btn-export-report-excel" class="btn btn-outline-success btn-sm">
            📊 Xuất Báo Cáo Excel
          </button>
        </div>

        <!-- Bộ lọc thời gian -->
        <div class="report-period-selector">
          <div class="category-tabs-scroll">
            <button class="cat-pill ${this.period === 'today' ? 'active' : ''}" data-period="today">Hôm nay</button>
            <button class="cat-pill ${this.period === 'week' ? 'active' : ''}" data-period="week">7 ngày qua</button>
            <button class="cat-pill ${this.period === 'month' ? 'active' : ''}" data-period="month">Tháng này</button>
            <button class="cat-pill ${this.period === 'custom' ? 'active' : ''}" data-period="custom">Tùy chọn ngày</button>
          </div>

          ${this.period === 'custom' ? `
            <div class="custom-date-range-row mt-2">
              <span>Từ:</span>
              <input type="date" id="rep-start-date" class="form-input-sm" value="${this.customStartDate}">
              <span>Đến:</span>
              <input type="date" id="rep-end-date" class="form-input-sm" value="${this.customEndDate}">
              <button class="btn btn-primary btn-sm" id="btn-apply-custom-date">Lọc</button>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Banner nhắc nhở kinh doanh -->
      <div class="business-alert-note">
        💡 <b>GHI CHÚ QUAN TRỌNG:</b> Doanh thu <u>không phải</u> là lợi nhuận! Lợi nhuận gộp bằng Doanh thu trừ Giá vốn nhập hàng.
      </div>

      <!-- Lưới chỉ số tổng quan -->
      <div class="stats-overview-grid">
        <div class="stat-big-card card-revenue">
          <div class="stat-big-lbl">DOANH THU BÁN DIỀU</div>
          <div class="stat-big-val text-primary">${formatVND(totalRevenue)}</div>
          <div class="stat-big-sub">${periodOrders.length} đơn hàng thành công</div>
        </div>

        <div class="stat-big-card card-profit">
          <div class="stat-big-lbl">LỢI NHUẬN GỘP (LÃI)</div>
          <div class="stat-big-val text-success">${formatVND(grossProfit)}</div>
          <div class="stat-big-sub">Giá vốn hàng bán: ${formatVND(totalCostOfGoods)}</div>
        </div>

        <div class="stat-big-card">
          <div class="stat-big-lbl">DÒNG TIỀN THU VỀ</div>
          <div class="stat-pay-breakdown">
            <div>💵 Tiền mặt: <b>${formatVND(totalCash)}</b></div>
            <div>🏦 Chuyển khoản: <b>${formatVND(totalTransfer)}</b></div>
            <div>📝 Ghi nợ mới: <b class="text-danger">${formatVND(totalDebt)}</b></div>
          </div>
        </div>
      </div>

      <!-- Khối tồn kho hiện tại -->
      <div class="card p-3 mb-3">
        <h3 class="card-title">📦 Giá Trị Tồn Kho Hiện Tại</h3>
        <div class="stock-summary-row">
          <div class="stock-summary-col">
            <span class="text-muted text-xs">Tổng số lượng diều:</span>
            <span class="text-bold text-lg">${totalStockQty} cái</span>
          </div>
          <div class="stock-summary-col">
            <span class="text-muted text-xs">Tổng vốn đang tồn:</span>
            <span class="text-bold text-lg text-primary">${formatVND(totalStockCostValue)}</span>
          </div>
          <div class="stock-summary-col">
            <span class="text-muted text-xs">Giá trị theo giá bán:</span>
            <span class="text-bold text-lg text-success">${formatVND(totalStockSellValue)}</span>
          </div>
        </div>
      </div>

      <!-- Top sản phẩm bán chạy -->
      <div class="card p-3 mb-3">
        <h3 class="card-title">🔥 Diều & Phụ Kiện Bán Chạy Trong Kỳ</h3>
        ${topProducts.length === 0 ? `
          <p class="text-muted text-center py-2 text-sm">Chưa có giao dịch bán nào trong khoảng thời gian này.</p>
        ` : `
          <div class="top-products-list">
            ${topProducts.map((p, idx) => `
              <div class="top-prod-item">
                <span class="top-rank ${idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : ''}">#${idx + 1}</span>
                <div class="top-prod-info">
                  <div class="top-prod-name text-bold">${escapeHTML(p.name)}</div>
                  <div class="text-muted text-xs">Doanh thu: ${formatVND(p.revenue)}</div>
                </div>
                <div class="top-prod-qty text-bold text-primary">
                  ${p.quantity} ${escapeHTML(p.unit)}
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <!-- Cảnh báo hàng sắp hết -->
      <div class="card p-3 mb-3">
        <h3 class="card-title text-danger">⚠️ Danh Sách Hàng Sắp Hết (Dưới Mức Cảnh Báo)</h3>
        ${lowStockItems.length === 0 ? `
          <p class="text-success text-sm py-2">✓ Tất cả các loại diều đều đang đủ tồn kho an toàn.</p>
        ` : `
          <div class="low-stock-table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Tên diều / Phụ kiện</th>
                  <th>Mã</th>
                  <th class="text-center">Tồn kho</th>
                  <th class="text-center">Định mức</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${lowStockItems.map(p => `
                  <tr>
                    <td><b>${escapeHTML(p.name)}</b></td>
                    <td class="text-muted text-xs">${escapeHTML(p.code || '---')}</td>
                    <td class="text-center text-bold text-danger">${p.stock} ${escapeHTML(p.unit || 'cái')}</td>
                    <td class="text-center text-muted">${p.lowStockThreshold || 5}</td>
                    <td class="text-right">
                      <button class="btn btn-outline-primary btn-xs btn-quick-import" data-id="${p.id}">📥 Nhập</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;

    this.bindEvents(periodOrders, products, {
      totalRevenue,
      totalCostOfGoods,
      grossProfit,
      totalCash,
      totalTransfer,
      totalDebt,
      topProducts,
      totalStockCostValue
    });
  }

  getDateRange() {
    const now = new Date();
    let start = new Date();
    let end = new Date();

    if (this.period === 'today') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (this.period === 'week') {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (this.period === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (this.period === 'custom') {
      start = new Date(this.customStartDate + 'T00:00:00');
      end = new Date(this.customEndDate + 'T23:59:59');
    }

    return { start, end };
  }

  bindEvents(periodOrders, products, reportStats) {
    document.querySelectorAll('.report-period-selector .cat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        this.period = btn.dataset.period;
        this.render();
      });
    });

    const applyDateBtn = document.getElementById('btn-apply-custom-date');
    if (applyDateBtn) {
      applyDateBtn.addEventListener('click', () => {
        this.customStartDate = document.getElementById('rep-start-date').value;
        this.customEndDate = document.getElementById('rep-end-date').value;
        this.render();
      });
    }

    const exportBtn = document.getElementById('btn-export-report-excel');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        this.exportReportExcel(periodOrders, products, reportStats);
      });
    }

    document.querySelectorAll('.btn-quick-import').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.app.inventoryModule) {
          this.app.navigateTo('inventory');
          this.app.inventoryModule.activeTab = 'import';
          this.app.inventoryModule.render();
          this.app.inventoryModule.showImportModal();
        }
      });
    });
  }

  // ================= XUẤT BÁO CÁO EXCEL =================
  async exportReportExcel(periodOrders, products, stats) {
    try {
      const XLSX = window.XLSX;
      if (!XLSX) return alert('Thư viện Excel chưa sẵn sàng');

      const wb = XLSX.utils.book_new();

      // Sheet 1: Tổng quan kết quả kinh doanh
      const summaryData = [
        ['BÁO CÁO KẾT QUẢ KINH DOANH'],
        [`Kỳ báo cáo: ${this.period === 'today' ? 'Hôm nay' : this.period === 'week' ? '7 ngày qua' : this.period === 'month' ? 'Tháng này' : 'Tùy chọn'}`],
        [`Ngày xuất file: ${formatDate(new Date())}`],
        [''],
        ['Chỉ số', 'Giá trị (VNĐ)'],
        ['Tổng doanh thu bán diều', stats.totalRevenue],
        ['Giá vốn hàng bán (COGS)', stats.totalCostOfGoods],
        ['Lợi nhuận gộp (Lãi gộp)', stats.grossProfit],
        ['Tiền mặt thu về', stats.totalCash],
        ['Chuyển khoản thu về', stats.totalTransfer],
        ['Công nợ mới phát sinh', stats.totalDebt],
        ['Số đơn hàng thành công', periodOrders.length],
        [''],
        ['LƯU Ý:', 'Doanh thu không phải là lợi nhuận! Lợi nhuận = Doanh thu - Giá vốn']
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Tổng Quan');

      // Sheet 2: Danh sách đơn hàng trong kỳ
      const orderHeaders = ['Mã Đơn', 'Ngày Giờ', 'Khách Hàng', 'SĐT', 'Tổng Tiền (VNĐ)', 'PTTT', 'Nợ (VNĐ)'];
      const orderRows = periodOrders.map(o => [
        o.id,
        formatDate(o.createdAt),
        o.customerName,
        o.customerPhone || '',
        o.totalAmount,
        o.paymentMethod,
        o.debtAmount
      ]);
      const wsOrders = XLSX.utils.aoa_to_sheet([orderHeaders, ...orderRows]);
      XLSX.utils.book_append_sheet(wb, wsOrders, 'Đơn Hàng Trong Kỳ');

      // Sheet 3: Danh sách diều bán chạy
      const topHeaders = ['Tên Sản Phẩm', 'ĐVT', 'Số Lượng Bán', 'Doanh Thu (VNĐ)'];
      const topRows = stats.topProducts.map(p => [
        p.name,
        p.unit,
        p.quantity,
        p.revenue
      ]);
      const wsTop = XLSX.utils.aoa_to_sheet([topHeaders, ...topRows]);
      XLSX.utils.book_append_sheet(wb, wsTop, 'Bán Chạy');

      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const excelBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `BaoCaoKinhDoanh-${formatDateForInput(new Date())}.xlsx`;

      await shareFileOrDownload(excelBlob, fileName, 'Báo cáo kinh doanh', 'Báo cáo doanh thu & lợi nhuận diều');
    } catch (err) {
      alert('Lỗi xuất báo cáo Excel: ' + err.message);
    }
  }
}
