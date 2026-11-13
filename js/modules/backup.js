// Mô-đun Bảo Vệ Dữ Liệu: Sao Lưu, Khôi Phục (JSON/Paste/Excel), Bản Chụp Snapshot, Thùng Rác & Xuất Toàn Bộ Excel
import { db } from '../db.js';
import {
  formatVND,
  formatDate,
  formatDateTime,
  formatDateForInput,
  calculateChecksum,
  shareFileOrDownload,
  readFileAsText,
  downloadBlobFile,
  escapeHTML
} from '../utils.js';
import { APP_CONFIG, DEFAULT_WAREHOUSES, normalizeWarehouseIdByNameOrId } from '../config.js';
import { parseStockArray2D } from '../excel-importer.js';

function safeNormalizeWarehouse(nameOrId, warehouses = DEFAULT_WAREHOUSES) {
  if (typeof normalizeWarehouseIdByNameOrId === 'function') {
    return normalizeWarehouseIdByNameOrId(nameOrId, warehouses);
  }
  const list = Array.isArray(warehouses) ? warehouses : DEFAULT_WAREHOUSES;
  if (!nameOrId || nameOrId === 'new') {
    return list.some(w => w && w.id === 'kho-dieu') ? 'kho-dieu' : (list[0]?.id || 'stock');
  }
  const str = String(nameOrId).trim();
  const byId = list.find(w => w && w.id === str);
  if (byId) return byId.id;
  const lower = str.toLowerCase();
  const byName = list.find(w => w && w.name && w.name.trim().toLowerCase() === lower);
  if (byName) return byName.id;
  return list.some(w => w && w.id === 'kho-dieu') ? 'kho-dieu' : (list[0]?.id || 'stock');
}

export class BackupModule {
  constructor(app) {
    this.app = app;
  }

  // ================= 1. XUẤT SAO LƯU TOÀN BỘ RA FILE JSON =================
  async exportBackupFile() {
    try {
      const backupData = await db.exportFullBackup();
      const jsonStr = JSON.stringify(backupData, null, 2);
      const compactJsonStr = JSON.stringify(backupData);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });

      const now = new Date();
      const dateStr = formatDateForInput(now);
      const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      const fileName = `saoluu-dieu-${dateStr}-${timeStr}.json`;

      const productsCount = (backupData.stores.products || []).filter(p => !p.isDeleted).length;
      const customersCount = (backupData.stores.customers || []).filter(c => !c.isDeleted).length;
      const ordersCount = (backupData.stores.orders || []).filter(o => !o.isDeleted).length;
      const quotesCount = (backupData.stores.quotations || []).filter(q => !q.isDeleted).length;
      const importsCount = (backupData.stores.stock_imports || []).length;
      const sizeKB = Math.max(1, Math.round(blob.size / 1024));

      const isAllEmpty = productsCount === 0 && customersCount === 0 && ordersCount === 0;

      const modalHtml = `
        <div class="modal-backdrop" id="export-backup-modal">
          <div class="modal-content">
            <div class="modal-header">
              <h2 class="modal-title">💾 Xuất File Sao Lưu Dữ Liệu</h2>
              <button class="modal-close" id="btn-close-expmodal">&times;</button>
            </div>

            <div class="modal-body">
              <div class="card p-3 mb-3 bg-light">
                <div class="text-bold mb-1">📦 Nội dung đã đóng gói (${sizeKB} KB):</div>
                <div class="text-xs text-muted mb-2">Tên file: <code>${escapeHTML(fileName)}</code></div>
                <div class="stats-grid">
                  <div class="stat-card">
                    <div class="stat-lbl">Sản phẩm</div>
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
                <div class="text-xs text-muted mt-2">
                  ✓ Bao gồm cả Cài đặt shop, Logo, QR, Danh mục diều & ${importsCount} phiếu nhập kho.
                </div>
              </div>

              ${isAllEmpty ? `
                <div class="alert alert-warning text-xs mb-3">
                  ⚠️ <b>Chú ý:</b> Máy hiện tại đang có <b>0 sản phẩm, 0 đơn hàng</b>! Nếu bạn từng nhập hàng trên trình duyệt web (Safari/Chrome) mà nay lại mở từ icon ngoài màn hình chính (hoặc ngược lại), dữ liệu ở 2 nơi tách riêng nhau — hãy xuất từ đúng nơi có dữ liệu nhé!
                </div>
              ` : ''}

              <div class="text-xs text-muted mb-2">
                Chọn 1 trong các cách bên dưới để lưu hoặc gửi sang máy khác (bấm nút trực tiếp):
              </div>

              <div style="display: flex; flex-direction: column; gap: 10px;">
                <button type="button" class="btn btn-primary btn-block btn-lg" id="btn-exp-download" style="font-weight: 800; white-space: normal; text-align: center; line-height: 1.35;">
                  ⬇️ Tải File Sao Lưu (.json) Về Máy
                </button>

                <button type="button" class="btn btn-success btn-block btn-lg" id="btn-exp-share" style="font-weight: 800; white-space: normal; text-align: center; line-height: 1.35;">
                  📤 Gửi File Qua Zalo / Google Drive
                </button>

                <button type="button" class="btn btn-outline-primary btn-block" id="btn-exp-copy-text" style="font-weight: 700; white-space: normal; text-align: center; line-height: 1.35;">
                  📋 Sao Chép Mã Dữ Liệu (Dự phòng gửi Zalo/Tin nhắn)
                </button>
              </div>
            </div>

            <div class="modal-footer" style="justify-content: flex-end; flex-wrap: wrap; gap: 8px;">
              <button type="button" class="btn btn-secondary" id="btn-cancel-expmodal">Đóng</button>
            </div>
          </div>
        </div>
      `;

      const old = document.getElementById('export-backup-modal');
      if (old) old.remove();
      document.body.insertAdjacentHTML('beforeend', modalHtml);

      const modal = document.getElementById('export-backup-modal');
      const close = () => modal.remove();
      document.getElementById('btn-close-expmodal').addEventListener('click', close);
      document.getElementById('btn-cancel-expmodal').addEventListener('click', close);

      // 1. Tải trực tiếp đồng bộ ngay khi bấm
      document.getElementById('btn-exp-download').addEventListener('click', async () => {
        downloadBlobFile(blob, fileName);
        await db.markBackupCompleted();
        this.app.updateBackupBanner();
        alert(`✅ Đã tải file sao lưu "${fileName}" về thư mục Tải xuống (Downloads) của máy!\nHãy gửi file này sang máy kia qua Zalo hoặc Drive.`);
      });

      // 2. Chia sẻ trực tiếp (giữ nguyên user gesture)
      document.getElementById('btn-exp-share').addEventListener('click', async () => {
        const file = new File([blob], fileName, { type: 'application/json' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: `Sao lưu dữ liệu diều ${dateStr}`,
              text: `File sao lưu cửa hàng diều ngày ${dateStr}`
            });
            await db.markBackupCompleted();
            this.app.updateBackupBanner();
            return;
          } catch (err) {
            if (err.name === 'AbortError') return;
            console.warn('[Backup] Share file thất bại, chuyển sang tải xuống:', err);
          }
        }
        // Fallback tải xuống nếu máy không hỗ trợ share file .json
        downloadBlobFile(blob, fileName);
        await db.markBackupCompleted();
        this.app.updateBackupBanner();
        alert(`Trình duyệt máy này không hỗ trợ chia sẻ trực tiếp file .json. Hệ thống đã tự động tải file "${fileName}" về máy — bạn mở Zalo chọn đính kèm file đó gửi đi là được!`);
      });

      // 3. Copy text JSON dự phòng (khi iOS/Zalo WebView chặn tải file)
      document.getElementById('btn-exp-copy-text').addEventListener('click', async () => {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(compactJsonStr);
            await db.markBackupCompleted();
            this.app.updateBackupBanner();
            alert(`✅ Đã sao chép toàn bộ mã dữ liệu (${productsCount} sản phẩm, ${ordersCount} đơn hàng)!\n\nCách chuyển sang máy khác:\n1. Dán đoạn mã này gửi vào Zalo Cloud của bạn.\n2. Trên máy kia, sao chép đoạn mã rồi vào mục Nạp Dữ Liệu -> chọn "Dán mã trực tiếp" là xong!`);
            return;
          }
        } catch (err) {
          console.warn('Clipboard error:', err);
        }
        // Nếu clipboard bị chặn, hiện ô textarea để copy thủ công
        prompt('Hãy sao chép toàn bộ chuỗi dưới đây:', compactJsonStr);
      });
    } catch (err) {
      alert('Lỗi tạo bản sao lưu: ' + err.message);
      console.error(err);
    }
  }

  // ================= 2. KHÔI PHỤC / NHẬP DỮ LIỆU TỪ FILE HOẶC DÁN MÃ =================
  async promptRestoreFile() {
    const old = document.getElementById('restore-source-modal');
    if (old) old.remove();

    const modalHtml = `
      <div class="modal-backdrop" id="restore-source-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">📥 Nhập / Khôi Phục Dữ Liệu</h2>
            <button class="modal-close" id="btn-close-rsmodal">&times;</button>
          </div>

          <div class="modal-body">
            <!-- Cách 1: Chọn file trực tiếp từ input gắn thật trong DOM -->
            <div class="card p-3 mb-3 bg-light" style="border: 2px dashed #0284c7; border-radius: 12px;">
              <div class="text-bold text-primary mb-1" style="font-size: 14px;">📁 Cách 1: Chọn File Sao Lưu từ máy</div>
              <p class="text-xs text-muted mb-3">
                Hỗ trợ file sao lưu <b>.json</b> (hoặc file <b>.xlsx</b> xuất từ chức năng Xuất Excel Toàn Bộ).
              </p>

              <label for="dom-restore-file-input" class="btn btn-primary btn-block btn-lg" style="font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; margin: 0; white-space: normal; text-align: center; line-height: 1.35;">
                📂 CHỌN FILE TỪ ĐIỆN THOẠI / MÁY TÍNH
              </label>
              <input type="file" id="dom-restore-file-input" accept=".json,.xlsx,.xls,.txt,application/json,text/plain,*/*" style="position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden;">
              <div id="restore-file-status" class="text-xs text-muted mt-2 text-center"></div>
            </div>

            <!-- Cách 2: Dán mã sao lưu trực tiếp -->
            <div class="card p-3 bg-light" style="border: 1px solid #cbd5e1; border-radius: 12px;">
              <div class="text-bold mb-1" style="font-size: 14px;">📋 Cách 2: Dán Mã Dữ Liệu (Nếu không chọn được file)</div>
              <p class="text-xs text-muted mb-2">
                Nếu điện thoại bị lỗi không chọn được file từ Zalo, hãy sao chép mã dữ liệu rồi dán vào ô dưới đây:
              </p>
              <textarea id="restore-paste-textarea" class="form-textarea text-xs" rows="3" placeholder="Dán chuỗi mã sao lưu JSON bắt đầu bằng { ... } vào đây..."></textarea>
              <button type="button" class="btn btn-outline-primary btn-block btn-sm mt-2" id="btn-restore-from-paste" style="font-weight: 700; white-space: normal; text-align: center; margin-top: 8px;">
                ⚡ Đọc & Nạp Dữ Liệu Đã Dán
              </button>
            </div>
          </div>

          <div class="modal-footer" style="justify-content: flex-end; flex-wrap: wrap; gap: 8px;">
            <button type="button" class="btn btn-secondary" id="btn-cancel-rsmodal">Đóng</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('restore-source-modal');
    const close = () => modal.remove();
    document.getElementById('btn-close-rsmodal').addEventListener('click', close);
    document.getElementById('btn-cancel-rsmodal').addEventListener('click', close);

    const fileInput = document.getElementById('dom-restore-file-input');
    const statusEl = document.getElementById('restore-file-status');

    // Hàm dùng chung để xử lý chuỗi JSON sau khi đọc từ file hoặc dán text
    const processBackupJsonText = async (rawText, sourceName) => {
      const cleaned = String(rawText || '').replace(/^\uFEFF/, '').trim();
      if (!cleaned) {
        throw new Error('Nội dung file trống rỗng!');
      }

      let backupData;
      try {
        backupData = JSON.parse(cleaned);
      } catch {
        throw new Error('Nội dung không phải định dạng sao lưu JSON hợp lệ! Nếu bạn chọn nhầm ảnh hoặc PDF, hãy chọn đúng file .json.');
      }

      if (!backupData || typeof backupData !== 'object' || !backupData.stores) {
        throw new Error('File không chứa dữ liệu sao lưu hợp lệ của ứng dụng Bán Diều (thiếu trường stores).');
      }

      let skipChecksum = false;
      if (backupData.checksum) {
        const payloadStr = JSON.stringify({
          stores: backupData.stores,
          settings: backupData.settings
        });
        const calcChecksum = await calculateChecksum(payloadStr);

        if (backupData.checksum !== calcChecksum) {
          const forceProceed = confirm(
            `⚠️ CẢNH BÁO MÃ KIỂM TRA (CHECKSUM) KHÁC NHAU\n\n` +
            `File có thể đã được gửi qua ứng dụng nhắn tin làm thay đổi định dạng chữ, hoặc sao lưu từ phiên bản cũ.\n\n` +
            `Bạn có muốn tiếp tục nạp toàn bộ dữ liệu từ file này không?`
          );
          if (!forceProceed) return;
          skipChecksum = true;
        }
      } else {
        skipChecksum = true;
      }

      close();
      this.showRestorePreviewModal(backupData, sourceName, skipChecksum);
    };

    // Xử lý chọn file từ DOM input
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      statusEl.innerHTML = `<span class="text-primary">⏳ Đang đọc file <b>${escapeHTML(file.name)}</b>...</span>`;

      try {
        const lowerName = (file.name || '').toLowerCase();
        if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
          const backupData = await this._parseExcelFileToBackupData(file);
          close();
          this.showRestorePreviewModal(backupData, file.name, true);
          return;
        }

        const text = await readFileAsText(file);
        await processBackupJsonText(text, file.name);
      } catch (err) {
        statusEl.innerHTML = `<span class="text-danger text-bold">❌ ${escapeHTML(err.message)}</span>`;
        alert('Lỗi đọc file: ' + err.message);
        fileInput.value = '';
      }
    });

    // Xử lý dán mã trực tiếp
    document.getElementById('btn-restore-from-paste').addEventListener('click', async () => {
      const pasteVal = document.getElementById('restore-paste-textarea').value;
      if (!pasteVal || !pasteVal.trim()) {
        return alert('Vui lòng dán đoạn mã sao lưu vào ô trống trước!');
      }
      try {
        await processBackupJsonText(pasteVal, 'Dữ liệu dán trực tiếp');
      } catch (err) {
        alert('Lỗi đọc mã đã dán: ' + err.message);
      }
    });
  }

  /**
   * Hỗ trợ đọc file Excel (.xlsx) xuất từ "Xuất Excel Toàn Bộ" hoặc Excel kho tồn chuyển thành cấu trúc Backup
   */
  async _parseExcelFileToBackupData(file) {
    const XLSX = (typeof window !== 'undefined' && window.XLSX) ? window.XLSX : globalThis.XLSX;
    if (!XLSX) throw new Error('Thư viện đọc Excel chưa sẵn sàng.');

    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });

    const stores = {
      products: [],
      customers: [],
      orders: [],
      inventory_logs: [],
      stock_imports: [],
      quotations: [],
      debt_payments: []
    };

    const warehouses = (await db.getAllWarehouses?.()) || DEFAULT_WAREHOUSES;

    // 1. Trường hợp file là Xuất Excel Toàn Bộ Dữ Liệu (có sheet "Sản Phẩm")
    if (wb.Sheets['Sản Phẩm']) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets['Sản Phẩm'], { header: 1 });
      const headerRow = (rows[0] || []).map(h => String(h || '').trim().toLowerCase());

      const colId = headerRow.findIndex(h => h === 'id');
      const colCode = headerRow.findIndex(h => h.includes('mã'));
      const colName = headerRow.findIndex(h => h.includes('tên'));
      const colWh = headerRow.findIndex(h => h === 'kho hàng' || h === 'kho' || (h.includes('kho') && !h.includes('tồn')));
      const colCat = headerRow.findIndex(h => h.includes('danh mục') || h.includes('chủng loại'));
      const colSize = headerRow.findIndex(h => h.includes('kích thước') || h.includes('size'));
      const colColor = headerRow.findIndex(h => h.includes('màu'));
      const colUnit = headerRow.findIndex(h => h.includes('đvt') || h.includes('đơn vị'));
      const colCost = headerRow.findIndex(h => h.includes('giá nhập') || h.includes('giá vốn'));
      const colSell = headerRow.findIndex(h => h.includes('giá bán'));
      const colStock = headerRow.findIndex(h => h.includes('tồn kho') || h === 'tồn' || h.includes('số lượng'));
      const colAlert = headerRow.findIndex(h => h.includes('cảnh báo'));
      const colDeleted = headerRow.findIndex(h => h.includes('xóa'));

      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r) continue;
        const name = colName >= 0 ? r[colName] : r[2];
        if (!name) continue;

        let whVal = colWh >= 0 ? r[colWh] : 'kho-dieu';
        let warehouse = safeNormalizeWarehouse(whVal, warehouses);

        stores.products.push({
          id: (colId >= 0 && r[colId]) ? String(r[colId]) : (r[0] ? String(r[0]) : `SP-XLS-${Date.now()}-${i}`),
          code: String((colCode >= 0 ? r[colCode] : r[1]) || ''),
          name: String(name).trim(),
          category: String((colCat >= 0 ? r[colCat] : (colWh >= 0 ? r[4] : r[3])) || 'Phụ kiện diều'),
          size: String((colSize >= 0 ? r[colSize] : (colWh >= 0 ? r[5] : r[4])) || ''),
          color: String((colColor >= 0 ? r[colColor] : (colWh >= 0 ? r[6] : r[5])) || ''),
          unit: String((colUnit >= 0 ? r[colUnit] : (colWh >= 0 ? r[7] : r[6])) || 'Chiếc'),
          costPrice: Number(colCost >= 0 ? r[colCost] : (colWh >= 0 ? r[8] : r[7])) || 0,
          sellingPrice: Number(colSell >= 0 ? r[colSell] : (colWh >= 0 ? r[9] : r[8])) || 0,
          stock: Number(colStock >= 0 ? r[colStock] : (colWh >= 0 ? r[10] : r[9])) || 0,
          lowStockThreshold: Number(colAlert >= 0 ? r[colAlert] : (colWh >= 0 ? r[11] : r[10])) || 5,
          warehouse: warehouse || 'kho-dieu',
          isDeleted: String((colDeleted >= 0 ? r[colDeleted] : (colWh >= 0 ? r[12] : r[11])) || '').toUpperCase() === 'CÓ'
        });
      }
    } else if (wb.SheetNames.length > 0) {
      // Trường hợp nạp file mẫu chuẩn "Danh Sách Nhập Hàng" hoặc file Kho tồn kiểu NHẬP _ XUẤT.xlsx
      const targetSheet = wb.Sheets['Danh Sách Nhập Hàng'] || wb.Sheets[wb.SheetNames[0]];
      const rows2D = XLSX.utils.sheet_to_json(targetSheet, { header: 1 });
      const parsed = parseStockArray2D(rows2D, 'stock', warehouses);
      parsed.forEach((p, idx) => {
        stores.products.push({
          ...p,
          id: p.id || `SP-IMP-${Date.now()}-${idx}`,
          warehouse: p.warehouse || 'stock',
          isDeleted: false
        });
      });
    }

    if (wb.Sheets['Khách Hàng']) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets['Khách Hàng'], { header: 1 });
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r[1]) continue;
        stores.customers.push({
          id: r[0] ? String(r[0]) : `KH-XLS-${Date.now()}-${i}`,
          name: String(r[1] || '').trim(),
          phone: String(r[2] || ''),
          address: String(r[3] || ''),
          notes: String(r[4] || ''),
          isDeleted: String(r[5] || '').toUpperCase() === 'CÓ'
        });
      }
    }

    if (stores.products.length === 0 && stores.customers.length === 0) {
      throw new Error('Không tìm thấy dữ liệu sản phẩm hay khách hàng hợp lệ trong file Excel này! Hãy dùng file sao lưu .json để khôi phục đầy đủ nhất.');
    }

    return {
      app: APP_CONFIG.APP_NAME,
      schemaVersion: APP_CONFIG.DB_VERSION,
      exportTime: new Date().toISOString(),
      stores,
      settings: {}
    };
  }

  // Modal xem trước thông tin bản sao lưu & tùy chọn Thay thế / Gộp
  showRestorePreviewModal(backupData, originalFileName, skipChecksum = false) {
    const productsCount = (backupData.stores.products || []).filter(p => !p.isDeleted).length;
    const customersCount = (backupData.stores.customers || []).filter(c => !c.isDeleted).length;
    const ordersCount = (backupData.stores.orders || []).filter(o => !o.isDeleted).length;
    const quotesCount = (backupData.stores.quotations || []).filter(q => !q.isDeleted).length;

    const modalHtml = `
      <div class="modal-backdrop" id="restore-preview-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">🔄 Xác Nhận Khôi Phục Dữ Liệu</h2>
            <button class="modal-close" id="btn-close-rpmodal">&times;</button>
          </div>

          <div class="modal-body">
            <div class="card p-3 mb-3 bg-light">
              <div class="text-bold mb-1">📄 Nguồn: ${escapeHTML(originalFileName)}</div>
              <div class="text-sm">Thời điểm sao lưu: <b>${formatDateTime(backupData.exportTime)}</b></div>
              <div class="text-sm text-success">✓ Trạng thái file: <b>Sẵn sàng nạp vào máy</b></div>
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
              <div class="restore-mode-options" style="display: flex; flex-direction: column; gap: 8px;">
                <label class="restore-mode-card" style="display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius-md); background: #ffffff; cursor: pointer;">
                  <input type="radio" name="restore-mode" value="replace" checked style="margin-top: 3px; flex-shrink: 0;">
                  <div class="restore-mode-text" style="display: flex; flex-direction: column; gap: 2px; font-size: 13px; line-height: 1.35;">
                    <b>Thay thế toàn bộ (Khuyên dùng)</b>
                    <span>Xóa dữ liệu cũ trên máy này và nạp y hệt dữ liệu từ bản sao lưu. Thích hợp khi chuyển sang máy mới.</span>
                  </div>
                </label>

                <label class="restore-mode-card" style="display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius-md); background: #ffffff; cursor: pointer;">
                  <input type="radio" name="restore-mode" value="merge" style="margin-top: 3px; flex-shrink: 0;">
                  <div class="restore-mode-text" style="display: flex; flex-direction: column; gap: 2px; font-size: 13px; line-height: 1.35;">
                    <b>Gộp thêm dữ liệu</b>
                    <span>Giữ nguyên dữ liệu hiện có, bổ sung thêm và cập nhật theo mã từ file sao lưu.</span>
                  </div>
                </label>
              </div>
            </div>

            <div class="alert alert-info text-xs mt-3">
              🛡️ <b>TỰ ĐỘNG BẢO VỆ:</b> Dữ liệu cũ trên máy này sẽ được chụp cứu hộ tự động trước khi ghi đè.
            </div>
          </div>

          <div class="modal-footer" style="justify-content: flex-end; flex-wrap: wrap; gap: 8px;">
            <button type="button" class="btn btn-secondary" id="btn-cancel-rpmodal">Hủy</button>
            <button type="button" class="btn btn-danger" id="btn-confirm-restore" style="font-weight: 800; white-space: nowrap;">✓ Bắt Đầu Nạp Dữ Liệu</button>
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

    const btnConfirm = document.getElementById('btn-confirm-restore');
    btnConfirm.addEventListener('click', async () => {
      const mode = document.querySelector('input[name="restore-mode"]:checked').value;
      btnConfirm.disabled = true;
      btnConfirm.textContent = '⏳ Đang ghi dữ liệu vào máy...';

      try {
        const res = await db.restoreFromBackup(backupData, mode, skipChecksum);
        close();
        const c = res?.counts || {};
        alert(
          `🎉 NẠP DỮ LIỆU THÀNH CÔNG!\n\n` +
          `Đã lưu thực tế vào bộ nhớ máy này:\n` +
          `• Sản phẩm & Kho: ${c.products ?? productsCount} món\n` +
          `• Khách hàng: ${c.customers ?? customersCount} khách\n` +
          `• Đơn hàng: ${c.orders ?? ordersCount} đơn\n` +
          `• Báo giá: ${c.quotations ?? quotesCount} phiếu\n\n` +
          `Ứng dụng sẽ tải lại ngay để hiển thị dữ liệu mới!`
        );
        window.location.reload();
      } catch (err) {
        btnConfirm.disabled = false;
        btnConfirm.textContent = '✓ Bắt Đầu Nạp Dữ Liệu';
        alert('❌ LỖI NẠP DỮ LIỆU: ' + err.message);
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
      <div class="snapshot-list" style="display: flex; flex-direction: column; gap: 8px;">
        ${snapshots.map(s => `
          <div class="snapshot-item" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius-md); background: #f8fafc;">
            <div class="snapshot-info" style="min-width: 0; flex: 1 1 180px;">
              <div class="snapshot-title text-bold">${escapeHTML(s.note || 'Bản chụp tự động')}</div>
              <div class="snapshot-meta text-xs text-muted">
                ${formatDateTime(s.createdAt)} • ${s.summary?.productsCount || 0} diều, ${s.summary?.ordersCount || 0} đơn
              </div>
            </div>
            <button class="btn btn-outline-danger btn-xs btn-restore-snapshot" style="flex-shrink: 0; white-space: nowrap;" data-id="${s.id}">
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
      await db.restoreFromBackup(snap.data, 'replace', true);
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
              <div class="trash-list" style="display: flex; flex-direction: column; gap: 10px;">
                ${trashItems.map(item => `
                  <div class="trash-card" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-card); box-shadow: var(--shadow-sm);" data-store="${item._storeName}" data-id="${item.id}">
                    <div class="trash-info" style="min-width: 0; flex: 1 1 180px;">
                      <span class="badge badge-neutral">${escapeHTML(item._typeName)}</span>
                      <span class="text-bold ml-2">${escapeHTML(item.name || item.customerName || item.id)}</span>
                      <div class="text-xs text-muted mt-1" style="margin-top: 4px;">
                        Xóa lúc: ${formatDateTime(item.deletedAt)}
                      </div>
                    </div>
                    <div class="trash-actions" style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; flex-shrink: 0;">
                      <button class="btn btn-success btn-xs btn-restore-item" style="white-space: nowrap;" data-store="${item._storeName}" data-id="${item.id}">
                        ↩ Khôi phục
                      </button>
                      <button class="btn btn-outline-danger btn-xs btn-purge-item" style="white-space: nowrap;" data-store="${item._storeName}" data-id="${item.id}">
                        Xóa vĩnh viễn
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

          <div class="modal-footer" style="justify-content: flex-end; flex-wrap: wrap; gap: 8px;">
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
      const XLSX = (typeof window !== 'undefined' && window.XLSX) ? window.XLSX : globalThis.XLSX;
      if (!XLSX) return alert('Thư viện Excel chưa sẵn sàng');

      const products = await db.getAll('products', true);
      const customers = await db.getAll('customers', true);
      const orders = await db.getAll('orders', true);
      const inventoryLogs = await db.getAll('inventory_logs');
      const quotations = await db.getAll('quotations', true);
      const warehouses = (await db.getAllWarehouses?.()) || DEFAULT_WAREHOUSES;
      const whMap = new Map((warehouses || DEFAULT_WAREHOUSES).map(w => [w.id, w.name]));

      const wb = XLSX.utils.book_new();

      // Sheet 1: Sản phẩm
      const prodHeaders = ['ID', 'Mã Diều', 'Tên Sản Phẩm', 'Kho Hàng', 'Danh Mục', 'Kích Thước', 'Màu', 'ĐVT', 'Giá Nhập', 'Giá Bán', 'Tồn Kho', 'Cảnh Báo Tồn', 'Đã Xóa?'];
      const prodRows = products.map(p => [
        p.id, p.code || '', p.name, whMap.get(p.warehouse) || p.warehouse || 'Kho Diều',
        p.category || '', p.size || '', p.color || '',
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

      downloadBlobFile(excelBlob, fileName);
      alert(`✅ Đã xuất file Excel dự phòng "${fileName}" (${products.length} sản phẩm, ${customers.length} khách, ${orders.length} đơn)!`);
    } catch (err) {
      alert('Lỗi xuất Excel toàn bộ: ' + err.message);
    }
  }
}
