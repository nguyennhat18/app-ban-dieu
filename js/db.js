// Quản lý cơ sở dữ liệu IndexedDB (Offline-First, Transactional, Versioned, Snapshot)
import {
  APP_CONFIG,
  DEFAULT_SHOP_SETTINGS,
  PRODUCT_CATEGORIES,
  PRODUCT_UNITS,
  DEFAULT_WAREHOUSES,
  normalizeWarehouseId,
  DEFAULT_WAREHOUSE_CATEGORIES,
  getDefaultCategoriesForWarehouse
} from './config.js';
import { calculateChecksum } from './utils.js';

class KiteDatabase {
  constructor() {
    this.db = null;
    this.snapshotDb = null;
    this.initPromise = null;
    this._isReady = false;
  }

  /**
   * Khởi tạo và mở kết nối cơ sở dữ liệu IndexedDB
   */
  async init() {
    if (this._isReady && this.db) return this;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      // 1. Mở CSDL chính KiteStoreDB
      this.db = await this._openMainDB();

      // 2. Mở CSDL Snapshot KiteStoreSnapshotsDB
      this.snapshotDb = await this._openSnapshotDB();

      // Đánh dấu DB đã mở xong để các hàm nội bộ không bị deadlock
      this._isReady = true;

      // 3. Khởi tạo cài đặt mặc định nếu chưa có
      await this._ensureDefaultSettings();

      // 4. Kiểm tra và chụp snapshot tự động mỗi ngày lần đầu (chạy nền, không block init)
      this.checkAndCreateDailySnapshot().catch(err => {
        console.warn('Lỗi kiểm tra snapshot hàng ngày:', err);
      });

      return this;
    })();

    return this.initPromise;
  }

  async ensureReady() {
    if (this._isReady && this.db) return;
    await this.init();
  }

  _openMainDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(APP_CONFIG.DB_NAME, APP_CONFIG.DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const oldVersion = event.oldVersion;
        console.log(`[DB] Nâng cấp cơ sở dữ liệu từ v${oldVersion} lên v${APP_CONFIG.DB_VERSION}`);

        // Phiên bản 1: Cấu trúc cơ sở dữ liệu ban đầu
        if (oldVersion < 1) {
          // 1. Sản phẩm (Diều)
          if (!db.objectStoreNames.contains('products')) {
            const productStore = db.createObjectStore('products', { keyPath: 'id' });
            productStore.createIndex('code', 'code', { unique: false });
            productStore.createIndex('name', 'name', { unique: false });
            productStore.createIndex('category', 'category', { unique: false });
            productStore.createIndex('isDeleted', 'isDeleted', { unique: false });
          }

          // 2. Khách hàng
          if (!db.objectStoreNames.contains('customers')) {
            const customerStore = db.createObjectStore('customers', { keyPath: 'id' });
            customerStore.createIndex('name', 'name', { unique: false });
            customerStore.createIndex('phone', 'phone', { unique: false });
            customerStore.createIndex('isDeleted', 'isDeleted', { unique: false });
          }

          // 3. Đơn hàng (Bán hàng)
          if (!db.objectStoreNames.contains('orders')) {
            const orderStore = db.createObjectStore('orders', { keyPath: 'id' });
            orderStore.createIndex('customerId', 'customerId', { unique: false });
            orderStore.createIndex('createdAt', 'createdAt', { unique: false });
            orderStore.createIndex('status', 'status', { unique: false });
            orderStore.createIndex('isDeleted', 'isDeleted', { unique: false });
          }

          // 4. Lịch sử kho hàng (Truy vết biến động tồn)
          if (!db.objectStoreNames.contains('inventory_logs')) {
            const invLogStore = db.createObjectStore('inventory_logs', { keyPath: 'id' });
            invLogStore.createIndex('productId', 'productId', { unique: false });
            invLogStore.createIndex('changeType', 'changeType', { unique: false });
            invLogStore.createIndex('createdAt', 'createdAt', { unique: false });
          }

          // 5. Phiếu nhập hàng
          if (!db.objectStoreNames.contains('stock_imports')) {
            const importStore = db.createObjectStore('stock_imports', { keyPath: 'id' });
            importStore.createIndex('createdAt', 'createdAt', { unique: false });
          }

          // 6. Báo giá
          if (!db.objectStoreNames.contains('quotations')) {
            const quoteStore = db.createObjectStore('quotations', { keyPath: 'id' });
            quoteStore.createIndex('customerId', 'customerId', { unique: false });
            quoteStore.createIndex('createdAt', 'createdAt', { unique: false });
            quoteStore.createIndex('status', 'status', { unique: false });
            quoteStore.createIndex('isDeleted', 'isDeleted', { unique: false });
          }

          // 7. Lịch sử thu nợ
          if (!db.objectStoreNames.contains('debt_payments')) {
            const debtStore = db.createObjectStore('debt_payments', { keyPath: 'id' });
            debtStore.createIndex('customerId', 'customerId', { unique: false });
            debtStore.createIndex('createdAt', 'createdAt', { unique: false });
          }

          // 8. Cài đặt hệ thống
          if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings', { keyPath: 'key' });
          }
        }
      };

      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(new Error('Không thể mở IndexedDB: ' + e.target.error));
    });
  }

  _openSnapshotDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(APP_CONFIG.SNAPSHOT_DB_NAME, 1);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('snapshots')) {
          const store = db.createObjectStore('snapshots', { keyPath: 'id' });
          store.createIndex('dateKey', 'dateKey', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };

      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => {
        console.warn('Không thể mở Snapshot DB:', e.target.error);
        resolve(null);
      };
    });
  }

  async _ensureDefaultSettings() {
    const existing = await this.getSetting('shop_info');
    if (!existing) {
      await this.saveSetting('shop_info', { ...DEFAULT_SHOP_SETTINGS });
    }
  }

  // ================= TRANSACTION HELPER =================
  /**
   * Chạy transaction an toàn với nhiều bảng
   */
  async runTransaction(storeNames, mode, callback) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeNames, mode);
      let result = null;

      tx.oncomplete = () => resolve(result);
      tx.onerror = (e) => reject(new Error('Transaction thất bại: ' + e.target.error));
      tx.onabort = (e) => reject(new Error('Transaction bị hủy: ' + e.target.error));

      try {
        result = callback(tx);
      } catch (err) {
        tx.abort();
        reject(err);
      }
    });
  }

  // ================= GENERIC CRUD =================
  async getAll(storeName, includeDeleted = false) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => {
        let items = req.result || [];
        if (!includeDeleted) {
          items = items.filter(item => !item.isDeleted);
        }
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getById(storeName, id) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async put(storeName, item, trackChange = true) {
    await this.ensureReady();
    const now = new Date().toISOString();
    if (!item.createdAt) item.createdAt = now;
    item.updatedAt = now;
    if (item.isDeleted === undefined) item.isDeleted = false;

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([storeName], 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(item);
      req.onsuccess = async () => {
        if (trackChange) {
          await this._incrementUnbackedChanges();
        }
        resolve(item);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async softDelete(storeName, id) {
    await this.ensureReady();
    const item = await this.getById(storeName, id);
    if (!item) throw new Error('Không tìm thấy bản ghi để xóa');

    item.isDeleted = true;
    item.deletedAt = new Date().toISOString();
    await this.put(storeName, item, true);
    return item;
  }

  async restoreSoftDelete(storeName, id) {
    await this.ensureReady();
    const item = await this.getById(storeName, id);
    if (!item) throw new Error('Không tìm thấy bản ghi để khôi phục');

    item.isDeleted = false;
    item.deletedAt = null;
    await this.put(storeName, item, true);
    return item;
  }

  async permanentDelete(storeName, id) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([storeName], 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(id);
      req.onsuccess = async () => {
        await this._incrementUnbackedChanges();
        resolve(true);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getTrashItems() {
    await this.ensureReady();
    const stores = ['products', 'customers', 'orders', 'quotations'];
    const trash = [];

    for (const s of stores) {
      const all = await this.getAll(s, true);
      const deleted = all.filter(item => item.isDeleted);
      deleted.forEach(item => {
        trash.push({
          ...item,
          _storeName: s,
          _typeName: s === 'products' ? 'Sản phẩm' :
                     s === 'customers' ? 'Khách hàng' :
                     s === 'orders' ? 'Đơn hàng' : 'Báo giá'
        });
      });
    }

    return trash.sort((a, b) => new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0));
  }

  // ================= SETTINGS =================
  async getSetting(key) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('settings', 'readonly');
      const store = tx.objectStore('settings');
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => reject(req.error);
    });
  }

  async saveSetting(key, value) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      const req = store.put({ key, value, updatedAt: new Date().toISOString() });
      req.onsuccess = () => resolve(value);
      req.onerror = () => reject(req.error);
    });
  }

  // ================= QUẢN LÝ CHỦNG LOẠI THEO KHO (WAREHOUSE CATEGORIES) =================
  async getCategories(warehouseId = null) {
    const warehouses = await this.getWarehouses();
    if (warehouseId !== null && warehouseId !== undefined && warehouseId !== '') {
      const normId = normalizeWarehouseId(warehouseId, warehouses);
      const map = (await this.getSetting('warehouse_categories')) || {};
      if (map && typeof map === 'object' && Array.isArray(map[normId]) && map[normId].length > 0) {
        return [...map[normId]];
      }
      const defaults = getDefaultCategoriesForWarehouse(normId);
      const updatedMap = (map && typeof map === 'object') ? { ...map } : {};
      updatedMap[normId] = [...defaults];
      await this.saveSetting('warehouse_categories', updatedMap);
      return [...defaults];
    }

    // warehouseId is null/undefined: trả về mảng chủng loại không trùng lặp từ tất cả các kho
    const map = await this.getSetting('warehouse_categories');
    if (map && typeof map === 'object' && Object.keys(map).length > 0) {
      const seen = new Set();
      const allCats = [];
      for (const w of warehouses) {
        const cats = Array.isArray(map[w.id]) && map[w.id].length > 0
          ? map[w.id]
          : getDefaultCategoriesForWarehouse(w.id);
        for (const c of cats) {
          const trimmed = String(c).trim();
          if (trimmed && !seen.has(trimmed)) {
            seen.add(trimmed);
            allCats.push(trimmed);
          }
        }
      }
      for (const key of Object.keys(map)) {
        if (Array.isArray(map[key])) {
          for (const c of map[key]) {
            const trimmed = String(c).trim();
            if (trimmed && !seen.has(trimmed)) {
              seen.add(trimmed);
              allCats.push(trimmed);
            }
          }
        }
      }
      if (allCats.length > 0) return allCats;
    }

    const legacy = await this.getSetting('product_categories');
    if (Array.isArray(legacy) && legacy.length > 0) {
      return [...legacy];
    }

    const seen = new Set();
    const allCats = [];
    for (const w of warehouses) {
      for (const c of getDefaultCategoriesForWarehouse(w.id)) {
        const trimmed = String(c).trim();
        if (trimmed && !seen.has(trimmed)) {
          seen.add(trimmed);
          allCats.push(trimmed);
        }
      }
    }
    return allCats.length > 0 ? allCats : [...PRODUCT_CATEGORIES];
  }

  async saveCategories(warehouseId, categories) {
    if (Array.isArray(warehouseId) && categories === undefined) {
      await this.saveSetting('product_categories', warehouseId);
      return warehouseId;
    }
    const warehouses = await this.getWarehouses();
    const normId = normalizeWarehouseId(warehouseId, warehouses);
    const map = (await this.getSetting('warehouse_categories')) || {};
    const updatedMap = (map && typeof map === 'object') ? { ...map } : {};
    updatedMap[normId] = Array.isArray(categories) ? [...categories] : [];
    await this.saveSetting('warehouse_categories', updatedMap);
    return updatedMap[normId];
  }

  async addCategory(warehouseId, name) {
    let targetWh = warehouseId;
    let targetName = name;
    if (targetName === undefined) {
      targetName = targetWh;
      targetWh = 'kho-dieu';
    }
    const trimmed = String(targetName || '').trim();
    if (!trimmed) throw new Error('Tên chủng loại không được để trống');

    const warehouses = await this.getWarehouses();
    const normId = normalizeWarehouseId(targetWh, warehouses);
    const cats = await this.getCategories(normId);

    if (cats.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error(`Chủng loại "${trimmed}" đã tồn tại trong kho này!`);
    }

    cats.push(trimmed);
    await this.saveCategories(normId, cats);
    return cats;
  }

  async renameCategory(warehouseId, oldName, newName) {
    let targetWh = warehouseId;
    let targetOld = oldName;
    let targetNew = newName;
    if (newName === undefined && oldName !== undefined) {
      targetWh = 'kho-dieu';
      targetOld = warehouseId;
      targetNew = oldName;
    }
    const trimmedOld = String(targetOld || '').trim();
    const trimmedNew = String(targetNew || '').trim();
    if (!trimmedNew) throw new Error('Tên chủng loại mới không được để trống');
    if (trimmedOld === trimmedNew) return { updatedProductsCount: 0 };

    const warehouses = await this.getWarehouses();
    const normId = normalizeWarehouseId(targetWh, warehouses);
    const cats = await this.getCategories(normId);

    const idx = cats.findIndex(c => c.toLowerCase() === trimmedOld.toLowerCase());
    if (idx === -1) {
      throw new Error(`Không tìm thấy chủng loại "${trimmedOld}"`);
    }

    if (cats.some((c, i) => i !== idx && c.toLowerCase() === trimmedNew.toLowerCase())) {
      throw new Error(`Tên chủng loại "${trimmedNew}" đã tồn tại trong kho này!`);
    }

    cats[idx] = trimmedNew;
    await this.saveCategories(normId, cats);

    // Cập nhật tất cả sản phẩm đang hoạt động trong kho đó
    const products = await this.getAll('products', false);
    let updatedProductsCount = 0;
    for (const p of products) {
      if (normalizeWarehouseId(p.warehouse, warehouses) === normId && p.category === trimmedOld) {
        p.category = trimmedNew;
        await this.put('products', p);
        updatedProductsCount++;
      }
    }
    return { updatedProductsCount };
  }

  async deleteCategory(warehouseId, name) {
    let targetWh = warehouseId;
    let targetName = name;
    if (targetName === undefined) {
      targetName = targetWh;
      targetWh = 'kho-dieu';
    }
    const trimmed = String(targetName || '').trim();
    const warehouses = await this.getWarehouses();
    const normId = normalizeWarehouseId(targetWh, warehouses);

    const products = await this.getAll('products', false);
    const linked = products.filter(p => !p.isDeleted && normalizeWarehouseId(p.warehouse, warehouses) === normId && p.category === trimmed);
    if (linked.length > 0) {
      throw new Error(`Không thể xóa vì đang có ${linked.length} sản phẩm thuộc loại "${trimmed}" trong kho này. Vui lòng đổi loại cho các sản phẩm này trước khi xóa!`);
    }

    let cats = await this.getCategories(normId);
    if (cats.length <= 1) {
      throw new Error('Kho hàng phải có ít nhất 1 chủng loại!');
    }
    cats = cats.filter(c => c !== trimmed && c.toLowerCase() !== trimmed.toLowerCase());
    await this.saveCategories(normId, cats);
    return cats;
  }

  async resetDefaultCategories(warehouseId = 'kho-ao-dieu') {
    const warehouses = await this.getWarehouses();
    const normId = normalizeWarehouseId(warehouseId, warehouses);
    const defaults = getDefaultCategoriesForWarehouse(normId);
    await this.saveCategories(normId, defaults);
    return [...defaults];
  }

  // ================= QUẢN LÝ ĐƠN VỊ TÍNH (UNITS) =================
  async getUnits() {
    const units = await this.getSetting('product_units');
    if (Array.isArray(units) && units.length > 0) return units;
    return [...PRODUCT_UNITS];
  }

  async saveUnits(units) {
    await this.saveSetting('product_units', units);
  }

  async addUnit(name) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Tên đơn vị tính không được để trống');
    const units = await this.getUnits();
    if (units.some(u => u.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error(`Đơn vị tính "${trimmed}" đã tồn tại!`);
    }
    units.push(trimmed);
    await this.saveUnits(units);
    return units;
  }

  async renameUnit(oldName, newName) {
    const trimmedOld = oldName.trim();
    const trimmedNew = newName.trim();
    if (!trimmedNew) throw new Error('Tên đơn vị tính mới không được để trống');
    if (trimmedOld === trimmedNew) return;

    const units = await this.getUnits();
    const idx = units.indexOf(trimmedOld);
    if (idx === -1) throw new Error(`Không tìm thấy đơn vị tính "${trimmedOld}"`);

    units[idx] = trimmedNew;
    await this.saveUnits(units);

    // Đồng bộ sang sản phẩm
    const products = await this.getAll('products', true);
    for (const p of products) {
      if (p.unit === trimmedOld) {
        p.unit = trimmedNew;
        await this.put('products', p);
      }
    }
  }

  async deleteUnit(unitName) {
    const trimmed = unitName.trim();
    let units = await this.getUnits();
    if (units.length <= 1) throw new Error('Phải có ít nhất 1 đơn vị tính!');
    units = units.filter(u => u !== trimmed);
    await this.saveUnits(units);
    return units;
  }

  // ================= QUẢN LÝ KHO HÀNG (WAREHOUSES) =================
  async getWarehouses() {
    const warehouses = await this.getSetting('product_warehouses');
    if (Array.isArray(warehouses) && warehouses.length > 0) {
      const filtered = warehouses.filter(w => w && w.id && w.id !== 'new');
      if (filtered.length > 0) return filtered;
    }
    return DEFAULT_WAREHOUSES.map(w => ({ ...w }));
  }

  async saveWarehouses(warehouses) {
    await this.saveSetting('product_warehouses', warehouses);
  }

  async addWarehouse(name, icon = '📦') {
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new Error('Tên kho hàng không được để trống');

    const warehouses = await this.getWarehouses();
    if (warehouses.some(w => w.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error(`Kho "${trimmed}" đã tồn tại!`);
    }

    const asciiSlug = trimmed
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/^kho-/, '') || 'custom';

    let id = `kho-${asciiSlug}-${Math.floor(1000 + Math.random() * 9000)}`;
    while (warehouses.some(w => w.id === id)) {
      id = `kho-${asciiSlug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const newWarehouse = {
      id,
      name: trimmed,
      icon: (icon && String(icon).trim()) || '📦'
    };
    warehouses.push(newWarehouse);
    await this.saveWarehouses(warehouses);
    return newWarehouse;
  }

  async renameWarehouse(id, newName, newIcon = null) {
    const trimmedNew = String(newName || '').trim();
    if (!trimmedNew) throw new Error('Tên kho hàng mới không được để trống');

    const warehouses = await this.getWarehouses();
    const idx = warehouses.findIndex(w => w.id === id);
    if (idx === -1) throw new Error('Không tìm thấy kho hàng cần đổi tên');

    if (warehouses.some((w, i) => i !== idx && w.name.toLowerCase() === trimmedNew.toLowerCase())) {
      throw new Error(`Kho "${trimmedNew}" đã tồn tại!`);
    }

    warehouses[idx] = {
      ...warehouses[idx],
      name: trimmedNew,
      ...(newIcon !== null && newIcon !== undefined && String(newIcon).trim() !== ''
        ? { icon: String(newIcon).trim() }
        : {})
    };
    await this.saveWarehouses(warehouses);
    return warehouses;
  }

  async deleteWarehouse(id) {
    const warehouses = await this.getWarehouses();
    const target = warehouses.find(w => w.id === id);
    if (!target) throw new Error('Không tìm thấy kho hàng cần xóa');

    const products = await this.getAll('products');
    const linked = products.filter(p => normalizeWarehouseId(p.warehouse, warehouses) === id);
    if (linked.length > 0) {
      throw new Error(`Không thể xóa vì đang có ${linked.length} sản phẩm trong "${target.name}". Vui lòng chuyển kho cho các sản phẩm này trước khi xóa!`);
    }

    if (warehouses.length <= 1) {
      throw new Error('Cửa hàng phải có ít nhất 1 kho hàng!');
    }

    const nextWarehouses = warehouses.filter(w => w.id !== id);
    await this.saveWarehouses(nextWarehouses);
    return nextWarehouses;
  }

  async resetDefaultWarehouses() {
    const defaults = DEFAULT_WAREHOUSES.map(w => ({ ...w }));
    await this.saveWarehouses(defaults);
    return defaults;
  }

  async _incrementUnbackedChanges() {
    try {
      const shopInfo = (await this.getSetting('shop_info')) || { ...DEFAULT_SHOP_SETTINGS };
      shopInfo.unbackedChangesCount = (shopInfo.unbackedChangesCount || 0) + 1;
      await this.saveSetting('shop_info', shopInfo);
    } catch {
      // Ignored
    }
  }

  async markBackupCompleted() {
    const shopInfo = (await this.getSetting('shop_info')) || { ...DEFAULT_SHOP_SETTINGS };
    shopInfo.lastBackupTime = new Date().toISOString();
    shopInfo.unbackedChangesCount = 0;
    await this.saveSetting('shop_info', shopInfo);
  }

  // ================= BACKUP & RESTORE =================
  /**
   * Xuất toàn bộ CSDL ra JSON kèm Checksum & Version
   */
  async exportFullBackup() {
    await this.ensureReady();
    const stores = ['products', 'customers', 'orders', 'inventory_logs', 'stock_imports', 'quotations', 'debt_payments'];
    const exportData = {
      app: APP_CONFIG.APP_NAME,
      schemaVersion: APP_CONFIG.DB_VERSION,
      exportTime: new Date().toISOString(),
      stores: {},
      settings: {}
    };

    // Lấy dữ liệu tất cả các bảng (bao gồm cả thùng rác)
    for (const s of stores) {
      exportData.stores[s] = await this.getAll(s, true);
    }

    // Lấy toàn bộ cài đặt nghiệp vụ (shop_info, loại diều, đơn vị tính, kho hàng)
    const shopInfo = await this.getSetting('shop_info');
    if (shopInfo) exportData.settings['shop_info'] = shopInfo;

    const categories = await this.getSetting('product_categories');
    if (Array.isArray(categories)) exportData.settings['product_categories'] = categories;

    const warehouseCategories = await this.getSetting('warehouse_categories');
    if (warehouseCategories && typeof warehouseCategories === 'object') {
      exportData.settings['warehouse_categories'] = warehouseCategories;
    }

    const units = await this.getSetting('product_units');
    if (Array.isArray(units)) exportData.settings['product_units'] = units;

    const warehouses = await this.getSetting('product_warehouses');
    if (Array.isArray(warehouses)) {
      exportData.settings['product_warehouses'] = warehouses.filter(w => w && w.id && w.id !== 'new');
    }

    // Tính Checksum cho khối dữ liệu chính
    const payloadStr = JSON.stringify({
      stores: exportData.stores,
      settings: exportData.settings
    });
    exportData.checksum = await calculateChecksum(payloadStr);

    return exportData;
  }

  /**
   * Khôi phục CSDL từ đối tượng sao lưu
   * @param {object} backupData Đối tượng JSON đã nạp
   * @param {'replace'|'merge'} mode Chế độ khôi phục
   * @param {boolean} skipChecksum Bỏ qua lỗi checksum nếu người dùng đã xác nhận tiếp tục
   */
  async restoreFromBackup(backupData, mode = 'replace', skipChecksum = false) {
    await this.ensureReady();

    // 1. Kiểm tra cấu trúc bắt buộc
    if (!backupData || !backupData.stores || typeof backupData.stores !== 'object') {
      throw new Error('Dữ liệu sao lưu không đúng định dạng (thiếu dữ liệu bảng stores)!');
    }

    // 2. Kiểm tra checksum (nếu không bỏ qua)
    if (!skipChecksum && backupData.checksum) {
      const payloadStr = JSON.stringify({
        stores: backupData.stores,
        settings: backupData.settings
      });
      const expectedChecksum = await calculateChecksum(payloadStr);
      if (backupData.checksum !== expectedChecksum) {
        throw new Error('Mã băm Checksum không khớp! File sao lưu có thể đã bị sửa đổi hoặc thay đổi định dạng.');
      }
    }

    // 3. Tạo bản chụp cứu hộ an toàn trước khi ghi đè (không để lỗi snapshot cản trở khôi phục)
    try {
      console.log('[Restore] Đang tự động tạo bản chụp cứu hộ trước khi khôi phục...');
      await this.createSnapshot('Cứu hộ tự động trước khi khôi phục');
    } catch (snapErr) {
      console.warn('[Restore] Bỏ qua tạo snapshot cứu hộ do lỗi phụ:', snapErr);
    }

    const storeNames = ['products', 'customers', 'orders', 'inventory_logs', 'stock_imports', 'quotations', 'debt_payments'];

    await new Promise((resolve, reject) => {
      const tx = this.db.transaction([...storeNames, 'settings'], 'readwrite');
      tx.oncomplete = () => {
        console.log('[Restore] Transaction IndexedDB hoàn tất!');
        resolve(true);
      };
      tx.onerror = (e) => reject(new Error('Khôi phục thất bại (Transaction Error): ' + (e.target.error?.message || e.target.error)));
      tx.onabort = (e) => reject(new Error('Khôi phục bị hủy (Transaction Abort): ' + (e.target.error?.message || 'Lỗi ghi dữ liệu')));

      try {
        for (const s of storeNames) {
          const store = tx.objectStore(s);
          if (mode === 'replace') {
            store.clear();
          }

          const rawItems = Array.isArray(backupData.stores[s]) ? backupData.stores[s] : [];
          rawItems.forEach((rawItem, idx) => {
            if (!rawItem || typeof rawItem !== 'object') return;
            const item = { ...rawItem };

            // Đảm bảo khóa chính 'id' luôn là chuỗi hợp lệ để tránh IndexedDB abort toàn bộ transaction
            if (item.id === undefined || item.id === null || item.id === '') {
              item.id = `RST-${s}-${Date.now()}-${idx}`;
            } else {
              item.id = String(item.id);
            }

            if (item.isDeleted === undefined) item.isDeleted = false;
            else item.isDeleted = Boolean(item.isDeleted);

            if (s === 'products' && (!item.warehouse || item.warehouse === 'new')) {
              item.warehouse = 'kho-dieu';
            }

            store.put(item);
          });
        }

        // Khôi phục cài đặt (không ghi đè device_id và license_info của máy mới)
        const settingsStore = tx.objectStore('settings');
        const settingsData = backupData.settings || {};
        const nowIso = new Date().toISOString();

        if (settingsData['shop_info']) {
          const restoredShop = {
            ...DEFAULT_SHOP_SETTINGS,
            ...settingsData['shop_info'],
            lastBackupTime: nowIso,
            unbackedChangesCount: 0
          };
          settingsStore.put({
            key: 'shop_info',
            value: restoredShop,
            updatedAt: nowIso
          });
        }

        if (Array.isArray(settingsData['product_categories']) && settingsData['product_categories'].length > 0) {
          settingsStore.put({
            key: 'product_categories',
            value: settingsData['product_categories'],
            updatedAt: nowIso
          });
        }

        if (settingsData['warehouse_categories'] && typeof settingsData['warehouse_categories'] === 'object') {
          settingsStore.put({
            key: 'warehouse_categories',
            value: settingsData['warehouse_categories'],
            updatedAt: nowIso
          });
        }

        if (Array.isArray(settingsData['product_units']) && settingsData['product_units'].length > 0) {
          settingsStore.put({
            key: 'product_units',
            value: settingsData['product_units'],
            updatedAt: nowIso
          });
        }

        if (Array.isArray(settingsData['product_warehouses']) && settingsData['product_warehouses'].length > 0) {
          const cleanedWarehouses = settingsData['product_warehouses'].filter(w => w && w.id && w.id !== 'new');
          if (cleanedWarehouses.length > 0) {
            settingsStore.put({
              key: 'product_warehouses',
              value: cleanedWarehouses,
              updatedAt: nowIso
            });
          }
        }
      } catch (err) {
        tx.abort();
        reject(err);
      }
    });

    // Đọc kiểm chứng lại số liệu thực tế vừa ghi vào máy mới
    const restoredProducts = await this.getAll('products', false);
    const restoredCustomers = await this.getAll('customers', false);
    const restoredOrders = await this.getAll('orders', false);
    const restoredQuotes = await this.getAll('quotations', false);
    const restoredImports = await this.getAll('stock_imports', false);

    return {
      success: true,
      counts: {
        products: restoredProducts.length,
        customers: restoredCustomers.length,
        orders: restoredOrders.length,
        quotations: restoredQuotes.length,
        stock_imports: restoredImports.length
      }
    };
  }

  // ================= DAILY SNAPSHOTS (Disaster Recovery) =================
  async checkAndCreateDailySnapshot() {
    if (!this.snapshotDb) return;
    try {
      const todayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const existing = await this.getSnapshotByDate(todayKey);
      if (!existing) {
        console.log('[Snapshot] Chưa có bản chụp hôm nay. Đang tạo snapshot tự động...');
        await this.createSnapshot(`Bản chụp tự động ngày ${todayKey}`, todayKey);
      }
    } catch (err) {
      console.warn('Lỗi kiểm tra snapshot hàng ngày:', err);
    }
  }

  async createSnapshot(note = '', dateKey = null) {
    if (!this.snapshotDb) return null;
    const backupData = await this.exportFullBackup();
    const id = 'SNAP-' + Date.now();
    const snapshotRecord = {
      id,
      dateKey: dateKey || new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
      note,
      data: backupData,
      summary: {
        productsCount: (backupData.stores.products || []).filter(p => !p.isDeleted).length,
        ordersCount: (backupData.stores.orders || []).filter(o => !o.isDeleted).length,
        customersCount: (backupData.stores.customers || []).filter(c => !c.isDeleted).length
      }
    };

    return new Promise((resolve) => {
      const tx = this.snapshotDb.transaction('snapshots', 'readwrite');
      const store = tx.objectStore('snapshots');
      store.put(snapshotRecord);

      tx.oncomplete = async () => {
        // Dọn dẹp chỉ giữ lại tối đa SNAPSHOT_MAX_COUNT bản gần nhất
        await this._pruneSnapshots();
        resolve(snapshotRecord);
      };
      tx.onerror = () => resolve(null);
    });
  }

  async getSnapshotByDate(dateKey) {
    if (!this.snapshotDb) return null;
    return new Promise((resolve) => {
      const tx = this.snapshotDb.transaction('snapshots', 'readonly');
      const store = tx.objectStore('snapshots');
      const index = store.index('dateKey');
      const req = index.get(dateKey);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  async getAllSnapshots() {
    if (!this.snapshotDb) return [];
    return new Promise((resolve) => {
      const tx = this.snapshotDb.transaction('snapshots', 'readonly');
      const store = tx.objectStore('snapshots');
      const req = store.getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        resolve(list);
      };
      req.onerror = () => resolve([]);
    });
  }

  async _pruneSnapshots() {
    if (!this.snapshotDb) return;
    const all = await this.getAllSnapshots();
    if (all.length > APP_CONFIG.SNAPSHOT_MAX_COUNT) {
      const toDelete = all.slice(APP_CONFIG.SNAPSHOT_MAX_COUNT);
      const tx = this.snapshotDb.transaction('snapshots', 'readwrite');
      const store = tx.objectStore('snapshots');
      for (const item of toDelete) {
        store.delete(item.id);
      }
    }
  }

  // ================= XÓA DỮ LIỆU MẪU / KHỞI TẠO =================
  async clearAllBusinessData() {
    await this.ensureReady();
    // Tạo bản snapshot trước khi xóa sạch
    await this.createSnapshot('Bản chụp an toàn trước khi xóa trắng dữ liệu kinh doanh');

    const stores = ['products', 'customers', 'orders', 'inventory_logs', 'stock_imports', 'quotations', 'debt_payments'];
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(stores, 'readwrite');
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
      for (const s of stores) {
        tx.objectStore(s).clear();
      }
    });
  }
}

export const db = new KiteDatabase();
