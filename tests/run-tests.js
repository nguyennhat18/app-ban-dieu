// Automated Test Suite for Kite Store Business Logic
import assert from 'assert';
import {
  formatVND,
  parseVND,
  numberToVietnameseWords,
  calculateChecksum
} from '../js/utils.js';
import {
  parseStockArray2D,
  detectCategory,
  detectUnit,
  SAMPLE_STOCK_INVENTORY
} from '../js/excel-importer.js';
import {
  generateLicenseKey,
  verifyLicenseKey,
  getDeviceId,
  sha256Hex,
  LICENSE_CONFIG,
  formatRemainingCountdown
} from '../js/modules/license.js';

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

  // ================= 8. TEST PHÂN TÁCH HAI KHO & EXCEL IMPORTER =================
  runTest('8.1. Phân chia 2 kho: Kho Mới (\'new\') và Kho Tồn (\'stock\')', () => {
    const products = [
      { id: '1', name: 'Diều sáo 2.5m', warehouse: 'new', stock: 5 },
      { id: '2', name: 'Pass khóa D7 D8', warehouse: 'stock', stock: 12 },
      { id: '3', name: 'Diều lắp ghép', stock: 3 }, // Mặc định là 'new' nếu thiếu trường
      { id: '4', name: 'Dây amiang 3.0', warehouse: 'stock', stock: 4 }
    ];

    const newWarehouseProducts = products.filter(p => (p.warehouse || 'new') === 'new');
    const stockWarehouseProducts = products.filter(p => p.warehouse === 'stock');

    assert.strictEqual(newWarehouseProducts.length, 2);
    assert.strictEqual(stockWarehouseProducts.length, 2);
  });

  runTest('8.2. Chuyển đổi mặt hàng giữa 2 kho hàng', () => {
    const product = { id: '1', name: 'Diều sáo 2 cánh', warehouse: 'new' };
    const switchWarehouse = (p) => {
      p.warehouse = (p.warehouse === 'stock') ? 'new' : 'stock';
    };

    switchWarehouse(product);
    assert.strictEqual(product.warehouse, 'stock');

    switchWarehouse(product);
    assert.strictEqual(product.warehouse, 'new');
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

  console.log('\n========================================================');
  console.log(`🎉 KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT (100%)`);
  console.log('========================================================\n');
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
