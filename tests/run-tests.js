// Automated Test Suite for Kite Store Business Logic
import assert from 'assert';
import {
  formatVND,
  parseVND,
  numberToVietnameseWords,
  calculateChecksum,
  addOrMergeStockImportItem,
  mergeImportedProductsByName
} from '../js/utils.js';
import {
  DEFAULT_WAREHOUSES,
  normalizeWarehouseId,
  DEFAULT_WAREHOUSE_CATEGORIES,
  getDefaultCategoriesForWarehouse,
  normalizeWarehouseIdByNameOrId
} from '../js/config.js';
import {
  parseStockArray2D,
  detectCategory,
  detectUnit,
  SAMPLE_STOCK_INVENTORY,
  generateProductExcelTemplate
} from '../js/excel-importer.js';
import {
  generateLicenseKey,
  verifyLicenseKey,
  getDeviceId,
  sha256Hex,
  LICENSE_CONFIG,
  formatRemainingCountdown
} from '../js/modules/license.js';
import {
  NAPAS_BANKS,
  normalizeTransferContent,
  crc16ccitt,
  buildVietQRString,
  generateQRMatrix,
  renderVietQRDataUrl,
  drawVietQRToJsPdf,
  hasVietQRConfig,
  resolveOrderQR
} from '../js/vietqr.js';

console.log('========================================================');
console.log('🧪 BẮT ĐẦU CHẠY BỘ TEST TỰ ĐỘNG CHO HỆ THỐNG BÁN DIỀU');
console.log('========================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(`   Lỗi: ${err.message}\n`);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(`   Lỗi: ${err.message}\n`);
  }
}

async function main() {
  // ================= 1. TEST TIỀN TỆ & ĐỊNH DẠNG =================
  runTest('1.1. formatVND: Định dạng số nguyên sang VNĐ có dấu chấm', () => {
    assert.strictEqual(formatVND(1250000).replace(/\s/g, ' '), '1.250.000 ₫');
    assert.strictEqual(formatVND(0).replace(/\s/g, ' '), '0 ₫');
    assert.strictEqual(formatVND(50000).replace(/\s/g, ' '), '50.000 ₫');
  });

  runTest('1.2. parseVND: Chuyển chuỗi tiền có ký tự về số nguyên chuẩn xác', () => {
    assert.strictEqual(parseVND('1.250.000 ₫'), 1250000);
    assert.strictEqual(parseVND('350000'), 350000);
    assert.strictEqual(parseVND(''), 0);
    assert.strictEqual(parseVND(null), 0);
  });

  // ================= 2. TEST ĐỌC SỐ THÀNH CHỮ TIẾNG VIỆT =================
  runTest('2.1. numberToVietnameseWords: Đọc đúng số 0 và hàng chục, hàng trăm', () => {
    assert.strictEqual(numberToVietnameseWords(0), 'Không đồng');
    assert.strictEqual(numberToVietnameseWords(15), 'Mười lăm đồng');
    assert.strictEqual(numberToVietnameseWords(21), 'Hai mươi mốt đồng');
    assert.strictEqual(numberToVietnameseWords(105), 'Một trăm linh năm đồng');
    assert.strictEqual(numberToVietnameseWords(124), 'Một trăm hai mươi tư đồng');
  });

  runTest('2.2. numberToVietnameseWords: Đọc đúng hàng nghìn, hàng triệu, hàng tỉ', () => {
    assert.strictEqual(
      numberToVietnameseWords(1250000),
      'Một triệu hai trăm năm mươi nghìn đồng'
    );
    assert.strictEqual(
      numberToVietnameseWords(280000),
      'Hai trăm tám mươi nghìn đồng'
    );
    assert.strictEqual(
      numberToVietnameseWords(50000000),
      'Năm mươi triệu đồng'
    );
    assert.strictEqual(
      numberToVietnameseWords(1005000),
      'Một triệu không trăm linh năm nghìn đồng'
    );
  });

  // ================= 3. TEST TÍNH TOÁN ĐƠN HÀNG, CHIẾT KHẤU & VAT =================
  runTest('3.1. Tính tiền hàng và chiết khấu theo số tiền', () => {
    const items = [
      { unitPrice: 280000, quantity: 2, subtotal: 560000 },
      { unitPrice: 150000, quantity: 1, subtotal: 150000 }
    ];
    const subtotal = items.reduce((s, i) => s + i.subtotal, 0); // 710000
    const discountAmount = 50000;
    const shippingFee = 30000;
    const vatRate = 0;

    const afterDiscount = subtotal - discountAmount + shippingFee; // 690000
    const vatAmount = Math.round((afterDiscount * vatRate) / 100);
    const totalAmount = afterDiscount + vatAmount;

    assert.strictEqual(subtotal, 710000);
    assert.strictEqual(totalAmount, 690000);
  });

  runTest('3.2. Tính chiết khấu theo % và VAT 8% không bị lệch số tiền', () => {
    const subtotal = 1000000;
    const discountPercent = 10; // 10%
    const discountAmount = Math.round((subtotal * discountPercent) / 100); // 100000
    const shippingFee = 20000;
    const afterDiscount = subtotal - discountAmount + shippingFee; // 920000
    const vatRate = 8; // 8%
    const vatAmount = Math.round((afterDiscount * vatRate) / 100); // 73600
    const totalAmount = afterDiscount + vatAmount; // 993600

    assert.strictEqual(discountAmount, 100000);
    assert.strictEqual(vatAmount, 73600);
    assert.strictEqual(totalAmount, 993600);
    assert.strictEqual(Number.isInteger(totalAmount), true);
  });

  // ================= 4. TEST TRỪ TỒN KHO & HOÀN KHO =================
  runTest('4.1. Trừ tồn kho khi hoàn tất đơn bán', () => {
    const product = { id: 'SP-1', name: 'Diều Mực', stock: 15 };
    const orderItem = { productId: 'SP-1', quantity: 3 };

    const stockBefore = product.stock;
    product.stock -= orderItem.quantity;
    const stockAfter = product.stock;

    assert.strictEqual(stockBefore, 15);
    assert.strictEqual(stockAfter, 12);
  });

  runTest('4.2. Hoàn lại tồn kho khi hủy đơn bán', () => {
    const product = { id: 'SP-1', name: 'Diều Mực', stock: 12 };
    const orderItem = { productId: 'SP-1', quantity: 3 };

    const stockBefore = product.stock;
    product.stock += orderItem.quantity;
    const stockAfter = product.stock;

    assert.strictEqual(stockBefore, 12);
    assert.strictEqual(stockAfter, 15);
  });

  runTest('4.3. Cảnh báo khi bán vượt tồn kho (cho phép âm có xác nhận)', () => {
    const product = { id: 'SP-1', stock: 2 };
    const orderQuantity = 5;

    const isExceeded = orderQuantity > product.stock;
    assert.strictEqual(isExceeded, true);

    // Khi người dùng bấm đồng ý xuất tiếp
    const stockAfter = product.stock - orderQuantity;
    assert.strictEqual(stockAfter, -3);
  });

  // ================= 5. TEST SAO LƯU & CHECKSUM =================
  await runAsyncTest('5.1. Tính mã Checksum toàn vẹn và phát hiện dữ liệu bị sửa đổi', async () => {
    const sampleData = {
      stores: {
        products: [{ id: 'SP-01', name: 'Diều Phượng Hoàng', stock: 10 }]
      },
      settings: { shopName: 'Diều Bay Cao' }
    };
    const payloadStr1 = JSON.stringify(sampleData);
    const checksum1 = await calculateChecksum(payloadStr1);

    assert.strictEqual(typeof checksum1, 'string');
    assert.strictEqual(checksum1.length > 0, true);

    // Tính lại với cùng dữ liệu -> phải trùng khớp
    const checksum1Again = await calculateChecksum(payloadStr1);
    assert.strictEqual(checksum1, checksum1Again);

    // Thử can thiệp sửa số tồn kho -> mã checksum phải thay đổi ngay lập tức
    const tamperedData = JSON.parse(JSON.stringify(sampleData));
    tamperedData.stores.products[0].stock = 999;
    const payloadStr2 = JSON.stringify(tamperedData);
    const checksum2 = await calculateChecksum(payloadStr2);

    assert.notStrictEqual(checksum1, checksum2);
  });

  // ================= 6. TEST KHÔI PHỤC (REPLACE & MERGE) =================
  runTest('6.1. Mô phỏng khôi phục Replace: Xóa cũ thay mới', () => {
    let currentDB = [{ id: '1', name: 'Diều cũ' }];
    const backupDB = [{ id: '2', name: 'Diều mới A' }, { id: '3', name: 'Diều mới B' }];

    // Mode Replace
    currentDB = [...backupDB];
    assert.strictEqual(currentDB.length, 2);
    assert.strictEqual(currentDB.find(x => x.id === '1'), undefined);
    assert.strictEqual(currentDB.find(x => x.id === '2').name, 'Diều mới A');
  });

  runTest('6.2. Mô phỏng khôi phục Merge: Gộp dữ liệu theo ID', () => {
    const currentMap = new Map([
      ['1', { id: '1', name: 'Diều 1', stock: 5 }],
      ['2', { id: '2', name: 'Diều 2', stock: 10 }]
    ]);

    const backupList = [
      { id: '2', name: 'Diều 2 (Cập nhật)', stock: 15 },
      { id: '3', name: 'Diều 3 mới', stock: 20 }
    ];

    for (const item of backupList) {
      currentMap.set(item.id, item);
    }

    assert.strictEqual(currentMap.size, 3);
    assert.strictEqual(currentMap.get('1').stock, 5);
    assert.strictEqual(currentMap.get('2').stock, 15);
    assert.strictEqual(currentMap.get('3').name, 'Diều 3 mới');
  });

  // ================= 7. TEST QUẢN LÝ LOẠI DIỀU, ĐƠN VỊ TÍNH & ĐỒNG BỘ MẶT HÀNG =================
  runTest('7.1. Logic đổi tên loại diều: Đồng bộ tự động toàn bộ sản phẩm thuộc loại đó', () => {
    const products = [
      { id: '1', name: 'Diều mực 4m', category: 'Diều khí động học' },
      { id: '2', name: 'Diều bạch tuộc 5m', category: 'Diều khí động học' },
      { id: '3', name: 'Diều sáo 2.5m', category: 'Diều sáo truyền thống' }
    ];

    const oldCat = 'Diều khí động học';
    const newCat = 'Diều dù không nan';

    let syncedCount = 0;
    for (const p of products) {
      if (p.category === oldCat) {
        p.category = newCat;
        syncedCount++;
      }
    }

    assert.strictEqual(syncedCount, 2);
    assert.strictEqual(products[0].category, 'Diều dù không nan');
    assert.strictEqual(products[1].category, 'Diều dù không nan');
    assert.strictEqual(products[2].category, 'Diều sáo truyền thống');
  });

  runTest('7.2. An toàn dữ liệu: Ngăn chặn xóa loại diều khi đang có sản phẩm liên kết', () => {
    const products = [
      { id: '1', name: 'Diều sáo 2.5m', category: 'Diều sáo truyền thống' }
    ];

    const targetCat = 'Diều sáo truyền thống';
    const linked = products.filter(p => p.category === targetCat);

    assert.strictEqual(linked.length, 1);
    const canDelete = linked.length === 0;
    assert.strictEqual(canDelete, false);
  });

  runTest('7.3. Logic đổi tên đơn vị tính: Đồng bộ tự động sang sản phẩm', () => {
    const products = [
      { id: '1', name: 'Diều sáo', unit: 'Chiếc' },
      { id: '2', name: 'Dây dù 500m', unit: 'Cuộn' }
    ];

    const oldUnit = 'Chiếc';
    const newUnit = 'Cái';

    for (const p of products) {
      if (p.unit === oldUnit) {
        p.unit = newUnit;
      }
    }

    assert.strictEqual(products[0].unit, 'Cái');
    assert.strictEqual(products[1].unit, 'Cuộn');
  });

  runTest('7.4. Đổi tên nhanh mặt hàng: Cập nhật tên và giữ nguyên ID, giá, tồn kho', () => {
    const product = {
      id: 'SP-100',
      code: 'DIEU-100',
      name: 'Diều sáo cũ',
      sellingPrice: 500000,
      stock: 5
    };

    const newName = 'Diều Sáo D7 D8 Cao Cấp 3m';
    product.name = newName;

    assert.strictEqual(product.name, 'Diều Sáo D7 D8 Cao Cấp 3m');
    assert.strictEqual(product.id, 'SP-100');
    assert.strictEqual(product.sellingPrice, 500000);
    assert.strictEqual(product.stock, 5);
  });

  // ================= 8. TEST KHO HÀNG ĐA KHO & EXCEL IMPORTER =================
  runTest('8.1. Cấu hình 9 kho mới + Kho Tồn (đã bỏ Kho Mới) & normalizeWarehouseId', () => {
    const expectedIds = [
      'kho-ao-dieu',
      'kho-nan-dieu',
      'kho-pass-inox',
      'kho-thanh-cai',
      'kho-guong-inox',
      'kho-day-dieu',
      'kho-sao-dieu',
      'kho-dieu',
      'kho-combo',
      'stock'
    ];
    assert.strictEqual(DEFAULT_WAREHOUSES.length, 10);
    assert.deepStrictEqual(DEFAULT_WAREHOUSES.map(w => w.id), expectedIds);
    assert.strictEqual(DEFAULT_WAREHOUSES.some(w => w.id === 'new' || w.name === 'Kho Mới'), false);

    // Dữ liệu cũ ('new' hoặc thiếu trường warehouse) được map an toàn sang 'kho-dieu'
    assert.strictEqual(normalizeWarehouseId('new', DEFAULT_WAREHOUSES), 'kho-dieu');
    assert.strictEqual(normalizeWarehouseId('', DEFAULT_WAREHOUSES), 'kho-dieu');
    assert.strictEqual(normalizeWarehouseId(undefined, DEFAULT_WAREHOUSES), 'kho-dieu');
    assert.strictEqual(normalizeWarehouseId('kho-pass-inox', DEFAULT_WAREHOUSES), 'kho-pass-inox');
    assert.strictEqual(normalizeWarehouseId('stock', DEFAULT_WAREHOUSES), 'stock');

    const products = [
      { id: '1', name: 'Diều sáo 2.5m', warehouse: 'new', stock: 5 },
      { id: '2', name: 'Pass khóa D7 D8', warehouse: 'kho-pass-inox', stock: 12 },
      { id: '3', name: 'Diều lắp ghép', stock: 3 },
      { id: '4', name: 'Dây amiang 3.0', warehouse: 'stock', stock: 4 }
    ];
    const dieuProducts = products.filter(p => normalizeWarehouseId(p.warehouse, DEFAULT_WAREHOUSES) === 'kho-dieu');
    const passProducts = products.filter(p => normalizeWarehouseId(p.warehouse, DEFAULT_WAREHOUSES) === 'kho-pass-inox');
    const stockProducts = products.filter(p => normalizeWarehouseId(p.warehouse, DEFAULT_WAREHOUSES) === 'stock');

    assert.strictEqual(dieuProducts.length, 2);
    assert.strictEqual(passProducts.length, 1);
    assert.strictEqual(stockProducts.length, 1);
  });

  runTest('8.2. Chuyển đổi & tạo kho hàng động', () => {
    const customWarehouses = [
      ...DEFAULT_WAREHOUSES,
      { id: 'kho-duoi-dieu-1234', name: 'Kho Đuôi Diều', icon: '🎏' }
    ];
    const product = { id: '1', name: 'Đuôi vải 5m', warehouse: 'kho-dieu' };
    product.warehouse = normalizeWarehouseId('kho-duoi-dieu-1234', customWarehouses);
    assert.strictEqual(product.warehouse, 'kho-duoi-dieu-1234');

    product.warehouse = normalizeWarehouseId('kho-ao-dieu', customWarehouses);
    assert.strictEqual(product.warehouse, 'kho-ao-dieu');

    // Khi kho không còn tồn tại trong danh sách -> fallback an toàn về kho đầu tiên
    assert.strictEqual(normalizeWarehouseId('kho-khong-ton-tai', customWarehouses), 'kho-ao-dieu');
  });

  runTest('8.2b. Nhập hàng không tiền theo món & trùng tên chỉ cộng thêm số lượng', () => {
    const sheetItems = [];
    const prodA = { id: 'SP-1', code: 'D-01', name: 'Áo Diều 2.5m' };
    const prodASameName = { id: 'SP-99', code: 'D-99', name: '  áo diều 2.5m ' };
    const prodB = { id: 'SP-2', code: 'D-02', name: 'Nan Carbon D7' };

    addOrMergeStockImportItem(sheetItems, prodA, 5);
    addOrMergeStockImportItem(sheetItems, prodASameName, 3);
    addOrMergeStockImportItem(sheetItems, prodB, 10);

    assert.strictEqual(sheetItems.length, 2);
    assert.strictEqual(sheetItems[0].quantity, 8);
    assert.strictEqual('costPrice' in sheetItems[0], false);
    assert.strictEqual('subtotal' in sheetItems[0], false);
    assert.strictEqual(sheetItems[1].quantity, 10);

    const existing = [
      { id: 'SP-1', name: 'Áo Diều 2.5m', stock: 4, sellingPrice: 350000, costPrice: 200000 }
    ];
    const incoming = [
      { id: 'SP-EXCEL-1', name: ' áo diều 2.5m ', stock: 6, sellingPrice: 999999 },
      { id: 'SP-EXCEL-2', name: 'Dây Dù 500m', stock: 12, sellingPrice: 120000 },
      { id: 'SP-EXCEL-3', name: 'dây dù 500m', stock: 3, sellingPrice: 150000 }
    ];
    const res = mergeImportedProductsByName(existing, incoming, '2026-11-12T10:00:00Z');
    assert.strictEqual(res.added, 1);
    assert.strictEqual(res.merged, 2);
    assert.strictEqual(res.recordsToSave.length, 2);
    const updatedA = res.recordsToSave.find(r => r.id === 'SP-1');
    const createdB = res.recordsToSave.find(r => r.id === 'SP-EXCEL-2');
    assert.strictEqual(updatedA.stock, 10);
    assert.strictEqual(updatedA.sellingPrice, 350000); // Giữ nguyên giá cũ khi trùng tên
    assert.strictEqual(createdB.stock, 15);
  });

  runTest('8.3. Excel Importer & Nhận diện tự động danh mục, đơn vị tính', () => {
    assert.strictEqual(detectCategory('Nan carbon D7 D8'), 'Nan carbon & Nan diều');
    assert.strictEqual(detectCategory('Pass inox 304'), 'Pass & Phụ kiện nối');
    assert.strictEqual(detectCategory('Dây dù đan 2.5'), 'Cuộn guồng & Dây thả diều');
    assert.strictEqual(detectCategory('Còi sáo D40'), 'Sáo diều & Âm thanh');

    assert.strictEqual(detectUnit('Dây dù cuộn 500m'), 'Cuộn');
    assert.strictEqual(detectUnit('cáp quang 2ly mét'), 'Mét');
    assert.strictEqual(detectUnit('Bộ còi sáo 35'), 'Bộ');
    assert.strictEqual(detectUnit('Diều sáo đại trà'), 'Chiếc');
  });

  runTest('8.4. Nạp 69 mặt hàng mẫu chuẩn xác từ file Excel của người dùng', () => {
    assert.strictEqual(SAMPLE_STOCK_INVENTORY.length, 69);
    const nanXoan = SAMPLE_STOCK_INVENTORY.find(i => i.name === 'Nan đen xoắn 85cm');
    assert.ok(nanXoan, 'Phải có sản phẩm Nan đen xoắn 85cm');
    assert.strictEqual(nanXoan.stock, 4);
    assert.strictEqual(nanXoan.costPrice, 11000);
    assert.strictEqual(nanXoan.sellingPrice, 15000);

    const dayAmiang = SAMPLE_STOCK_INVENTORY.find(i => i.name.includes('Dây amiang 1ly2'));
    assert.ok(dayAmiang, 'Phải có sản phẩm Dây amiang 1ly2');
    assert.strictEqual(dayAmiang.costPrice, 500000);
    assert.strictEqual(dayAmiang.sellingPrice, 760000);

    const boCoi = SAMPLE_STOCK_INVENTORY.find(i => i.name.includes('Pass inox 14'));
    assert.ok(boCoi, 'Phải có Pass inox 14');
    assert.strictEqual(boCoi.supplier, 'Duy Phương');
  });

  runTest('8.5. Thao tác giỏ hàng: Thêm, tăng, giảm và xóa sản phẩm', () => {
    let cart = [];
    const addItem = (p) => {
      const ex = cart.find(i => i.productId === p.id);
      if (ex) {
        ex.quantity += 1;
        ex.subtotal = ex.quantity * ex.unitPrice;
      } else {
        cart.push({ productId: p.id, unitPrice: p.sellingPrice, quantity: 1, subtotal: p.sellingPrice });
      }
    };
    const decItem = (productId) => {
      const idx = cart.findIndex(i => i.productId === productId);
      if (idx !== -1) {
        if (cart[idx].quantity > 1) {
          cart[idx].quantity -= 1;
          cart[idx].subtotal = cart[idx].quantity * cart[idx].unitPrice;
        } else {
          cart.splice(idx, 1);
        }
      }
    };

    const p1 = { id: 'SP-1', sellingPrice: 200000 };
    addItem(p1);
    assert.strictEqual(cart.length, 1);
    assert.strictEqual(cart[0].quantity, 1);

    addItem(p1);
    assert.strictEqual(cart[0].quantity, 2);
    assert.strictEqual(cart[0].subtotal, 400000);

    decItem('SP-1');
    assert.strictEqual(cart[0].quantity, 1);

    decItem('SP-1');
    assert.strictEqual(cart.length, 0);
  });

  runTest('8.6. Chủng loại riêng biệt cho từng kho hàng & normalizeWarehouseIdByNameOrId', () => {
    // 1. Mỗi kho có danh sách chủng loại riêng, không dùng chung
    const aoCats = getDefaultCategoriesForWarehouse('kho-ao-dieu');
    const nanCats = getDefaultCategoriesForWarehouse('kho-nan-dieu');
    const passCats = getDefaultCategoriesForWarehouse('kho-pass-inox');
    const saoCats = getDefaultCategoriesForWarehouse('kho-sao-dieu');

    assert.ok(aoCats.includes('Áo diều sáo truyền thống'), 'Kho Áo Diều có chủng loại áo diều');
    assert.ok(!aoCats.includes('Nan carbon xoắn'), 'Kho Áo Diều không chứa chủng loại nan diều');

    assert.ok(nanCats.includes('Nan carbon xoắn'), 'Kho Nan Diều có chủng loại nan');
    assert.ok(!nanCats.includes('Pass khóa sáo'), 'Kho Nan Diều không chứa chủng loại pass');

    assert.ok(passCats.includes('Pass khóa sáo'), 'Kho Pass Inox có chủng loại pass');
    assert.ok(saoCats.includes('Sáo còi D40 D50'), 'Kho Sáo Diều có chủng loại sáo');

    // 2. normalizeWarehouseIdByNameOrId: nhận diện chuẩn theo cả ID, Tên kho tiếng Việt và slug
    assert.strictEqual(normalizeWarehouseIdByNameOrId('kho-ao-dieu'), 'kho-ao-dieu');
    assert.strictEqual(normalizeWarehouseIdByNameOrId('Kho Áo Diều'), 'kho-ao-dieu');
    assert.strictEqual(normalizeWarehouseIdByNameOrId('  kho nan diều  '), 'kho-nan-dieu');
    assert.strictEqual(normalizeWarehouseIdByNameOrId('Kho Pass Inox'), 'kho-pass-inox');
    assert.strictEqual(normalizeWarehouseIdByNameOrId('Kho Thanh Cái, Vai Diều'), 'kho-thanh-cai');
    assert.strictEqual(normalizeWarehouseIdByNameOrId('Kho Guồng Inox'), 'kho-guong-inox');
    assert.strictEqual(normalizeWarehouseIdByNameOrId('Kho Dây Diều'), 'kho-day-dieu');
    assert.strictEqual(normalizeWarehouseIdByNameOrId('Kho Sáo Diều'), 'kho-sao-dieu');
    assert.strictEqual(normalizeWarehouseIdByNameOrId('Kho Diều'), 'kho-dieu');
    assert.strictEqual(normalizeWarehouseIdByNameOrId('Kho Combo Về Tự Làm'), 'kho-combo');
    assert.strictEqual(normalizeWarehouseIdByNameOrId('Kho Tồn'), 'stock');
    assert.strictEqual(normalizeWarehouseIdByNameOrId(''), 'kho-dieu');
  });

  runTest('8.7. Tự động nhận diện phân kho & dữ liệu đầy đủ từ File Excel chuẩn', () => {
    // Mô phỏng 2D array đọc từ file Excel mẫu chuẩn 13 cột
    const sampleExcelRows = [
      ['HƯỚNG DẪN: ĐIỀN ĐẦY ĐỦ CÁC CỘT BÊN DƯỚI'],
      ['Tên mặt hàng (*)', 'Mã sản phẩm', 'Kho hàng', 'Chủng loại', 'Đơn vị tính', 'Số lượng tồn', 'Giá bán (VNĐ)', 'Giá vốn nhập (VNĐ)', 'Mức cảnh báo tồn', 'Kích thước', 'Màu sắc', 'Nhà cung cấp / Nguồn', 'Ghi chú'],
      ['Áo Diều Sáo Ghép Màu 3m', 'AD-300', 'Kho Áo Diều', 'Áo diều ghép màu', 'Chiếc', 15, 450000, 280000, 4, '3.0m', 'Đỏ xanh', 'Xưởng Nam Định', 'Vải caro chống thấm'],
      ['Nan Đen Đặc D8 1m5', 'NAN-080', 'Kho Nan Diều', 'Nan carbon đặc', 'Chiếc', 40, 55000, 35000, 8, '1.5m', 'Đen', 'Mai Ngọc', 'Đàn hồi chuẩn'],
      ['Pass Khóa Cánh Inox D8', 'PASS-008', 'Kho Pass Inox', 'Pass khóa cánh', 'Cái', 60, 30000, 18000, 10, 'D8', 'Inox bóng', 'Duy Phương', 'Pass chống rỉ'],
      ['Guồng Quay Trợ Lực 28cm', 'G-28', 'Kho Guồng Inox', 'Guồng trợ lực', 'Chiếc', 5, 850000, 550000, 2, '28cm', 'Bạc', 'Xưởng cơ khí', 'Vòng bi êm ái']
    ];

    const parsed = parseStockArray2D(sampleExcelRows, 'stock', DEFAULT_WAREHOUSES);
    assert.strictEqual(parsed.length, 4);

    const aoItem = parsed.find(p => p.name === 'Áo Diều Sáo Ghép Màu 3m');
    assert.ok(aoItem, 'Phải có Áo Diều');
    assert.strictEqual(aoItem.code, 'AD-300');
    assert.strictEqual(aoItem.warehouse, 'kho-ao-dieu'); // Phân đúng vào Kho Áo Diều
    assert.strictEqual(aoItem.category, 'Áo diều ghép màu');
    assert.strictEqual(aoItem.unit, 'Chiếc');
    assert.strictEqual(aoItem.stock, 15);
    assert.strictEqual(aoItem.sellingPrice, 450000);
    assert.strictEqual(aoItem.costPrice, 280000);
    assert.strictEqual(aoItem.size, '3.0m');
    assert.strictEqual(aoItem.supplier, 'Xưởng Nam Định');

    const nanItem = parsed.find(p => p.name === 'Nan Đen Đặc D8 1m5');
    assert.ok(nanItem, 'Phải có Nan Đen');
    assert.strictEqual(nanItem.warehouse, 'kho-nan-dieu'); // Phân đúng vào Kho Nan Diều

    const guongItem = parsed.find(p => p.name === 'Guồng Quay Trợ Lực 28cm');
    assert.ok(guongItem, 'Phải có Guồng');
    assert.strictEqual(guongItem.warehouse, 'kho-guong-inox'); // Phân đúng vào Kho Guồng Inox
  });

  // ================= 9. TEST HỆ THỐNG BẢN QUYỀN KHÓA THEO MÁY =================
  runTest('9.1. getDeviceId: Sinh mã thiết bị KITE-XXXX-YYYY-ZZZZ chuẩn định dạng', () => {
    const devId = getDeviceId();
    assert.ok(devId.startsWith('KITE-'), 'Mã máy phải bắt đầu bằng KITE-');
    const parts = devId.split('-');
    assert.strictEqual(parts.length, 4, 'Mã máy gồm 4 cụm');
    assert.strictEqual(parts[1].length, 4, 'Cụm 1 gồm 4 ký tự hex');
    assert.strictEqual(parts[2].length, 4, 'Cụm 2 gồm 4 ký tự hex');
    assert.strictEqual(parts[3].length, 4, 'Cụm 3 gồm 4 ký tự hex');
  });

  await runAsyncTest('9.2. generateLicenseKey & verifyLicenseKey: Key Vĩnh Viễn hợp lệ trên chính máy', async () => {
    const devA = 'KITE-A1B2-C3D4-E5F6';
    const key = await generateLicenseKey(devA, 'LIFE');
    assert.ok(key.startsWith('KITE-LIFE-99999999-'), 'Key vĩnh viễn có tiền tố chuẩn');

    const result = await verifyLicenseKey(key, devA);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.plan, 'LIFE');
    assert.strictEqual(result.isLifetime, true);
  });

  await runAsyncTest('9.3. Device Lock: Key cấp cho Máy A đưa sang Máy B bị từ chối 100%', async () => {
    const devA = 'KITE-A1B2-C3D4-E5F6';
    const devB = 'KITE-9999-8888-7777';
    const keyForA = await generateLicenseKey(devA, '1Y');

    // Máy A dùng keyForA -> Hợp lệ
    const checkA = await verifyLicenseKey(keyForA, devA);
    assert.strictEqual(checkA.valid, true);

    // Máy B dùng keyForA -> BỊ TỪ CHỐI
    const checkB = await verifyLicenseKey(keyForA, devB);
    assert.strictEqual(checkB.valid, false);
    assert.ok(checkB.reason.includes('không khớp với máy này'));
  });

  await runAsyncTest('9.4. Thời hạn bản quyền: Key tương lai hợp lệ, Key quá hạn bị từ chối', async () => {
    const dev = 'KITE-A1B2-C3D4-E5F6';
    // Key hết hạn năm 2020
    const expiredKey = await generateLicenseKey(dev, '1Y', '20200101');
    const resExpired = await verifyLicenseKey(expiredKey, dev);
    assert.strictEqual(resExpired.valid, false);
    assert.ok(resExpired.reason.includes('đã hết hạn'));

    // Key có hạn đến năm 2035
    const futureKey = await generateLicenseKey(dev, '1Y', '20351231');
    const resFuture = await verifyLicenseKey(futureKey, dev);
    assert.strictEqual(resFuture.valid, true);
    assert.strictEqual(resFuture.expiryDisplay, '31/12/2035');
  });

  await runAsyncTest('9.5. Tamper Resistance: Tự ý sửa đổi thông tin trong key bị phát hiện ngay', async () => {
    const dev = 'KITE-A1B2-C3D4-E5F6';
    const origKey = await generateLicenseKey(dev, '1M'); // Gói 1 tháng
    // Gian lận đổi gói 1M thành LIFE
    const fakeLifeKey = origKey.replace('-1M-', '-LIFE-');
    const checkFake = await verifyLicenseKey(fakeLifeKey, dev);
    assert.strictEqual(checkFake.valid, false, 'Key giả mạo phải bị từ chối');

    // Gian lận sửa 1 ký tự trong mã xác nhận
    const tamperedSig = origKey.slice(0, -1) + (origKey.slice(-1) === 'A' ? 'B' : 'A');
    const checkTampered = await verifyLicenseKey(tamperedSig, dev);
    assert.strictEqual(checkTampered.valid, false, 'Chữ ký sai lệch phải bị từ chối');
  });

  runTest('9.6. formatRemainingCountdown: Định dạng chính xác chi tiết ngày, giờ, phút, giây', () => {
    const future = new Date(Date.now() + (3 * 86400 + 4 * 3600 + 15 * 60 + 30) * 1000);
    const formatted = formatRemainingCountdown(future);
    assert.ok(formatted.includes('03 ngày 04 giờ 15 phút'));

    const past = new Date(Date.now() - 10000);
    const expiredText = formatRemainingCountdown(past);
    assert.ok(expiredText.includes('Hết hạn'));
  });

  // ================= 10. TEST BẢO TOÀN DỮ LIỆU SAO LƯU & KHÔI PHỤC =================
  await runAsyncTest('10.1. Checksum SHA-256 đồng nhất 64 ký tự cho dữ liệu Tiếng Việt', async () => {
    const samplePayload = JSON.stringify({
      stores: { products: [{ id: 'SP-01', name: 'Diều sáo 2m5', stock: 10 }] },
      settings: { product_categories: ['Diều sáo truyền thống'], product_units: ['Chiếc'] }
    });
    const hash1 = await calculateChecksum(samplePayload);
    const hash2 = await calculateChecksum(samplePayload);
    assert.strictEqual(hash1.length, 64, 'Checksum SHA-256 phải dài chuẩn 64 ký tự hex');
    assert.strictEqual(hash1, hash2, 'Cùng dữ liệu phải cho cùng mã checksum');
  });

  runTest('10.2. Chuẩn hóa bản ghi khôi phục: Không bao giờ lỗi khóa chính hoặc thiếu phân kho', () => {
    const sanitizeItem = (rawItem, storeName, idx) => {
      if (!rawItem || typeof rawItem !== 'object') return null;
      const item = { ...rawItem };
      if (item.id === undefined || item.id === null || item.id === '') {
        item.id = `RST-${storeName}-${idx}`;
      } else {
        item.id = String(item.id);
      }
      item.isDeleted = Boolean(item.isDeleted);
      if (storeName === 'products' && !item.warehouse) item.warehouse = 'new';
      return item;
    };

    const brokenProd = sanitizeItem({ name: 'Diều không có ID', sellingPrice: 500000 }, 'products', 0);
    assert.ok(brokenProd.id.startsWith('RST-products-0'), 'Tự sinh ID nếu bản ghi thiếu ID');
    assert.strictEqual(brokenProd.warehouse, 'new', 'Tự gán kho mặc định là new nếu thiếu');
    assert.strictEqual(brokenProd.isDeleted, false, 'Chuẩn hóa isDeleted thành boolean');

    const numIdProd = sanitizeItem({ id: 12345, name: 'Diều ID số' }, 'products', 1);
    assert.strictEqual(numIdProd.id, '12345', 'ID số phải chuyển thành chuỗi chuẩn');
  });

  // ================= 11. TEST VIETQR OFFLINE & QR GENERATOR =================
  runTest('11.1. crc16ccitt: Chuẩn CRC-16/CCITT-FALSE với vector chuẩn & payload EMVCo', () => {
    assert.strictEqual(crc16ccitt('123456789'), '29B1', 'Vector chuẩn 123456789 phải trả về 29B1');
    assert.strictEqual(crc16ccitt(''), 'FFFF', 'Chuỗi rỗng với init 0xFFFF phải trả về FFFF');

    const staticPayloadPrefix = '00020101021138570010A00000072701270006970436011310123456789010208QRIBFTTA53037045802VN6304';
    assert.strictEqual(crc16ccitt(staticPayloadPrefix), '64D8', 'CRC payload tĩnh EMVCo/VietQR chuẩn xác');

    const dynamicPayloadPrefix = '00020101021238570010A00000072701270006970436011310123456789010208QRIBFTTA530370454062500005802VN62280824Thanh toan don hang DH096304';
    assert.strictEqual(crc16ccitt(dynamicPayloadPrefix), 'ED27', 'CRC payload động có số tiền & nội dung chuẩn xác');
  });

  runTest('11.2. normalizeTransferContent: Bỏ dấu đ/Đ, ký tự đặc biệt và giới hạn 25 ký tự', () => {
    assert.strictEqual(
      normalizeTransferContent('Đơn hàng #ĐH-01: Diều!'),
      'Don hang DH01 Dieu',
      'Phải chuyển đ/Đ thành d/D, bỏ dấu tiếng Việt và ký tự đặc biệt'
    );
    const longNorm = normalizeTransferContent('Thanh   toán   nợ   khách hàng   Nguyễn Văn A 12345');
    assert.ok(longNorm.length > 0 && longNorm.length <= 25, 'Chuỗi dài phải được cắt <= 25 ký tự và trim khoảng trắng cuối');
    assert.strictEqual(normalizeTransferContent('ABCDEFGHIJKLMNOPQRSTUVWXYZ'), 'ABCDEFGHIJKLMNOPQRSTUVWXY', 'Chuỗi 26 ký tự ASCII phải cắt đúng còn 25 ký tự');
    assert.ok(/^[A-Za-z0-9 ]+$/.test(longNorm), 'Chỉ giữ lại ký tự ASCII chữ, số và khoảng trắng');
    assert.strictEqual(normalizeTransferContent('@@@---!!!'), '', 'Chuỗi toàn ký tự đặc biệt phải thành rỗng');
  });

  runTest('11.3. buildVietQRString: Đúng cấu trúc TLV EMVCo/NAPAS 247 (động & tĩnh)', () => {
    const parseTLV = (str) => {
      const out = {};
      let i = 0;
      while (i < str.length) {
        const tag = str.slice(i, i + 2);
        const len = parseInt(str.slice(i + 2, i + 4), 10);
        const val = str.slice(i + 4, i + 4 + len);
        assert.strictEqual(val.length, len, `Độ dài TLV tag ${tag} phải khớp`);
        out[tag] = val;
        i += 4 + len;
      }
      assert.strictEqual(i, str.length, 'Toàn bộ chuỗi TLV phải khớp độ dài');
      return out;
    };

    const dynQR = buildVietQRString({
      bankBin: '970436',
      accountNumber: '1012345678901',
      amount: 250000,
      description: 'Thanh toán đơn hàng #ĐH-09'
    });
    assert.strictEqual(
      dynQR,
      '00020101021238570010A00000072701270006970436011310123456789010208QRIBFTTA530370454062500005802VN62280824Thanh toan don hang DH096304ED27'
    );
    const dynTop = parseTLV(dynQR);
    assert.strictEqual(dynTop['00'], '01');
    assert.strictEqual(dynTop['01'], '12');
    assert.strictEqual(dynTop['53'], '704');
    assert.strictEqual(dynTop['54'], '250000');
    assert.strictEqual(dynTop['58'], 'VN');
    assert.strictEqual(dynTop['63'], crc16ccitt(dynQR.slice(0, -4)));
    const t38 = parseTLV(dynTop['38']);
    assert.strictEqual(t38['00'], 'A000000727');
    assert.strictEqual(t38['02'], 'QRIBFTTA');
    const t38Sub = parseTLV(t38['01']);
    assert.strictEqual(t38Sub['00'], '970436');
    assert.strictEqual(t38Sub['01'], '1012345678901');
    const t62 = parseTLV(dynTop['62']);
    assert.strictEqual(t62['08'], 'Thanh toan don hang DH09');

    const staticQR = buildVietQRString({
      bankBin: '970436',
      accountNumber: '1012345678901',
      amount: 0,
      description: ''
    });
    assert.strictEqual(
      staticQR,
      '00020101021138570010A00000072701270006970436011310123456789010208QRIBFTTA53037045802VN630464D8'
    );
    const staticTop = parseTLV(staticQR);
    assert.strictEqual(staticTop['01'], '11');
    assert.strictEqual('54' in staticTop, false, 'QR tĩnh không chứa tag 54');
    assert.strictEqual('62' in staticTop, false, 'QR không có mô tả không chứa tag 62');
  });

  runTest('11.4. generateQRMatrix & renderVietQRDataUrl: Sinh ma trận vuông >= 21x21 & Data URL offline', () => {
    assert.ok(Array.isArray(NAPAS_BANKS) && NAPAS_BANKS.length >= 25, 'Danh sách ngân hàng NAPAS đầy đủ');
    const qrText = buildVietQRString({
      bankBin: '970415',
      accountNumber: '113366668888',
      amount: 500000,
      description: 'DON HANG DH123'
    });
    const matrix = generateQRMatrix(qrText);
    assert.ok(Array.isArray(matrix) && matrix.length >= 21, 'Ma trận QR phải có kích thước >= 21x21');
    assert.strictEqual(matrix.length, matrix[0].length, 'Ma trận QR phải là hình vuông');
    assert.strictEqual(matrix[matrix.length - 8][8], true, 'Dark module QR chuẩn phải bằng true');

    const dataUrl = renderVietQRDataUrl(qrText, 280);
    assert.ok(
      dataUrl.startsWith('data:image/png;base64,') || dataUrl.startsWith('data:image/svg+xml;base64,'),
      'renderVietQRDataUrl phải trả về Data URL ảnh PNG hoặc SVG nội bộ'
    );
  });

  runTest('11.5. hasVietQRConfig, resolveOrderQR & drawVietQRToJsPdf: Ưu tiên VietQR, fallback QR tĩnh & vẽ vector PDF', () => {
    const shopVietQR = { bankBin: '970422', bankName: 'MBBank', bankAccount: '0987654321', bankAccountName: 'NGUYEN VAN A', qrCode: 'data:image/png;base64,OLD' };
    assert.strictEqual(hasVietQRConfig(shopVietQR), true);
    const resolved = resolveOrderQR(shopVietQR, 350000, 'Đơn #DH-88');
    assert.strictEqual(resolved.type, 'vietqr');
    assert.strictEqual(resolved.normalizedDesc, 'Don DH88');
    assert.ok(resolved.qrText.includes('5406350000'));
    assert.ok(resolved.dataUrl.startsWith('data:image/'));

    const shopStatic = { bankBin: '', bankAccount: '', bankInfo: 'VCB', qrCode: 'data:image/png;base64,STATIC' };
    assert.strictEqual(hasVietQRConfig(shopStatic), false);
    const resolvedStatic = resolveOrderQR(shopStatic, 100000, 'DH-01');
    assert.strictEqual(resolvedStatic.type, 'static');
    assert.strictEqual(resolvedStatic.dataUrl, 'data:image/png;base64,STATIC');

    assert.strictEqual(resolveOrderQR({}, 100000, 'DH-01'), null);

    let rectCount = 0;
    const mockDoc = { setFillColor: () => {}, rect: () => { rectCount++; } };
    drawVietQRToJsPdf(mockDoc, resolved.qrText, 15, 20, 28);
    assert.ok(rectCount > 50, 'drawVietQRToJsPdf phải vẽ nền trắng và các module đen lên jsPDF');
  });

  const pct = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;
  console.log('\n========================================================');
  console.log(`🎉 KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT (${pct}%)`);
  console.log('========================================================\n');
  if (passedTests !== totalTests) process.exitCode = 1;
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
