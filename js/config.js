// Cấu hình hệ thống và hằng số mặc định
export const APP_CONFIG = {
  APP_NAME: 'Cửa Hàng Diều',
  APP_VERSION: '1.0.0',
  DB_NAME: 'KiteStoreDB',
  DB_VERSION: 1,
  SNAPSHOT_DB_NAME: 'KiteStoreSnapshotsDB',
  SNAPSHOT_MAX_COUNT: 7, // Giữ 7 bản chụp hàng ngày gần nhất
  TIMEZONE: 'Asia/Ho_Chi_Minh',
  CURRENCY: 'VND',
  BACKUP_REMINDER_DAYS: 3, // Nhắc nếu quá 3 ngày chưa sao lưu
  BACKUP_REMINDER_CHANGES: 20 // Nhắc nếu quá 20 thay đổi chưa sao lưu
};

export const DEFAULT_SHOP_SETTINGS = {
  shopName: 'Cửa Hàng Diều Bay Cao',
  phone: '0901 234 567',
  address: '123 Đường Cánh Diều, Phường Gió Lộng, TP. Hồ Chí Minh',
  bankInfo: 'Vietcombank - STK: 0123456789 - NGUYEN VAN A',
  bankBin: '',
  bankName: '',
  bankAccount: '',
  bankAccountName: '',
  logo: '', // Base64 image
  qrCode: '', // Base64 image mã QR thanh toán (VietQR / Ngân hàng / Momo)
  quoteValidityDays: 7, // Số ngày hiệu lực báo giá
  enableVat: false, // Mặc định không có VAT
  vatRate: 8, // 8% nếu bật
  lastBackupTime: null,
  unbackedChangesCount: 0
};

export const PRODUCT_CATEGORIES = [
  'Diều khí động học',
  'Diều sáo truyền thống',
  'Diều rồng / Phượng hoàng',
  'Diều đại bàng / Động vật',
  'Diều trẻ em hoạt hình',
  'Sáo diều & Âm thanh',
  'Cuộn guồng & Dây thả diều',
  'Phụ kiện & Đồ nghề diều'
];

export const PRODUCT_UNITS = [
  'Chiếc',
  'Cái',
  'Bộ',
  'Cuộn',
  'Ống',
  'Cặp'
];

export const DEFAULT_WAREHOUSES = [
  { id: 'kho-ao-dieu', name: 'Kho Áo Diều', icon: '👕' },
  { id: 'kho-nan-dieu', name: 'Kho Nan Diều', icon: '🎋' },
  { id: 'kho-pass-inox', name: 'Kho Pass Inox', icon: '🔩' },
  { id: 'kho-thanh-cai', name: 'Kho Thanh Cái, Vai Diều', icon: '📏' },
  { id: 'kho-guong-inox', name: 'Kho Guồng Inox', icon: '🎡' },
  { id: 'kho-day-dieu', name: 'Kho Dây Diều', icon: '🧵' },
  { id: 'kho-sao-dieu', name: 'Kho Sáo Diều', icon: '🎶' },
  { id: 'kho-dieu', name: 'Kho Diều', icon: '🪁' },
  { id: 'kho-combo', name: 'Kho Combo Về Tự Làm', icon: '🧰' },
  { id: 'stock', name: 'Kho Tồn', icon: '📦' }
];

/**
 * Chuẩn hóa ID kho hàng, tự động ánh xạ dữ liệu cũ ('new' hoặc rỗng) về 'kho-dieu'
 * @param {string} warehouseId
 * @param {Array} warehouses
 * @returns {string}
 */
export function normalizeWarehouseId(warehouseId, warehouses = DEFAULT_WAREHOUSES) {
  const list = Array.isArray(warehouses) ? warehouses : DEFAULT_WAREHOUSES;
  if (!warehouseId || warehouseId === 'new') {
    return list.some(w => w.id === 'kho-dieu') ? 'kho-dieu' : (list[0]?.id || 'stock');
  }
  if (list.some(w => w.id === warehouseId)) {
    return warehouseId;
  }
  return list[0]?.id || 'stock';
}

export const PAYMENT_METHODS = {
  cash: 'Tiền mặt',
  qr: 'Quét mã QR',
  transfer: 'Chuyển khoản',
  debt: 'Ghi nợ',
  partial: 'Trả một phần'
};

export const ORDER_STATUS = {
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy'
};

export const QUOTE_STATUS = {
  draft: 'Bản nháp',
  sent: 'Đã gửi khách',
  converted: 'Đã chuyển thành đơn',
  expired: 'Hết hiệu lực'
};
