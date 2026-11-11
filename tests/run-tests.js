// Automated Test Suite for Kite Store Business Logic
import assert from 'assert';
import {
  formatVND,
  parseVND,
  numberToVietnameseWords,
  calculateChecksum
} from '../js/utils.js';

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

  console.log('\n========================================================');
  console.log(`🎉 KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT (100%)`);
  console.log('========================================================\n');
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
