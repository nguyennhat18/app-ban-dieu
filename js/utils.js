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

/**
 * Tính mã băm Checksum (SHA-256) cho chuỗi dữ liệu (dùng cho sao lưu & khôi phục)
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
      // Fallback nếu subtle crypto không khả dụng
    }
  }
  // Fallback simple 32-bit FNV-1a hash
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
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
