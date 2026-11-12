/**
 * Offline EMVCo / NAPAS 247 VietQR Generator & Renderer.
 * 100% client-side, zero CDN / network calls.
 */
import { encodeQRMatrix } from './vendor/qrcode-gen.js';

export const NAPAS_BANKS = [
  { bin: '970436', shortName: 'Vietcombank', name: 'Ngân hàng TMCP Ngoại thương Việt Nam' },
  { bin: '970415', shortName: 'VietinBank', name: 'Ngân hàng TMCP Công thương Việt Nam' },
  { bin: '970418', shortName: 'BIDV', name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam' },
  { bin: '970405', shortName: 'Agribank', name: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam' },
  { bin: '970407', shortName: 'Techcombank', name: 'Ngân hàng TMCP Kỹ thương Việt Nam' },
  { bin: '970422', shortName: 'MBBank', name: 'Ngân hàng TMCP Quân đội' },
  { bin: '970416', shortName: 'ACB', name: 'Ngân hàng TMCP Á Châu' },
  { bin: '970432', shortName: 'VPBank', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng' },
  { bin: '970423', shortName: 'TPBank', name: 'Ngân hàng TMCP Tiên Phong' },
  { bin: '970403', shortName: 'Sacombank', name: 'Ngân hàng TMCP Sài Gòn Thương Tín' },
  { bin: '970437', shortName: 'HDBank', name: 'Ngân hàng TMCP Phát triển TP. Hồ Chí Minh' },
  { bin: '970441', shortName: 'VIB', name: 'Ngân hàng TMCP Quốc tế Việt Nam' },
  { bin: '970443', shortName: 'SHB', name: 'Ngân hàng TMCP Sài Gòn - Hà Nội' },
  { bin: '970440', shortName: 'SeABank', name: 'Ngân hàng TMCP Đông Nam Á' },
  { bin: '970431', shortName: 'Eximbank', name: 'Ngân hàng TMCP Xuất Nhập khẩu Việt Nam' },
  { bin: '970426', shortName: 'MSB', name: 'Ngân hàng TMCP Hàng Hải Việt Nam' },
  { bin: '970448', shortName: 'OCB', name: 'Ngân hàng TMCP Phương Đông' },
  { bin: '970449', shortName: 'LPBank', name: 'Ngân hàng TMCP Lộc Phát Việt Nam' },
  { bin: '970428', shortName: 'NamABank', name: 'Ngân hàng TMCP Nam Á' },
  { bin: '970452', shortName: 'KienlongBank', name: 'Ngân hàng TMCP Kiên Long' },
  { bin: '970425', shortName: 'ABBank', name: 'Ngân hàng TMCP An Bình' },
  { bin: '970409', shortName: 'BacABank', name: 'Ngân hàng TMCP Bắc Á' },
  { bin: '970454', shortName: 'BVBank', name: 'Ngân hàng TMCP Bản Việt' },
  { bin: '546034', shortName: 'Cake', name: 'Ngân hàng số Cake by VPBank' },
  { bin: '546035', shortName: 'Ubank', name: 'Ngân hàng số Ubank by VPBank' },
  { bin: '963388', shortName: 'Timo', name: 'Ngân hàng số Timo by BVBank' },
  { bin: '970433', shortName: 'VietBank', name: 'Ngân hàng TMCP Việt Nam Thương Tín' },
  { bin: '970419', shortName: 'NCB', name: 'Ngân hàng TMCP Quốc Dân' },
  { bin: '970430', shortName: 'PGBank', name: 'Ngân hàng TMCP Thịnh vượng và Phát triển' },
  { bin: '970400', shortName: 'Saigonbank', name: 'Ngân hàng TMCP Sài Gòn Công Thương' }
];

function tlv(tag, value) {
  const str = String(value);
  const len = String(str.length).padStart(2, '0');
  return `${tag}${len}${str}`;
}

function toBase64(str) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf8').toString('base64');
  }
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Normalize transfer content for NAPAS 247 VietQR:
 * - Replace đ/Đ with d/D
 * - Strip Vietnamese combining diacritics
 * - Keep only [A-Za-z0-9 ]
 * - Collapse whitespace, trim, truncate to max 25 characters
 */
export function normalizeTransferContent(text) {
  return String(text ?? '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 25)
    .trim();
}

/**
 * CRC-16/CCITT-FALSE (poly=0x1021, init=0xFFFF, xorOut=0x0000, no reflection)
 * computed over UTF-8 bytes of str. Returns 4-char uppercase hex.
 */
export function crc16ccitt(str) {
  const bytes = new TextEncoder().encode(String(str ?? ''));
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Construct EMVCo / NAPAS 247 VietQR TLV payload string.
 */
export function buildVietQRString({ bankBin, accountNumber, amount = 0, description = '' } = {}) {
  const cleanBin = String(bankBin ?? '').replace(/\D/g, '');
  const cleanAccount = String(accountNumber ?? '').trim().replace(/[^A-Za-z0-9]/g, '');

  if (!cleanBin || cleanBin.length < 6) {
    throw new Error('Mã BIN ngân hàng NAPAS không hợp lệ');
  }
  if (!cleanAccount) {
    throw new Error('Số tài khoản ngân hàng không hợp lệ');
  }

  const numericAmount = Number(amount);
  const roundedAmount = Number.isFinite(numericAmount) ? Math.round(numericAmount) : 0;
  const hasAmount = roundedAmount > 0;

  // Tag 38: Merchant Account Information (NAPAS 247 QRIBFTTA)
  const beneficiaryInfo = tlv('00', cleanBin) + tlv('01', cleanAccount);
  const napasInfo =
    tlv('00', 'A000000727') +
    tlv('01', beneficiaryInfo) +
    tlv('02', 'QRIBFTTA');

  let payload =
    tlv('00', '01') +
    tlv('01', hasAmount ? '12' : '11') +
    tlv('38', napasInfo) +
    tlv('53', '704');

  if (hasAmount) {
    payload += tlv('54', String(roundedAmount));
  }

  payload += tlv('58', 'VN');

  const normalizedDesc = normalizeTransferContent(description);
  if (normalizedDesc) {
    payload += tlv('62', tlv('08', normalizedDesc));
  }

  const payloadWithCrcTag = `${payload}6304`;
  return `${payloadWithCrcTag}${crc16ccitt(payloadWithCrcTag)}`;
}

function resolveQRText(paramsOrText) {
  if (typeof paramsOrText === 'string') {
    return paramsOrText;
  }
  if (paramsOrText && typeof paramsOrText === 'object') {
    return buildVietQRString(paramsOrText);
  }
  throw new Error('Invalid QR payload input');
}

/**
 * Generate 2D boolean matrix for a QR text string.
 */
export function generateQRMatrix(qrText) {
  return encodeQRMatrix(qrText);
}

/**
 * Render VietQR code offline as a PNG data URL via offscreen canvas
 * (with 4-module white quiet zone), falling back to an SVG data URL if canvas is unavailable.
 */
export function renderVietQRDataUrl(paramsOrText, sizePx = 280) {
  const qrText = resolveQRText(paramsOrText);
  const matrix = generateQRMatrix(qrText);
  const quiet = 4;
  const totalModules = matrix.length + quiet * 2;

  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    if (ctx) {
      const scale = Math.max(2, Math.floor(sizePx / totalModules));
      const dim = totalModules * scale;
      canvas.width = dim;
      canvas.height = dim;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, dim, dim);

      ctx.fillStyle = '#000000';
      for (let r = 0; r < matrix.length; r++) {
        const row = matrix[r];
        for (let c = 0; c < row.length; c++) {
          if (row[c]) {
            ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
          }
        }
      }
      return canvas.toDataURL('image/png');
    }
  }

  // Crisp SVG data URL fallback for environments without DOM canvas (e.g., Node.js)
  let pathData = '';
  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r];
    let c = 0;
    while (c < row.length) {
      if (!row[c]) {
        c++;
        continue;
      }
      const start = c;
      while (c < row.length && row[c]) c++;
      pathData += `M${start + quiet},${r + quiet}h${c - start}v1h-${c - start}z`;
    }
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} ${totalModules}" ` +
    `width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges">` +
    `<rect width="100%" height="100%" fill="#ffffff"/>` +
    `<path fill="#000000" d="${pathData}"/></svg>`;
  return `data:image/svg+xml;base64,${toBase64(svg)}`;
}

/**
 * Draw crisp vector QR code (white background + 4-module quiet zone + black modules)
 * directly onto a jsPDF document instance.
 */
export function drawVietQRToJsPdf(doc, paramsOrText, x, y, sizeMm) {
  if (!doc || typeof doc.setFillColor !== 'function' || typeof doc.rect !== 'function') {
    throw new Error('Invalid jsPDF document instance');
  }
  const qrText = resolveQRText(paramsOrText);
  const matrix = generateQRMatrix(qrText);
  const quiet = 4;
  const totalModules = matrix.length + quiet * 2;
  const cell = sizeMm / totalModules;
  const pad = Math.min(0.02, cell * 0.04);

  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, sizeMm, sizeMm, 'F');

  doc.setFillColor(0, 0, 0);
  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r];
    let c = 0;
    while (c < row.length) {
      if (!row[c]) {
        c++;
        continue;
      }
      const start = c;
      while (c < row.length && row[c]) c++;
      const runLen = c - start;
      doc.rect(
        x + (start + quiet) * cell,
        y + (r + quiet) * cell,
        runLen * cell + pad,
        cell + pad,
        'F'
      );
    }
  }

  return qrText;
}

/**
 * Check whether shop settings have valid offline VietQR bank configuration.
 */
export function hasVietQRConfig(shop) {
  if (!shop || typeof shop !== 'object') return false;
  const cleanBin = String(shop.bankBin ?? '').replace(/\D/g, '');
  const cleanAccount = String(shop.bankAccount ?? '').trim().replace(/[^A-Za-z0-9]/g, '');
  return cleanBin.length >= 6 && cleanAccount.length > 0;
}

/**
 * Resolve QR payload and renderable image for an order / debt / quotation.
 * Uses dynamic offline VietQR when configured; falls back to static shop.qrCode if present;
 * returns null if neither is configured.
 */
export function resolveOrderQR(shop, amount = 0, description = '') {
  if (!shop || typeof shop !== 'object') return null;

  const normalizedDesc = normalizeTransferContent(description);

  if (hasVietQRConfig(shop)) {
    const cleanBin = String(shop.bankBin ?? '').replace(/\D/g, '');
    const cleanAccount = String(shop.bankAccount ?? '').trim().replace(/[^A-Za-z0-9]/g, '');
    const matchedBank = NAPAS_BANKS.find((b) => b.bin === cleanBin);
    const bankLabel =
      String(shop.bankName ?? '').trim() ||
      (matchedBank ? matchedBank.shortName : `BIN ${cleanBin}`);

    const qrText = buildVietQRString({
      bankBin: cleanBin,
      accountNumber: cleanAccount,
      amount,
      description: normalizedDesc
    });
    const dataUrl = renderVietQRDataUrl(qrText);

    return {
      type: 'vietqr',
      qrText,
      dataUrl,
      normalizedDesc,
      bankLabel,
      account: cleanAccount,
      accountName: String(shop.bankAccountName ?? '').trim()
    };
  }

  if (shop.qrCode) {
    return {
      type: 'static',
      qrText: '',
      dataUrl: shop.qrCode,
      normalizedDesc,
      bankLabel: String(shop.bankInfo ?? '').trim(),
      account: '',
      accountName: ''
    };
  }

  return null;
}
