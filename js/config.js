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

export const DEFAULT_WAREHOUSE_CATEGORIES = {
  'kho-ao-dieu': [
    'Áo diều sáo truyền thống',
    'Áo diều khí động học',
    'Áo diều đại trà',
    'Áo diều ghép màu',
    'Áo diều mini'
  ],
  'kho-nan-dieu': [
    'Nan carbon xoắn',
    'Nan carbon đặc',
    'Nan cáp quang',
    'Nan tre vót sẵn',
    'Nan bụng / Nan cánh'
  ],
  'kho-pass-inox': [
    'Pass khóa sáo',
    'Pass chữ T',
    'Pass khớp nối',
    'Pass khóa cánh',
    'Phụ kiện pass inox 304'
  ],
  'kho-thanh-cai': [
    'Thanh cái carbon',
    'Thanh cái tre',
    'Vai diều dẹp',
    'Ống nối sống diều'
  ],
  'kho-guong-inox': [
    'Guồng tay inox',
    'Guồng trợ lực',
    'Guồng nhôm',
    'Bát guồng & Tay quay'
  ],
  'kho-day-dieu': [
    'Dây amiang chịu lực',
    'Dây dù đan tròn',
    'Dây cáp quang',
    'Dây bọc thép',
    'Cuộn dây thả diều'
  ],
  'kho-sao-dieu': [
    'Sáo còi D40 D50',
    'Sáo chuông & hòa âm',
    'Sáo đàn còi',
    'Miệng sáo gỗ / nhôm',
    'Ống sáo sáp & sáo tre'
  ],
  'kho-dieu': [
    'Diều sáo hoàn thiện',
    'Diều khí động học',
    'Diều đại trà',
    'Diều rồng / Phượng hoàng',
    'Diều mini'
  ],
  'kho-combo': [
    'Combo diều tự ráp',
    'Combo nan + áo + pass',
    'Kit phụ kiện diều tự làm'
  ],
  'stock': [
    'Nan carbon & Nan diều',
    'Pass & Phụ kiện nối',
    'Cuộn guồng & Dây thả diều',
    'Sáo diều & Âm thanh',
    'Phụ kiện & Đồ nghề diều'
  ]
};

/**
 * Lấy danh sách chủng loại mặc định theo kho hàng
 * @param {string} warehouseId
 * @returns {string[]} Mảng bản sao các chủng loại mặc định
 */
export function getDefaultCategoriesForWarehouse(warehouseId) {
  if (warehouseId && DEFAULT_WAREHOUSE_CATEGORIES[warehouseId]) {
    return [...DEFAULT_WAREHOUSE_CATEGORIES[warehouseId]];
  }
  if (warehouseId === 'new' && DEFAULT_WAREHOUSE_CATEGORIES['kho-dieu']) {
    return [...DEFAULT_WAREHOUSE_CATEGORIES['kho-dieu']];
  }
  return ['Chủng loại 1', 'Chủng loại 2'];
}

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

/**
 * Chuẩn hóa mã kho từ ID hoặc Tên kho hàng
 * Khớp chính xác ID, hoặc tên kho (không phân biệt hoa thường sau khi trim),
 * hoặc fallback về normalizeWarehouseId(nameOrId, warehouses).
 * @param {string} nameOrId
 * @param {Array} warehouses
 * @returns {string}
 */
export function normalizeWarehouseIdByNameOrId(nameOrId, warehouses = DEFAULT_WAREHOUSES) {
  const list = Array.isArray(warehouses) ? warehouses : DEFAULT_WAREHOUSES;
  if (!nameOrId) {
    return normalizeWarehouseId(nameOrId, list);
  }
  const str = String(nameOrId).trim();

  // 1. Khớp chính xác ID
  const byId = list.find(w => w && w.id === str);
  if (byId) return byId.id;

  // 2. Khớp theo tên (trim & lowercase)
  const lower = str.toLowerCase();
  const byName = list.find(w => w && w.name && w.name.trim().toLowerCase() === lower);
  if (byName) return byName.id;

  // 3. Fallback
  return normalizeWarehouseId(nameOrId, list);
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
