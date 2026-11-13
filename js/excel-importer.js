// Bộ Xử Lý Đọc & Nhập File Excel/CSV Vào Kho Tồn (Smart Kite Inventory Parser)
import { formatVND, parseVND, downloadBlobFile } from './utils.js';
import {
  DEFAULT_WAREHOUSES,
  normalizeWarehouseIdByNameOrId,
  DEFAULT_WAREHOUSE_CATEGORIES
} from './config.js';

export function detectCategory(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('sáo') || n.includes('còi')) return 'Sáo diều & Âm thanh';
  if (n.includes('nan') || n.includes('thanh cái')) return 'Nan carbon & Nan diều';
  if (n.includes('pass') || n.includes('ốc') || n.includes('nối') || n.includes('phip') || n.includes('chặn pass')) return 'Pass & Phụ kiện nối';
  if (n.includes('dây') || n.includes('amiang') || n.includes('chỉ may') || n.includes('cáp quang')) return 'Cuộn guồng & Dây thả diều';
  if (n.includes('áo') || n.includes('vải')) return 'Áo diều & Vải dù';
  if (n.includes('guồng') || n.includes('simano') || n.includes('găng tay')) return 'Cuộn guồng & Dây thả diều';
  if (n.includes('đèn')) return 'Đèn diều & Phụ kiện';
  return 'Phụ kiện diều';
}

export function detectUnit(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('cuộn')) return 'Cuộn';
  if (n.includes('(kg)') || n.includes(' kg')) return 'Kg';
  if (n.includes('mét') || n.includes(' mét') || n.includes('/mét')) return 'Mét';
  if (n.includes('bộ') || n.includes('sáo 5') || n.includes('sáo 3')) return 'Bộ';
  if (n.includes('cặp')) return 'Cặp';
  return 'Chiếc';
}

// Fallback danh mục theo kho trong trường hợp import độc lập
const FALLBACK_WAREHOUSE_CATEGORIES = {
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

// 69 Mặt hàng trích xuất nguyên gốc từ file Excel tồn kho của cửa hàng
export const SAMPLE_STOCK_INVENTORY = [
  { name: 'Nan đen xoắn 85cm', stock: 4, costPrice: 11000, sellingPrice: 15000, supplier: 'Cửa hàng', importDate: '2026-05-13' },
  { name: 'Dây china 1ly1 thả 1m7', stock: 0, costPrice: 40000, sellingPrice: 120000, supplier: 'Mai Ngọc', importDate: '2026-05-13' },
  { name: 'Pass buộc', stock: 1, costPrice: 11000, sellingPrice: 15000, supplier: 'Cửa hàng', importDate: '2026-05-13' },
  { name: 'Dây amiang 1ly2 cuộn 500m', stock: 0, costPrice: 500000, sellingPrice: 760000, supplier: 'Mai Ngọc', importDate: '2026-05-13' },
  { name: 'cáp quang 2ly mét', stock: 1, costPrice: 2000, sellingPrice: 4000, supplier: 'Cửa hàng', importDate: '' },
  { name: 'Dây china 1ly5', stock: 0, costPrice: 175000, sellingPrice: 250000, supplier: '', importDate: '' },
  { name: 'Đèn diều 02 bóng chóa siêu sáng', stock: 1, costPrice: 90000, sellingPrice: 120000, supplier: 'Huân nguyễn', importDate: '2026-05-10' },
  { name: 'Dây china 2ly', stock: 0, costPrice: 180000, sellingPrice: 260000, supplier: '', importDate: '' },
  { name: 'Dây china 2ly5', stock: 0, costPrice: 180000, sellingPrice: 260000, supplier: '', importDate: '' },
  { name: 'Chỉ may 0,9 thả diều 1m2(16 cuộn)', stock: 0, costPrice: 93125, sellingPrice: 120000, supplier: '', importDate: '' },
  { name: 'Áo 1m6 in nhiệt', stock: 0, costPrice: 40000, sellingPrice: 80000, supplier: '', importDate: '' },
  { name: 'Áo 1m7 in nhiệt', stock: 0, costPrice: 55000, sellingPrice: 80000, supplier: 'Mai Ngọc', importDate: '2026-05-13' },
  { name: 'Áo 2m in nhiệt', stock: 0, costPrice: 100000, sellingPrice: 180000, supplier: '', importDate: '' },
  { name: 'Áo 2m5 in nhiệt', stock: 0, costPrice: 125000, sellingPrice: 250000, supplier: '', importDate: '' },
  { name: 'Áo 2m cờ đỏ vải Rip', stock: 0, costPrice: 240000, sellingPrice: 350000, supplier: '', importDate: '' },
  { name: 'Áo 2m5 cờ đỏ vải Rip', stock: 0, costPrice: 315000, sellingPrice: 420000, supplier: 'Nga Phạm', importDate: '' },
  { name: 'Áo 3m cờ đỏ vải Rip', stock: 0, costPrice: 370000, sellingPrice: 480000, supplier: 'Mai Ngọc', importDate: '2026-05-13' },
  { name: 'Áo 3m phối màu vải Rip', stock: 0, costPrice: 480000, sellingPrice: 600000, supplier: '', importDate: '' },
  { name: 'Áo 2m5 xương cá vải Rip', stock: 0, costPrice: 400000, sellingPrice: 560000, supplier: '', importDate: '' },
  { name: 'Nan đen xoắn 1m1', stock: 0, costPrice: 13000, sellingPrice: 25000, supplier: '', importDate: '' },
  { name: 'Nan đen xoắn dầy 1m25', stock: 0, costPrice: 23000, sellingPrice: 35000, supplier: '', importDate: '' },
  { name: 'Nan đen xoắn 1m63', stock: 0, costPrice: 50000, sellingPrice: 80000, supplier: '', importDate: '' },
  { name: 'Nan xanh vip 88cm', stock: 0, costPrice: 15000, sellingPrice: 30000, supplier: '', importDate: '' },
  { name: 'Nan xanh vip 1m1', stock: 0, costPrice: 22000, sellingPrice: 30000, supplier: '', importDate: '' },
  { name: 'Nan xanh vip 1m25', stock: 0, costPrice: 22000, sellingPrice: 50000, supplier: '', importDate: '' },
  { name: 'Nan Xanh đen ánh kim 1m53', stock: 0, costPrice: 51000, sellingPrice: 120000, supplier: '', importDate: '' },
  { name: 'Nan Xanh đen ánh kim 1m63', stock: 0, costPrice: 52000, sellingPrice: 150000, supplier: '', importDate: '' },
  { name: 'Nan tím vip 1m1', stock: 0, costPrice: 18000, sellingPrice: 30000, supplier: '', importDate: '' },
  { name: 'Nan tím vip 1m25', stock: 0, costPrice: 25000, sellingPrice: 50000, supplier: 'Mai Ngọc', importDate: '2026-05-13' },
  { name: 'Nan tím vip 1m4', stock: 0, costPrice: 28000, sellingPrice: 50000, supplier: 'Mai Ngọc', importDate: '2026-05-14' },
  { name: 'Pass inox 11', stock: 0, costPrice: 30000, sellingPrice: 60000, supplier: '', importDate: '' },
  { name: 'Pass inox 14 (2M - 2M8)', stock: 0, costPrice: 35000, sellingPrice: 80000, supplier: 'Duy Phương', importDate: '' },
  { name: 'Pass inox 16(2M5- 3M2)', stock: 0, costPrice: 50000, sellingPrice: 120000, supplier: 'Duy Phương', importDate: '' },
  { name: 'Pass inox 19 2M5', stock: 0, costPrice: 48000, sellingPrice: 150000, supplier: 'Duy Phương', importDate: '' },
  { name: 'Pass inox 21 3M', stock: 0, costPrice: 60000, sellingPrice: 180000, supplier: '', importDate: '' },
  { name: 'Hàn ốc nèo', stock: 0, costPrice: 5000, sellingPrice: 7000, supplier: '', importDate: '' },
  { name: 'Ốc lưng kéo dây', stock: 0, costPrice: 3000, sellingPrice: 5000, supplier: '', importDate: '' },
  { name: 'Nối diều 2m', stock: 0, costPrice: 5000, sellingPrice: 7000, supplier: '', importDate: '' },
  { name: 'Nối đuôi diều 1m6,1m7,2m', stock: 0, costPrice: 5000, sellingPrice: 7000, supplier: '', importDate: '' },
  { name: 'cáp quang 1ly7 (kg)', stock: 0, costPrice: 80000, sellingPrice: 2000, supplier: '', importDate: '' },
  { name: 'Cáp quang 2ly5 mét', stock: 0, costPrice: 6000, sellingPrice: 4000, supplier: '', importDate: '' },
  { name: 'Cáp quang 3ly5 mét', stock: 0, costPrice: 8000, sellingPrice: 5000, supplier: '', importDate: '' },
  { name: 'Sáo 5 quả D25 ( còi vắt)', stock: 0, costPrice: 240000, sellingPrice: 400000, supplier: '', importDate: '' },
  { name: 'Sáo 5 quả D30 ( còi vắt)', stock: 0, costPrice: 240000, sellingPrice: 500000, supplier: '', importDate: '' },
  { name: 'Sáo 3 quả (cồng hoà)', stock: 0, costPrice: 115000, sellingPrice: 400000, supplier: '', importDate: '' },
  { name: 'Vải dán diều (kg)', stock: 0, costPrice: 140000, sellingPrice: 30000, supplier: '', importDate: '' },
  { name: 'Guồng inox D25', stock: 0, costPrice: 270000, sellingPrice: 350000, supplier: '', importDate: '' },
  { name: 'Guồng inox D15', stock: 0, costPrice: 33000, sellingPrice: 80000, supplier: 'Mai Ngọc', importDate: '2026-05-13' },
  { name: 'Guồng inox D20', stock: 0, costPrice: 40000, sellingPrice: 120000, supplier: 'Mai Ngọc', importDate: '2026-05-13' },
  { name: 'SimanoS100', stock: 0, costPrice: 70000, sellingPrice: 150000, supplier: 'Mai Ngọc', importDate: '2026-05-13' },
  { name: 'Găng tay', stock: 0, costPrice: 19000, sellingPrice: 40000, supplier: 'Diều Đẹp', importDate: '' },
  { name: 'amiang 0,6ly 1000m', stock: 0, costPrice: 560000, sellingPrice: 800000, supplier: '', importDate: '' },
  { name: 'amiang 1ly3 300m', stock: 0, costPrice: 545000, sellingPrice: 760000, supplier: '', importDate: '' },
  { name: 'phip 13 đặc', stock: 0, costPrice: 33000, sellingPrice: 50000, supplier: '', importDate: '' },
  { name: 'phip 14 rỗng', stock: 0, costPrice: 38000, sellingPrice: 60000, supplier: '', importDate: '' },
  { name: 'Thanh cái vân 3K 1m14', stock: 0, costPrice: 80000, sellingPrice: 150000, supplier: 'Mai Ngọc', importDate: '2026-03-10' },
  { name: 'Thanh cái 3K 1m4', stock: 0, costPrice: 220000, sellingPrice: 300000, supplier: 'Mai Ngọc', importDate: '2026-03-10' },
  { name: 'Nan 3k 1m4', stock: 0, costPrice: 180000, sellingPrice: 250000, supplier: 'Mai Ngọc', importDate: '2026-03-10' },
  { name: 'Nan 3K 1m25', stock: 0, costPrice: 160000, sellingPrice: 220000, supplier: 'Mai Ngọc', importDate: '2026-03-10' },
  { name: 'Nan 3k vip 1m4', stock: 0, costPrice: 22000, sellingPrice: 300000, supplier: 'Đoàn Trung', importDate: '2026-05-12' },
  { name: 'Nan 3k VIP 1m6 thanh cái diều 2m5', stock: 0, costPrice: 300000, sellingPrice: 350000, supplier: 'Đoàn Trung', importDate: '2026-05-12' },
  { name: 'Thanh cái diều 3m5', stock: 0, costPrice: 350000, sellingPrice: 450000, supplier: 'Huyền Bé', importDate: '2026-05-13' },
  { name: 'Nan cánh 3K diều 2m5', stock: 0, costPrice: 125000, sellingPrice: 250000, supplier: 'Huyền Bé', importDate: '2026-05-13' },
  { name: 'Nan Bạch kim 1m18', stock: 0, costPrice: 90000, sellingPrice: 150000, supplier: 'Mai Ngọc', importDate: '2026-05-13' },
  { name: 'Dây chặn Pass 4mm', stock: 0, costPrice: 700, sellingPrice: 1500, supplier: 'Nguyễn Lý', importDate: '2026-05-23' },
  { name: 'Dây chặn Pass 10mm', stock: 0, costPrice: 1200, sellingPrice: 2000, supplier: 'Nguyễn Lý', importDate: '2026-05-23' },
  { name: 'Dây chặn Pass 15mm', stock: 0, costPrice: 1300, sellingPrice: 2500, supplier: 'Nguyễn Lý', importDate: '2026-05-23' },
  { name: 'Dây chặn Pass 20mm', stock: 0, costPrice: 1500, sellingPrice: 3000, supplier: 'Nguyễn Lý', importDate: '2026-05-23' },
  { name: 'Dây chặn Pass 50mm', stock: 0, costPrice: 2500, sellingPrice: 5000, supplier: 'Nguyễn Lý', importDate: '2026-05-23' }
];

/**
 * Tạo Workbook file Excel mẫu chuẩn phục vụ nhập hàng đa kho
 * @param {Array} warehouses Danh sách kho hàng
 * @returns {object} XLSX Workbook
 */
export function generateProductExcelTemplate(warehouses = DEFAULT_WAREHOUSES) {
  const XLSX = (typeof window !== 'undefined' && window.XLSX) ? window.XLSX : globalThis.XLSX;
  if (!XLSX) {
    throw new Error('Thư viện Excel (XLSX) chưa sẵn sàng.');
  }

  const listWh = Array.isArray(warehouses) && warehouses.length > 0 ? warehouses : DEFAULT_WAREHOUSES;
  const wb = XLSX.utils.book_new();

  // ---------------- SHEET 1: "Danh Sách Nhập Hàng" ----------------
  const headers1 = [
    'Tên mặt hàng (*)',
    'Mã sản phẩm',
    'Kho hàng',
    'Chủng loại',
    'Đơn vị tính',
    'Số lượng tồn',
    'Giá bán (VNĐ)',
    'Giá vốn nhập (VNĐ)',
    'Mức cảnh báo tồn',
    'Kích thước',
    'Màu sắc',
    'Nhà cung cấp / Nguồn',
    'Ghi chú'
  ];

  const sampleRows = [
    ['Áo Diều Sáo D7 D8 Ghép Màu 2.5m', 'AD-001', 'Kho Áo Diều', 'Áo diều sáo truyền thống', 'Chiếc', 10, 350000, 200000, 3, '2.5m', 'Đỏ vàng', 'Xưởng Nam Định', 'Chất vải dù chống rách'],
    ['Nan Carbon Xoắn Cao Cấp D7', 'NAN-002', 'Kho Nan Diều', 'Nan carbon xoắn', 'Chiếc', 50, 45000, 28000, 10, '1m2', 'Đen nhám', 'Mai Ngọc', 'Độ đàn hồi cao'],
    ['Pass Khóa Sáo Inox 304 Cỡ Lớn', 'PASS-003', 'Kho Pass Inox', 'Pass khóa sáo', 'Cái', 30, 25000, 15000, 5, 'D40', 'Bạc sáng', 'Duy Phương', 'Inox chống rỉ sét'],
    ['Dây Amiang Chịu Lực 1ly5 Cuộn 500m', 'DAY-004', 'Kho Dây Diều', 'Dây amiang chịu lực', 'Cuộn', 15, 650000, 450000, 2, '500m', 'Trắng', 'Huân Nguyễn', 'Chịu tải gió lớn'],
    ['Bộ Còi Sáo Chuông D50 Hòa Âm', 'SAO-005', 'Kho Sáo Diều', 'Sáo chuông & hòa âm', 'Bộ', 5, 1200000, 800000, 1, 'D50', 'Gỗ mít', 'Nghệ nhân Nam Định', 'Âm vang trầm ấm']
  ];

  const ws1 = XLSX.utils.aoa_to_sheet([headers1, ...sampleRows]);
  ws1['!cols'] = [
    { wch: 38 }, // Tên mặt hàng (*)
    { wch: 15 }, // Mã sản phẩm
    { wch: 18 }, // Kho hàng
    { wch: 28 }, // Chủng loại
    { wch: 12 }, // Đơn vị tính
    { wch: 14 }, // Số lượng tồn
    { wch: 16 }, // Giá bán (VNĐ)
    { wch: 20 }, // Giá vốn nhập (VNĐ)
    { wch: 18 }, // Mức cảnh báo tồn
    { wch: 14 }, // Kích thước
    { wch: 14 }, // Màu sắc
    { wch: 26 }, // Nhà cung cấp / Nguồn
    { wch: 32 }  // Ghi chú
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Danh Sách Nhập Hàng');

  // ---------------- SHEET 2: "Hướng Dẫn & Danh Mục Kho" ----------------
  const catMap = (typeof DEFAULT_WAREHOUSE_CATEGORIES !== 'undefined' && DEFAULT_WAREHOUSE_CATEGORIES)
    ? DEFAULT_WAREHOUSE_CATEGORIES
    : FALLBACK_WAREHOUSE_CATEGORIES;

  const headers2 = ['Tên Kho Hàng', 'Mã Kho', 'Các Chủng Loại Thuộc Kho', 'Ghi Chú Hướng Dẫn'];
  const guideRows = listWh.map((w, index) => {
    const cats = catMap[w.id] || [];
    let note = '';
    if (index === 0) {
      note = 'Cột có dấu (*) là bắt buộc. Có thể điền Tên Kho hoặc Mã Kho vào cột "Kho hàng".';
    } else if (index === 1) {
      note = 'Giá bán và giá vốn nhập chỉ nhập số nguyên không kèm chữ hay ký hiệu tiền tệ.';
    } else if (index === 2) {
      note = 'Số lượng tồn và mức cảnh báo tồn chỉ nhập số nguyên (mặc định cảnh báo tồn là 3).';
    } else if (index === 3) {
      note = 'Nếu để trống cột Kho hàng, sản phẩm sẽ được xếp vào kho mặc định khi nạp.';
    } else if (index === 4) {
      note = 'Chủng loại nên chọn từ danh sách thuộc kho tương ứng để lọc danh mục chuẩn xác.';
    } else {
      note = 'Các cột Kích thước, Màu sắc, Nhà cung cấp và Ghi chú là tùy chọn, có thể để trống.';
    }
    return [
      w.name,
      w.id,
      cats.join(', '),
      note
    ];
  });

  const ws2 = XLSX.utils.aoa_to_sheet([headers2, ...guideRows]);
  ws2['!cols'] = [
    { wch: 24 }, // Tên Kho Hàng
    { wch: 18 }, // Mã Kho
    { wch: 55 }, // Các Chủng Loại Thuộc Kho
    { wch: 75 }  // Ghi Chú Hướng Dẫn
  ];
  XLSX.utils.book_append_sheet(wb, ws2, 'Hướng Dẫn & Danh Mục Kho');

  return wb;
}

/**
 * Tải file Excel mẫu nhập hàng chuẩn cho cửa hàng diều
 * @param {Array} warehouses Danh sách kho hàng
 */
export function downloadProductExcelTemplate(warehouses = DEFAULT_WAREHOUSES) {
  const XLSX = (typeof window !== 'undefined' && window.XLSX) ? window.XLSX : globalThis.XLSX;
  if (!XLSX) {
    throw new Error('Thư viện Excel (XLSX) chưa sẵn sàng.');
  }

  const wb = generateProductExcelTemplate(warehouses);
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const fileName = 'Mau_Nhap_Hang_KiteStore.xlsx';
  downloadBlobFile(blob, fileName);
  return { success: true, fileName };
}

/**
 * Phân tích mảng 2D (từ XLSX hoặc CSV)
 * Tự động nhận diện mẫu chuẩn đầy đủ cột (Mẫu Nhập Hàng) hoặc mẫu cũ (NHẬP _ XUẤT.xlsx)
 * @param {Array<Array>} rows Dữ liệu 2D
 * @param {string} defaultWarehouse Kho mặc định khi không chỉ định
 * @param {Array} warehouses Danh sách kho hiện tại
 * @returns {Array<object>} Danh sách sản phẩm chuẩn hóa
 */
export function parseStockArray2D(rows, defaultWarehouse = 'stock', warehouses = DEFAULT_WAREHOUSES) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const listWh = Array.isArray(warehouses) && warehouses.length > 0 ? warehouses : DEFAULT_WAREHOUSES;

  // 1. Kiểm tra xem file có khớp với mẫu chuẩn (Standard Template) hay không
  let standardHeaderIndex = -1;
  let standardColMap = null;

  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i] || [];
    const lowerCells = row.map(c => String(c || '').trim().toLowerCase());

    const hasNameHeader = lowerCells.some(c => c.includes('tên mặt hàng') || c.includes('tên sản phẩm'));
    const hasWarehouseOrCatHeader = lowerCells.some(c => c.includes('kho') || c.includes('chủng loại'));

    if (hasNameHeader && hasWarehouseOrCatHeader) {
      standardHeaderIndex = i;
      const colMap = {
        name: -1,
        code: -1,
        warehouse: -1,
        category: -1,
        unit: -1,
        stock: -1,
        sellingPrice: -1,
        costPrice: -1,
        lowStockThreshold: -1,
        size: -1,
        color: -1,
        supplier: -1,
        notes: -1
      };

      lowerCells.forEach((c, idx) => {
        if (colMap.name === -1 && (c.includes('tên mặt hàng') || c.includes('tên sản phẩm') || (c.includes('tên') && !c.includes('kho') && !c.includes('khách')))) {
          colMap.name = idx;
        } else if (colMap.code === -1 && (c.includes('mã sản phẩm') || c.includes('mã sp') || c.includes('mã hàng') || c === 'mã' || c.includes('mã diều'))) {
          colMap.code = idx;
        } else if (colMap.warehouse === -1 && (c.includes('kho hàng') || c === 'kho' || c.includes('mã kho') || (c.includes('kho') && !c.includes('tồn')))) {
          colMap.warehouse = idx;
        } else if (colMap.category === -1 && (c.includes('chủng loại') || c.includes('danh mục') || c.includes('loại hàng') || c === 'loại')) {
          colMap.category = idx;
        } else if (colMap.unit === -1 && (c.includes('đơn vị') || c.includes('đvt'))) {
          colMap.unit = idx;
        } else if (colMap.stock === -1 && (c.includes('số lượng tồn') || c.includes('tồn kho') || c === 'tồn' || c.includes('số lượng') || c === 'slg' || c === 'sl')) {
          colMap.stock = idx;
        } else if (colMap.sellingPrice === -1 && (c.includes('giá bán') || (c.includes('giá') && c.includes('bán')))) {
          colMap.sellingPrice = idx;
        } else if (colMap.costPrice === -1 && (c.includes('giá vốn') || c.includes('giá nhập') || (c.includes('giá') && (c.includes('vốn') || c.includes('nhập'))))) {
          colMap.costPrice = idx;
        } else if (colMap.lowStockThreshold === -1 && (c.includes('cảnh báo') || c.includes('ngưỡng') || c.includes('mức cảnh báo'))) {
          colMap.lowStockThreshold = idx;
        } else if (colMap.size === -1 && (c.includes('kích thước') || c.includes('size'))) {
          colMap.size = idx;
        } else if (colMap.color === -1 && (c.includes('màu sắc') || c.includes('màu'))) {
          colMap.color = idx;
        } else if (colMap.supplier === -1 && (c.includes('nhà cung cấp') || c.includes('nguồn') || c.includes('ncc'))) {
          colMap.supplier = idx;
        } else if (colMap.notes === -1 && (c.includes('ghi chú') || c.includes('mô tả') || c.includes('note'))) {
          colMap.notes = idx;
        }
      });

      standardColMap = colMap;
      break;
    }
  }

  // 1a. Nếu khớp mẫu chuẩn: Đọc chi tiết từng dòng với đầy đủ các trường
  if (standardHeaderIndex >= 0 && standardColMap && standardColMap.name >= 0) {
    const defaultWhId = safeNormalizeWarehouse(defaultWarehouse, listWh);

    const parseNum = (val) => {
      if (val === undefined || val === null || val === '') return 0;
      if (typeof val === 'number') return Math.round(val);
      const clean = String(val).replace(/[^0-9]/g, '');
      return parseInt(clean, 10) || 0;
    };

    const products = [];
    let count = 1;
    const nowTimestamp = Date.now();

    for (let r = standardHeaderIndex + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      const rawName = standardColMap.name >= 0 ? row[standardColMap.name] : '';
      const name = String(rawName || '').trim();
      if (!name || name === 'NaN' || name.startsWith('Tên mặt hàng') || name.startsWith('Tên sản phẩm')) {
        continue;
      }

      // Kho hàng
      let rawWh = standardColMap.warehouse >= 0 ? row[standardColMap.warehouse] : '';
      let whId = defaultWhId;
      if (rawWh !== undefined && rawWh !== null && String(rawWh).trim() !== '') {
        whId = safeNormalizeWarehouse(rawWh, listWh);
      }

      // Mã sản phẩm
      let rawCode = standardColMap.code >= 0 ? row[standardColMap.code] : '';
      const code = String(rawCode || '').trim() || `SP-${String(count).padStart(3, '0')}`;

      // Chủng loại
      let rawCat = standardColMap.category >= 0 ? row[standardColMap.category] : '';
      const category = String(rawCat || '').trim() || detectCategory(name);

      // Đơn vị tính
      let rawUnit = standardColMap.unit >= 0 ? row[standardColMap.unit] : '';
      const unit = String(rawUnit || '').trim() || detectUnit(name);

      // Số lượng & Giá cả
      const stock = standardColMap.stock >= 0 ? parseNum(row[standardColMap.stock]) : 0;
      const sellingPrice = standardColMap.sellingPrice >= 0 ? parseNum(row[standardColMap.sellingPrice]) : 0;
      const costPrice = standardColMap.costPrice >= 0 ? parseNum(row[standardColMap.costPrice]) : 0;

      let lowStockThreshold = 3;
      if (standardColMap.lowStockThreshold >= 0) {
        const rawAlert = row[standardColMap.lowStockThreshold];
        if (rawAlert !== undefined && rawAlert !== null && String(rawAlert).trim() !== '') {
          lowStockThreshold = parseNum(rawAlert);
        }
      }

      const size = standardColMap.size >= 0 && row[standardColMap.size] != null ? String(row[standardColMap.size]).trim() : '';
      const color = standardColMap.color >= 0 && row[standardColMap.color] != null ? String(row[standardColMap.color]).trim() : '';
      const supplier = standardColMap.supplier >= 0 && row[standardColMap.supplier] != null ? String(row[standardColMap.supplier]).trim() : '';
      const notes = standardColMap.notes >= 0 && row[standardColMap.notes] != null ? String(row[standardColMap.notes]).trim() : '';

      products.push({
        id: `SP-EXC-${nowTimestamp}-${count}`,
        code,
        name,
        warehouse: whId,
        category,
        unit,
        size,
        color,
        stock,
        costPrice,
        sellingPrice,
        lowStockThreshold,
        supplier,
        notes,
        photo: '',
        importDate: ''
      });
      count++;
    }

    return products;
  }

  // 2. Fallback: Phân tích theo định dạng bảng kép cũ (NHẬP _ XUẤT.xlsx)
  const legacyWarehouse = safeNormalizeWarehouse(defaultWarehouse, listWh);
  const productsMap = new Map();
  let headerRowIndex = -1;

  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i] || [];
    const rowStr = row.map(c => String(c || '').toLowerCase()).join(' ');
    if (rowStr.includes('tên hàng') || (rowStr.includes('tên') && rowStr.includes('giá'))) {
      headerRowIndex = i;
      break;
    }
  }

  const startRow = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;
  const headerRow = headerRowIndex >= 0 ? (rows[headerRowIndex] || []) : [];

  // Tìm các cột
  let colNameA = -1, colQtyA = -1, colSellA = -1, colCostA = -1, colDateA = -1;
  let colNameB = -1, colCostB = -1, colSupplierB = -1, colSellB = -1;

  headerRow.forEach((cell, idx) => {
    const c = String(cell || '').trim().toLowerCase();
    if (c === 'tên hàng hoá' || (c.includes('tên') && idx < 5)) {
      if (colNameA === -1) colNameA = idx;
    }
    if (c === 'slg' || c.includes('số lượng') || c === 'sl') colQtyA = idx;
    if (c === 'giá bán' && idx < 7) colSellA = idx;
    if (c === 'giá nhập' && idx < 9) colCostA = idx;
    if (c === 'ngày nhập' || c.includes('ngày')) colDateA = idx;

    // Cột bên phải (Table B)
    if (c === 'tên' && idx >= 7) colNameB = idx;
    if (c === 'giá nhập' && idx >= 8) colCostB = idx;
    if (c === 'nguồn' || c.includes('nhà cung cấp')) colSupplierB = idx;
    if (c === 'giá bán' && idx >= 9) colSellB = idx;
  });

  // Nếu không tìm thấy cột chuẩn, dùng vị trí mặc định theo mẫu
  if (colNameA === -1 && colNameB === -1) {
    colNameA = 3; colQtyA = 4; colSellA = 5; colCostA = 7; colDateA = 8;
    colNameB = 9; colCostB = 10; colSupplierB = 11; colSellB = 12;
  }

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const parseNum = (val) => {
      if (val === undefined || val === null || val === '') return 0;
      const clean = String(val).replace(/[^0-9]/g, '');
      return parseInt(clean, 10) || 0;
    };

    // Table A
    if (colNameA >= 0 && row[colNameA]) {
      const nameA = String(row[colNameA]).trim();
      if (nameA && nameA !== 'NaN' && nameA !== 'Tên hàng hoá') {
        const qty = colQtyA >= 0 ? parseNum(row[colQtyA]) : 0;
        const sellPrice = colSellA >= 0 ? parseNum(row[colSellA]) : 0;
        const totalCost = colCostA >= 0 ? parseNum(row[colCostA]) : 0;
        const unitCost = qty > 0 ? Math.round(totalCost / qty) : totalCost;
        const importDate = colDateA >= 0 ? String(row[colDateA] || '').trim() : '';

        if (!productsMap.has(nameA)) {
          productsMap.set(nameA, {
            name: nameA,
            stock: qty,
            costPrice: unitCost,
            sellingPrice: sellPrice,
            supplier: '',
            importDate
          });
        } else {
          const ex = productsMap.get(nameA);
          if (qty > 0) ex.stock += qty;
          if (unitCost > 0) ex.costPrice = unitCost;
          if (sellPrice > 0) ex.sellingPrice = sellPrice;
          if (importDate && !ex.importDate) ex.importDate = importDate;
        }
      }
    }

    // Table B
    if (colNameB >= 0 && row[colNameB]) {
      const nameB = String(row[colNameB]).trim();
      if (nameB && nameB !== 'NaN' && nameB !== 'Tên') {
        const costPrice = colCostB >= 0 ? parseNum(row[colCostB]) : 0;
        const supplier = colSupplierB >= 0 ? String(row[colSupplierB] || '').trim() : '';
        const sellPrice = colSellB >= 0 ? parseNum(row[colSellB]) : 0;

        if (productsMap.has(nameB)) {
          const ex = productsMap.get(nameB);
          if (costPrice > 0) ex.costPrice = costPrice;
          if (sellPrice > 0) ex.sellingPrice = sellPrice;
          if (supplier) ex.supplier = supplier;
        } else {
          productsMap.set(nameB, {
            name: nameB,
            stock: 0,
            costPrice,
            sellingPrice: sellPrice,
            supplier,
            importDate: ''
          });
        }
      }
    }
  }

  let count = 1;
  return Array.from(productsMap.values()).map(item => ({
    id: 'SP-STOCK-' + Date.now() + '-' + (count++),
    code: 'TON-' + String(count).padStart(3, '0'),
    name: item.name,
    warehouse: legacyWarehouse,
    category: detectCategory(item.name),
    unit: detectUnit(item.name),
    size: '',
    color: '',
    stock: item.stock || 0,
    costPrice: item.costPrice || 0,
    sellingPrice: item.sellingPrice || 0,
    lowStockThreshold: 3,
    supplier: item.supplier || '',
    importDate: item.importDate || '',
    photo: '',
    notes: item.supplier ? `Nguồn nhập: ${item.supplier}` : 'Hàng nhập kho tồn'
  }));
}
