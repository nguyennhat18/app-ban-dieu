// Các hàm tiện ích dùng chung trong toàn bộ ứng dụng
import { APP_CONFIG } from './config.js';

/**
 * Định dạng tiền tệ VNĐ (lưu trữ luôn là số nguyên)
 * @param {number|string} amount Số tiền
 * @returns {string} Chuỗi định dạng ví dụ: "1.250.000 ₫"
 */
export function formatVND(amount) {
  const num = Math.round(Number(amount) || 0);
  return new Intl.NumberFormat('vi-VN').format(num) + ' ₫';
}

/**
 * Lấy số nguyên từ chuỗi nhập tiền tệ
 * @param {string|number} str
 * @returns {number}
 */
export function parseVND(str) {
  if (typeof str === 'number') return Math.round(str);
  if (!str) return 0;
  // Bỏ tất cả ký tự không phải số và dấu trừ
  const cleaned = str.toString().replace(/[^\d-]/g, '');
  const val = parseInt(cleaned, 10);
  return isNaN(val) ? 0 : val;
}

/**
 * Định dạng ngày theo dd/mm/yyyy theo múi giờ Việt Nam
 * @param {string|Date|number} dateVal
 * @returns {string} dd/mm/yyyy
 */
export function formatDate(dateVal) {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: APP_CONFIG.TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(d);
}

/**
 * Định dạng ngày giờ dd/mm/yyyy HH:mm
 * @param {string|Date|number} dateVal
 * @returns {string} dd/mm/yyyy HH:mm
 */
export function formatDateTime(dateVal) {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('vi-VN', {
    timeZone: APP_CONFIG.TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(d);

  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.day}/${map.month}/${map.year} ${map.hour}:${map.minute}`;
}

/**
 * Định dạng cho input type="date" (YYYY-MM-DD)
 * @param {string|Date|number} dateVal
 * @returns {string}
 */
export function formatDateForInput(dateVal = new Date()) {
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Cộng thêm số ngày vào một ngày cụ thể
 * @param {Date|string} dateVal
 * @param {number} days
 * @returns {Date}
 */
export function addDays(dateVal, days) {
  const d = new Date(dateVal);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Chuyển số tiền thành chữ tiếng Việt chuẩn xác
 * Ví dụ: 1250000 -> "Một triệu hai trăm năm mươi nghìn đồng"
 * @param {number} n
 * @returns {string}
 */
export function numberToVietnameseWords(n) {
  let num = Math.round(Number(n) || 0);
  if (num === 0) return 'Không đồng';
  if (num < 0) return 'Âm ' + numberToVietnameseWords(Math.abs(num)).toLowerCase();

  const digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

  function readGroupOfThree(threeDigits, showZeroHundred) {
    let a = Math.floor(threeDigits / 100);
    let b = Math.floor((threeDigits % 100) / 10);
    let c = threeDigits % 10;
    let res = '';

    if (a > 0 || showZeroHundred) {
      res += digits[a] + ' trăm ';
    }

    if (b > 1) {
      res += digits[b] + ' mươi ';
    } else if (b === 1) {
      res += 'mười ';
    } else if ((a > 0 || showZeroHundred) && c > 0) {
      res += 'linh ';
    }

    if (c === 1) {
      if (b > 1) res += 'mốt ';
      else res += 'một ';
    } else if (c === 4) {
      if (b > 1) res += 'tư ';
      else res += 'bốn ';
    } else if (c === 5) {
      if (b > 0) res += 'lăm ';
      else res += 'năm ';
    } else if (c > 0) {
      res += digits[c] + ' ';
    }

    return res.trim();
  }

  const scales = ['', 'nghìn', 'triệu', 'tỉ', 'nghìn tỉ', 'triệu tỉ'];
  const groups = [];
  while (num > 0) {
    groups.push(num % 1000);
    num = Math.floor(num / 1000);
  }

  let words = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const grp = groups[i];
    if (grp > 0) {
      const showZero = i < groups.length - 1;
      const grpStr = readGroupOfThree(grp, showZero);
      const scaleStr = scales[i];
      words.push((grpStr + (scaleStr ? ' ' + scaleStr : '')).trim());
    }
  }

  let fullStr = words.join(' ').trim();
  // Viết hoa chữ cái đầu và thêm đuôi "đồng"
  fullStr = fullStr.charAt(0).toUpperCase() + fullStr.slice(1) + ' đồng';
  return fullStr;
}

function sha256PureJS(text) {
  const bytes = new TextEncoder().encode(text);
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ]);
  const l = bytes.length;
  const bitLen = l * 8;
  const paddedLen = Math.ceil((l + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[l] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);

  const w = new Uint32Array(64);
  for (let i = 0; i < paddedLen; i += 64) {
    for (let t = 0; t < 16; t++) {
      w[t] = view.getUint32(i + t * 4, false);
    }
    for (let t = 16; t < 64; t++) {
      const s0 = ((w[t - 15] >>> 7) | (w[t - 15] << 25)) ^ ((w[t - 15] >>> 18) | (w[t - 15] << 14)) ^ (w[t - 15] >>> 3);
      const s1 = ((w[t - 2] >>> 17) | (w[t - 2] << 15)) ^ ((w[t - 2] >>> 19) | (w[t - 2] << 13)) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ ((~e) & g);
      const temp1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return Array.from(H).map(x => x.toString(16).padStart(8, '0')).join('');
}

/**
 * Tính mã băm Checksum (SHA-256) đồng nhất trên cả HTTP, HTTPS và mọi thiết bị
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function calculateChecksum(text) {
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback sang pure-JS SHA-256 bên dưới
    }
  }
  return sha256PureJS(text);
}

/**
 * Đọc nội dung text từ File tương thích 100% với Android WebView, iOS Safari & PC (tự bỏ UTF-8 BOM)
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('Không có file nào được chọn'));
    if (typeof FileReader !== 'undefined') {
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || '').replace(/^\uFEFF/, '').trim();
        resolve(text);
      };
      reader.onerror = () => reject(new Error('Không thể đọc nội dung file trên thiết bị này'));
      reader.readAsText(file, 'UTF-8');
    } else if (file.text) {
      file.text().then(t => resolve(t.replace(/^\uFEFF/, '').trim())).catch(reject);
    } else {
      reject(new Error('Trình duyệt không hỗ trợ đọc file'));
    }
  });
}

/**
 * Tải trực tiếp Blob xuống máy bằng thẻ <a> (tránh lỗi hết hạn user gesture trên Safari/Android)
 */
export function downloadBlobFile(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (a.parentNode) document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1500);
}

/**
 * Nén ảnh trước khi lưu vào IndexedDB (giới hạn tối đa 600px, nén jpeg chất lượng 0.7)
 * @param {File|Blob} file
 * @param {number} maxDim
 * @param {number} quality
 * @returns {Promise<string>} Base64 data URL
 */
export function compressImage(file, maxDim = 600, quality = 0.7) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return reject(new Error('File không phải là hình ảnh hợp lệ'));
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Không thể đọc file ảnh'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Lỗi tải file ảnh'));
    reader.readAsDataURL(file);
  });
}

/**
 * Sinh mã tự động (ID hoặc Code)
 * @param {string} prefix
 * @returns {string}
 */
export function generateId(prefix = 'ID') {
  const now = new Date();
  const datePart = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${datePart}-${randomPart}`;
}

/**
 * Chia sẻ file qua Web Share API hoặc tải xuống nếu không hỗ trợ
 * @param {Blob} blob File blob
 * @param {string} fileName Tên file xuất ra
 * @param {string} title Tiêu đề chia sẻ
 * @param {string} text Nội dung chia sẻ
 */
export async function shareFileOrDownload(blob, fileName, title, text) {
  const file = new File([blob], fileName, { type: blob.type });

  // Thử Web Share API trước
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: title || fileName,
        text: text || ''
      });
      return { method: 'share', success: true };
    } catch (err) {
      if (err.name === 'AbortError') {
        // Người dùng tự hủy chia sẻ
        return { method: 'share', cancelled: true };
      }
      console.warn('Web Share thất bại, chuyển sang tải file:', err);
    }
  }

  // Tải file xuống bằng thẻ <a>
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 300);
  return { method: 'download', success: true };
}

/**
 * Thoát ký tự HTML chống XSS khi hiển thị dữ liệu
 * @param {string} str
 * @returns {string}
 */
export function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Thêm món vào danh sách phiếu nhập kho: nếu đã có cùng ID hoặc trùng tên thì chỉ cộng dồn số lượng.
 * @param {Array} items
 * @param {object} product
 * @param {number} qty
 * @returns {Array}
 */
export function addOrMergeStockImportItem(items, product, qty) {
  const list = Array.isArray(items) ? items : [];
  const addQty = Math.trunc(Number(qty) || 0);
  if (!product || addQty <= 0) return list;

  const normName = String(product.name || '').trim().toLowerCase();
  const existing = list.find(
    item =>
      (product.id && item.productId === product.id) ||
      (normName && String(item.productName || '').trim().toLowerCase() === normName)
  );

  if (existing) {
    existing.quantity = (existing.quantity || 0) + addQty;
  } else {
    list.push({
      productId: product.id,
      productCode: product.code || '',
      productName: product.name,
      quantity: addQty
    });
  }
  return list;
}

/**
 * Gộp danh sách sản phẩm nhập mới với danh sách hiện có:
 * nếu trùng tên (không phân biệt hoa thường/khoảng trắng thừa) thì chỉ cộng thêm số lượng tồn.
 * @param {Array} existingProducts
 * @param {Array} incomingProducts
 * @param {string} nowIso
 * @returns {{ added: number, merged: number, recordsToSave: Array }}
 */
export function mergeImportedProductsByName(existingProducts, incomingProducts, nowIso = new Date().toISOString()) {
  const byName = new Map();
  for (const p of (existingProducts || [])) {
    if (!p || p.isDeleted) continue;
    const key = String(p.name || '').trim().toLowerCase();
    if (key && !byName.has(key)) {
      byName.set(key, p);
    }
  }

  const touchedById = new Map();
  let added = 0;
  let merged = 0;

  for (const raw of (incomingProducts || [])) {
    if (!raw || !String(raw.name || '').trim()) continue;
    const key = String(raw.name).trim().toLowerCase();
    const qtyToAdd = Math.max(0, Math.trunc(Number(raw.stock) || 0));
    const existing = byName.get(key);

    if (existing) {
      const updated = touchedById.get(existing.id) || { ...existing };
      updated.stock = (Number(updated.stock) || 0) + qtyToAdd;
      updated.updatedAt = nowIso;
      byName.set(key, updated);
      touchedById.set(updated.id, updated);
      merged++;
    } else {
      const created = { ...raw, stock: qtyToAdd, updatedAt: raw.updatedAt || nowIso };
      byName.set(key, created);
      touchedById.set(created.id, created);
      added++;
    }
  }

  return {
    added,
    merged,
    recordsToSave: Array.from(touchedById.values())
  };
}
