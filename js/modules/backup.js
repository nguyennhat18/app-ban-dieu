// Mô-đun Bảo Vệ Dữ Liệu: Sao Lưu, Khôi Phục, Bản Chụp Snapshot, Thùng Rác & Xuất Toàn Bộ Excel
import { db } from '../db.js';
import {
  formatVND,
  formatDate,
  formatDateTime,
  formatDateForInput,
  calculateChecksum,
  shareFileOrDownload,
  escapeHTML
} from '../utils.js';
import { APP_CONFIG } from '../config.js';

export class BackupModule {
  constructor(app) {
    this.app = app;
  }

  // ================= 1. XUẤT SAO LƯU TOÀN BỘ RA FILE JSON =================
  async exportBackupFile() {
    try {
      const backupData = await db.exportFullBackup();
      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });

      const now = new Date();
      const dateStr = formatDateForInput(now);
      const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      const fileName = `saoluu-dieu-${dateStr}-${timeStr}.json`;

      // Chia sẻ qua Web Share API (Zalo, Drive, Gmail) hoặc tải xuống
      const result = await shareFileOrDownload(
        blob,
        fileName,
        `Sao lưu dữ liệu diều ${dateStr}`,
        `File sao lưu toàn bộ dữ liệu cửa hàng diều ngày ${dateStr}. Vui lòng cất giữ an toàn trên Zalo Cloud hoặc Google Drive.`
      );

      // Đánh dấu đã sao lưu thành công
      await db.markBackupCompleted();
      this.app.updateBackupBanner();

      alert(
        `✅ SAO LƯU THÀNH CÔNG!\n\n` +
        `- Tên file: ${fileName}\n` +
        `- Mã kiểm tra (Checksum): ${backupData.checksum.slice(0, 12)}...\n` +
        `- Hãy gửi file này vào Cloud Zalo hoặc Google Drive để bảo vệ dữ liệu khi mất hoặc đổi điện thoại.`
      );
    } catch (err) {
      alert('Lỗi sao lưu: ' + err.message);
      console.error(err);
    }
  }

  // ================= 2. KHÔI PHỤC DỮ LIỆU TỪ FILE JSON =================
  async promptRestoreFile() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';

    fileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        let backupData;
        try {
          backupData = JSON.parse(text);
        } catch {
          throw new Error('File không phải định dạng JSON hợp lệ!');
        }

        // Kiểm tra hợp lệ dữ liệu
        if (!backupData.stores || !backupData.checksum) {
          throw new Error('File sao lưu thiếu dữ liệu hoặc không phải bản sao lưu của ứng dụng!');
        }

        // Kiểm tra mã băm Checksum
        const payloadStr = JSON.stringify({
          stores: backupData.stores,
          settings: backupData.settings
        });
        const calcChecksum = await calculateChecksum(payloadStr);

        if (backupData.checksum !== calcChecksum) {
          const forceProceed = confirm(
            `⚠️ CẢNH BÁO MÃ CHECKSUM KHÔNG KHỚP!\n\n` +
            `Mã trong file: ${backupData.checksum}\n` +
            `Mã tính được: ${calcChecksum}\n\n` +
            `File có thể đã bị sửa đổi thủ công hoặc bị hỏng một phần. Bạn có muốn bỏ qua và tiếp tục nạp không?`
          );
          if (!forceProceed) return;
        }

        // Hiển thị modal xem trước và lựa chọn chế độ khôi phục
        this.showRestorePreviewModal(backupData, file.name);
      } catch (err) {
        alert('Lỗi đọc file sao lưu: ' + err.message);
      }
    };

    fileInput.click();
  }

  // Modal xem trước thông tin bản sao lưu & tùy chọn Thay thế / Gộp
  showRestorePreviewModal(backupData, originalFileName) {
    const productsCount = (backupData.stores.products || []).filter(p => !p.isDeleted).length;
    const customersCount = (backupData.stores.customers || []).filter(c => !c.isDeleted).length;
    const ordersCount = (backupData.stores.orders || []).filter(o => !o.isDeleted).length;
    const quotesCount = (backupData.stores.quotations || []).filter(q => !q.isDeleted).length;

    const modalHtml = `
      <div class="modal-backdrop" id="restore-preview-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">🔄 Khôi Phục Dữ Liệu</h2>
            <button class="modal-close" id="btn-close-rpmodal">&times;</button>
          </div>

          <div class="modal-body">
            <div class="card p-3 mb-3 bg-light">
              <div class="text-bold mb-1">📄 Tên file: ${escapeHTML(originalFileName)}</div>
              <div class="text-sm">Thời điểm sao lưu: <b>${formatDateTime(backupData.exportTime)}</b></div>
              <div class="text-sm">Phiên bản dữ liệu: <b>v${backupData.schemaVersion || 1}</b></div>
              <div class="text-sm text-success">✓ Kiểm tra toàn vẹn Checksum: <b>Hợp lệ</b></div>
            </div>

            <div class="stats-grid mb-3">
              <div class="stat-card">
                <div class="stat-lbl">Sản phẩm diều</div>
                <div class="stat-val text-primary">${productsCount}</div>
              </div>
              <div class="stat-card">
                <div class="stat-lbl">Khách hàng</div>
                <div class="stat-val">${customersCount}</div>
              </div>
              <div class="stat-card">
                <div class="stat-lbl">Đơn hàng</div>
                <div class="stat-val text-bold">${ordersCount}</div>
              </div>
              <div class="stat-card">
                <div class="stat-lbl">Báo giá</div>
                <div class="stat-val">${quotesCount}</div>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label text-bold">Chọn chế độ khôi phục:</label>
              <div class="restore-mode-options">
                <label class="restore-mode-card">
                  <input type="radio" name="restore-mode" value="replace" checked>
                  <div class="restore-mode-text">
                    <b>Thay thế toàn bộ (Khuyên dùng)</b>
                    <span>Xóa trắng dữ liệu hiện tại trên máy và nạp lại toàn bộ từ file sao lưu. Thích hợp khi đổi sang máy mới.</span>
                  </div>
                </label>

                <label class="restore-mode-card">
                  <input type="radio" name="restore-mode" value="merge">
                  <div class="restore-mode-text">
                    <b>Gộp dữ liệu</b>
                    <span>Giữ nguyên dữ liệu hiện tại, bổ sung thêm các bản ghi từ file sao lưu.</span>
                  </div>
                </label>
              </div>
            </div>

            <div class="alert alert-info text-xs mt-3">
              🛡️ <b>TỰ ĐỘNG BẢO VỆ:</b> Ứng dụng sẽ tự động chụp một bản sao lưu cứu hộ (Snapshot) của máy hiện tại ngay trước khi nạp. Nếu có sự cố bạn có thể hoàn tác lại bất kỳ lúc nào.
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn btn-secondary" id="btn-cancel-rpmodal">Hủy</button>
            <button class="btn btn-danger" id="btn-confirm-restore">✓ Bắt Đầu Khôi Phục</button>
          </div>
        </div>
      </div>
    `;

    const old = document.getElementById('restore-preview-modal');
    if (old) old.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('restore-preview-modal');
    const close = () => modal.remove();
    document.getElementById('btn-close-rpmodal').addEventListener('click', close);
    document.getElementById('btn-cancel-rpmodal').addEventListener('click', close);

    document.getElementById('btn-confirm-restore').addEventListener('click', async () => {
      const mode = document.querySelector('input[name="restore-mode"]:checked').value;
      close();

      try {
        await db.restoreFromBackup(backupData, mode);
        alert('🎉 KHÔI PHỤC DỮ LIỆU THÀNH CÔNG!\nỨng dụng sẽ tự động tải lại dữ liệu mới.');
        window.location.reload();
      } catch (err) {
        alert('Lỗi khôi phục: ' + err.message);
      }
    });
  }

  // ================= 3. DANH SÁCH BẢN CHỤP HÀNG NGÀY (7 NGÀY GẦN NHẤT) =================
  async renderSnapshotsSection() {
    const snapshots = await db.getAllSnapshots();

    if (snapshots.length === 0) {
      return `
        <div class="empty-state-sm text-center py-2 text-muted">
          Chưa có bản chụp tự động nào (bản chụp đầu tiên sẽ được tạo khi bạn dùng app sang ngày mới).
        </div>
      `;
    }

    return `
      <div class="snapshot-list">
        ${snapshots.map(s => `
          <div class="snapshot-item">
            <div class="snapshot-info">
              <div class="snapshot-title text-bold">${escapeHTML(s.note || 'Bản chụp tự động')}</div>
              <div class="snapshot-meta text-xs text-muted">
                ${formatDateTime(s.createdAt)} • ${s.summary?.productsCount || 0} diều, ${s.summary?.ordersCount || 0} đơn
              </div>
            </div>
            <button class="btn btn-outline-danger btn-xs btn-restore-snapshot" data-id="${s.id}">
              Khôi phục lại
            </button>
          </div>
        `).join('')}
      </div>
    `;
  }

  async restoreFromSnapshot(snapshotId) {
    const snapshots = await db.getAllSnapshots();
    const snap = snapshots.find(s => s.id === snapshotId);
    if (!snap || !snap.data) return alert('Không tìm thấy bản chụp');

    const confirmRestore = confirm(
      `Bạn có chắc chắn muốn khôi phục lại dữ liệu từ:\n` +
      `"${snap.note}" (${formatDateTime(snap.createdAt)})?\n\n` +
      `Một bản chụp cứu hộ mới sẽ được tự động tạo trước khi khôi phục.`
    );

    if (!confirmRestore) return;

    try {
      await db.restoreFromBackup(snap.data, 'replace');
      alert('✓ Đã khôi phục dữ liệu từ bản chụp thành công!');
      window.location.reload();
    } catch (err) {
      alert('Lỗi khôi phục bản chụp: ' + err.message);
    }
  }

  // ================= 4. THÙNG RÁC (KHÔI PHỤC XÓA MỀM) =================
  async showTrashModal() {
    const trashItems = await db.getTrashItems();

    const modalHtml = `
      <div class="modal-backdrop" id="trash-modal">
        <div class="modal-content modal-lg">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">🗑️ Thùng Rác (Xóa Mềm)</h2>
              <div class="modal-subtitle">Các mục bị xóa được giữ tại đây để khôi phục khi cần</div>
            </div>
            <button class="modal-close" id="btn-close-trash">&times;</button>
          </div>

          <div class="modal-body">
            ${trashItems.length === 0 ? `
              <div class="empty-state">
                <p class="empty-icon">✨</p>
                <p class="empty-title">Thùng rác đang trống!</p>
                <p class="empty-desc">Không có sản phẩm, khách hàng hay đơn hàng nào bị xóa.</p>
              </div>
            ` : `
              <div class="trash-list">
                ${trashItems.map(item => `
                  <div class="trash-card" data-store="${item._storeName}" data-id="${item.id}">
                    <div class="trash-info">
                      <span class="badge badge-neutral">${escapeHTML(item._typeName)}</span>
                      <span class="text-bold ml-2">${escapeHTML(item.name || item.customerName || item.id)}</span>
                      <div class="text-xs text-muted mt-1">
                        Xóa lúc: ${formatDateTime(item.deletedAt)}
                      </div>
                    </div>
                    <div class="trash-actions">
                      <button class="btn btn-success btn-xs btn-restore-item" data-store="${item._storeName}" data-id="${item.id}">
                        ↩ Khôi phục
                      </button>
                      <button class="btn btn-outline-danger btn-xs btn-purge-item" data-store="${item._storeName}" data-id="${item.id}">
                        Xóa vĩnh viễn
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

          <div class="modal-footer">
            <button class="btn btn-secondary" id="btn-close-trash2">Đóng</button>
          </div>
        </div>
      </div>
    `;

    const old = document.getElementById('trash-modal');
    if (old) old.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('trash-modal');
    const close = () => modal.remove();
    document.getElementById('btn-close-trash').addEventListener('click', close);
    document.getElementById('btn-close-trash2').addEventListener('click', close);

    document.querySelectorAll('.btn-restore-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        const store = btn.dataset.store;
        const id = btn.dataset.id;
        await db.restoreSoftDelete(store, id);
        alert('Đã khôi phục mục này thành công!');
        this.showTrashModal(); // Render lại modal thùng rác
        this.app.renderCurrentView();
      });
    });

    document.querySelectorAll('.btn-purge-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        const store = btn.dataset.store;
        const id = btn.dataset.id;
        if (confirm('CẢNH BÁO: Hành động này sẽ xóa vĩnh viễn mục này khỏi máy và không thể khôi phục từ thùng rác nữa. Bạn có chắc không?')) {
          await db.permanentDelete(store, id);
          this.showTrashModal();
        }
      });
    });
  }

  // ================= 5. XUẤT TOÀN BỘ EXCEL DỰ PHÒNG =================
  async exportAllDataToExcel() {
    try {
      const XLSX = window.XLSX;
      if (!XLSX) return alert('Thư viện Excel chưa sẵn sàng');

      const products = await db.getAll('products', true);
      const customers = await db.getAll('customers', true);
      const orders = await db.getAll('orders', true);
      const inventoryLogs = await db.getAll('inventory_logs');
      const quotations = await db.getAll('quotations', true);

      const wb = XLSX.utils.book_new();

      // Sheet 1: Sản phẩm
      const prodHeaders = ['ID', 'Mã Diều', 'Tên Sản Phẩm', 'Danh Mục', 'Kích Thước', 'Màu', 'ĐVT', 'Giá Nhập', 'Giá Bán', 'Tồn Kho', 'Cảnh Báo Tồn', 'Đã Xóa?'];
      const prodRows = products.map(p => [
        p.id, p.code || '', p.name, p.category || '', p.size || '', p.color || '',
        p.unit || 'Chiếc', p.costPrice || 0, p.sellingPrice || 0, p.stock || 0,
        p.lowStockThreshold || 5, p.isDeleted ? 'CÓ' : 'KHÔNG'
      ]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([prodHeaders, ...prodRows]), 'Sản Phẩm');

      // Sheet 2: Khách hàng
      const custHeaders = ['ID', 'Tên Khách Hàng', 'Số Điện Thoại', 'Địa Chỉ', 'Ghi Chú', 'Đã Xóa?'];
      const custRows = customers.map(c => [
        c.id, c.name, c.phone || '', c.address || '', c.notes || '', c.isDeleted ? 'CÓ' : 'KHÔNG'
      ]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([custHeaders, ...custRows]), 'Khách Hàng');

      // Sheet 3: Đơn hàng
      const orderHeaders = ['Mã Đơn', 'Ngày Giờ', 'Khách Hàng', 'SĐT', 'Tổng Tiền', 'Đã Trả', 'Còn Nợ', 'PTTT', 'Trạng Thái'];
      const orderRows = orders.map(o => [
        o.id, formatDateTime(o.createdAt), o.customerName || 'Khách lẻ',
        o.customerPhone || '', o.totalAmount, o.paidAmount, o.debtAmount,
        o.paymentMethod, o.status === 'cancelled' ? 'Đã hủy' : 'Hoàn thành'
      ]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([orderHeaders, ...orderRows]), 'Đơn Hàng');

      // Sheet 4: Lịch sử kho
      const logHeaders = ['Mã Log', 'Thời Gian', 'Tên Diều', 'Loại Thay Đổi', 'Số Lượng', 'Tồn Trước', 'Tồn Sau', 'Lý Do'];
      const logRows = inventoryLogs.map(l => [
        l.id, formatDateTime(l.createdAt), l.productName,
        l.changeType, l.quantityChange, l.stockBefore, l.stockAfter, l.reason
      ]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([logHeaders, ...logRows]), 'Lịch Sử Kho');

      // Sheet 5: Báo giá
      const quoteHeaders = ['Số Báo Giá', 'Ngày Lập', 'Khách Hàng', 'Hạn Hiệu Lực', 'Tổng Tiền', 'Trạng Thái'];
      const quoteRows = quotations.map(q => [
        q.id, formatDate(q.createdAt), q.customerName, formatDate(q.validUntil),
        q.totalAmount, q.status
      ]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([quoteHeaders, ...quoteRows]), 'Báo Giá');

      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const excelBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `DuPhong-ToanBoDuLieu-${formatDateForInput(new Date())}.xlsx`;

      await shareFileOrDownload(excelBlob, fileName, 'Bản sao lưu Excel toàn bộ dữ liệu', 'Bản sao lưu Excel tất cả các bảng');
    } catch (err) {
      alert('Lỗi xuất Excel toàn bộ: ' + err.message);
    }
  }
}
