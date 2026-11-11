// Bộ Xử Lý Đọc & Nhập File Excel/CSV Vào Kho Tồn (Smart Kite Inventory Parser)
import { formatVND, parseVND } from './utils.js';

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

// Hàm phân tích mảng 2D (từ XLSX hoặc CSV)
export function parseStockArray2D(rows) {
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
    warehouse: 'stock', // Kho tồn
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
