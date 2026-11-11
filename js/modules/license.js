// Mô-đun Quản Lý Bản Quyền Khóa Theo Thiết Bị (Device-Locked License System)
// Hoạt động 100% Offline, bảo mật bằng thuật toán SHA-256 Checksum & Master Salt

import { db } from '../db.js';

export const LICENSE_CONFIG = {
  MASTER_SALT: 'KITE_SALT_2026_XUONG_DIEU_VIETNAM_KEY_SECURE_v1',
  DEFAULT_ADMIN_PIN: '202688',
  TRIAL_DAYS: 7, // 7 ngày dùng thử miễn phí cho máy mới
  PLANS: {
    'LIFE': { name: 'Vĩnh Viễn (Trọn Đời)', days: 0, code: 'LIFE' },
    '1Y': { name: 'Gói 1 Năm (365 ngày)', days: 365, code: '1Y' },
    '6M': { name: 'Gói 6 Tháng (180 ngày)', days: 180, code: '6M' },
    '1M': { name: 'Gói 1 Tháng (30 ngày)', days: 30, code: '1M' },
    'TRIAL': { name: 'Gói Dùng Thử (7 ngày)', days: 7, code: 'TRIAL' }
  }
};

/**
 * Hàm băm SHA-256 trả về chuỗi Hex (chạy được trên cả Trình duyệt Web và Node.js)
 */
export async function sha256Hex(str) {
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    const { createHash } = await import('crypto');
    return createHash('sha256').update(str).digest('hex');
  }
  throw new Error('Môi trường không hỗ trợ SHA-256');
}

/**
 * Lấy hoặc sinh mới Mã Thiết Bị (Device ID) duy nhất cho từng máy
 * Định dạng: KITE-XXXX-YYYY-ZZZZ (12 ký tự hex phân nhóm)
 */
export function getDeviceId() {
  const STORAGE_KEY = 'kite_device_id';
  let deviceId = '';

  try {
    if (typeof localStorage !== 'undefined') {
      deviceId = localStorage.getItem(STORAGE_KEY) || '';
    }
  } catch (e) {
    // Không đọc được localStorage
  }

  // Nếu chưa có, sinh mới từ ngẫu nhiên và lưu bền vững
  if (!deviceId || !deviceId.startsWith('KITE-')) {
    const hex = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1).toUpperCase();
    deviceId = `KITE-${hex()}-${hex()}-${hex()}`;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, deviceId);
      }
    } catch (e) {}
  }

  return deviceId;
}

/**
 * Định dạng thời gian còn lại thành chuỗi chi tiết: Ngày, Giờ, Phút, Giây
 * @param {string|Date} targetDate Ngày hết hạn
 * @returns {string} Chuỗi hiển thị (VD: "06 ngày 23 giờ 45 phút 12 giây")
 */
export function formatRemainingCountdown(targetDate) {
  if (!targetDate) return '';
  const target = new Date(targetDate).getTime();
  const diffMs = target - Date.now();
  if (diffMs <= 0) return '00 ngày 00 giờ 00 phút 00 giây (Hết hạn)';

  const totalSec = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  return `${String(days).padStart(2, '0')} ngày ${String(hours).padStart(2, '0')} giờ ${String(minutes).padStart(2, '0')} phút ${String(seconds).padStart(2, '0')} giây`;
}

/**
 * Tạo mã kích hoạt (License Key) cho một thiết bị cụ thể
 * @param {string} deviceId Mã thiết bị của khách (VD: KITE-A1B2-C3D4-E5F6)
 * @param {string} plan Loại gói: 'LIFE' | '1Y' | '6M' | '1M' | 'TRIAL'
 * @param {string|null} customExpiryDate Ngày hết hạn tuỳ chỉnh định dạng YYYYMMDD (nếu để trống tự tính)
 * @returns {Promise<string>} Mã License Key (VD: KITE-1Y-20271111-25CAC28E5915)
 */
export async function generateLicenseKey(deviceId, plan = 'LIFE', customExpiryDate = null) {
  const cleanDevice = (deviceId || '').trim().toUpperCase();
  if (!cleanDevice.startsWith('KITE-')) {
    throw new Error('Mã thiết bị không hợp lệ! Mã phải bắt đầu bằng KITE-');
  }

  let expiryStr = '99999999'; // Vĩnh viễn
  if (plan !== 'LIFE') {
    if (customExpiryDate) {
      expiryStr = customExpiryDate.replace(/[^0-9]/g, '').slice(0, 8);
    } else {
      const planCfg = LICENSE_CONFIG.PLANS[plan] || LICENSE_CONFIG.PLANS['1Y'];
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + (planCfg.days || 365));
      const y = expDate.getFullYear();
      const m = String(expDate.getMonth() + 1).padStart(2, '0');
      const d = String(expDate.getDate()).padStart(2, '0');
      expiryStr = `${y}${m}${d}`;
    }
  }

  const rawPayload = `${cleanDevice}|${plan}|${expiryStr}|${LICENSE_CONFIG.MASTER_SALT}`;
  const fullHash = await sha256Hex(rawPayload);
  const signature = fullHash.slice(0, 12).toUpperCase();

  return `KITE-${plan}-${expiryStr}-${signature}`;
}

/**
 * Kiểm tra tính hợp lệ của mã kích hoạt trên một thiết bị
 * @param {string} keyStr Mã kích hoạt người dùng nhập vào
 * @param {string|null} targetDeviceId Mã thiết bị cần kiểm tra (mặc định lấy thiết bị máy hiện tại)
 * @returns {Promise<{valid: boolean, reason?: string, plan?: string, expiresAt?: string, isLifetime?: boolean}>}
 */
export async function verifyLicenseKey(keyStr, targetDeviceId = null) {
  if (!keyStr || typeof keyStr !== 'string') {
    return { valid: false, reason: 'Chưa nhập mã kích hoạt' };
  }

  const cleanKey = keyStr.trim().toUpperCase().replace(/\s+/g, '');
  const parts = cleanKey.split('-');
  if (parts.length !== 4 || parts[0] !== 'KITE') {
    return { valid: false, reason: 'Định dạng mã bản quyền không đúng! Mẫu chuẩn: KITE-GÓI-NGÀY-MÃXÁCNHẬN' };
  }

  const [, plan, expiryStr, signature] = parts;
  const currentDevId = (targetDeviceId || getDeviceId()).trim().toUpperCase();

  // 1. Kiểm tra chữ ký mật với thiết bị hiện tại
  const rawPayload = `${currentDevId}|${plan}|${expiryStr}|${LICENSE_CONFIG.MASTER_SALT}`;
  const fullHash = await sha256Hex(rawPayload);
  const expectedSig = fullHash.slice(0, 12).toUpperCase();

  if (signature !== expectedSig) {
    return {
      valid: false,
      reason: 'Mã kích hoạt không khớp với máy này! (Mã này được cấp riêng cho một thiết bị khác)'
    };
  }

  // 2. Kiểm tra ngày hết hạn
  const isLifetime = (expiryStr === '99999999' || plan === 'LIFE');
  let expDate = null;

  if (!isLifetime) {
    if (expiryStr.length !== 8) {
      return { valid: false, reason: 'Ngày hết hạn trong mã không hợp lệ' };
    }
    const y = parseInt(expiryStr.slice(0, 4), 10);
    const m = parseInt(expiryStr.slice(4, 6), 10) - 1;
    const d = parseInt(expiryStr.slice(6, 8), 10);
    expDate = new Date(y, m, d, 23, 59, 59);

    if (isNaN(expDate.getTime())) {
      return { valid: false, reason: 'Ngày hết hạn trong mã không hợp lệ' };
    }

    const now = new Date();
    if (now > expDate) {
      const formattedDate = `${String(d).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${y}`;
      return {
        valid: false,
        reason: `Mã bản quyền này đã hết hạn vào ngày ${formattedDate}! Vui lòng liên hệ người bán để gia hạn.`
      };
    }
  }

  return {
    valid: true,
    plan,
    isLifetime,
    expiresAt: expDate ? expDate.toISOString() : null,
    expiryDisplay: isLifetime ? 'Vĩnh viễn (Trọn đời)' : `${expiryStr.slice(6, 8)}/${expiryStr.slice(4, 6)}/${expiryStr.slice(0, 4)}`
  };
}

/**
 * Service quản lý toàn diện Bản quyền cho ứng dụng
 */
export class LicenseService {
  constructor(app = null) {
    this.app = app;
    this.deviceId = getDeviceId();
  }

  /**
   * Lưu thông tin thiết bị vào IndexedDB để đồng bộ bền vững
   */
  async ensureDeviceIdPersisted() {
    try {
      const savedDevId = await db.getSetting('device_id');
      if (!savedDevId) {
        await db.saveSetting('device_id', this.deviceId);
      } else if (savedDevId !== this.deviceId) {
        // Ưu tiên mã đã lưu trong IndexedDB nếu localStorage bị xóa
        this.deviceId = savedDevId;
        try {
          localStorage.setItem('kite_device_id', savedDevId);
        } catch (e) {}
      }
    } catch (e) {
      console.warn('[License] Lỗi đồng bộ device_id với DB:', e);
    }
  }

  /**
   * Lấy ngày bắt đầu cài đặt app lần đầu tiên
   */
  async getInstallTime() {
    let installTime = null;
    try {
      if (typeof localStorage !== 'undefined') {
        installTime = localStorage.getItem('kite_first_install_time');
      }
    } catch (e) {}

    if (!installTime) {
      try {
        installTime = await db.getSetting('first_install_time');
      } catch (e) {}
    }

    if (!installTime) {
      installTime = new Date().toISOString();
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('kite_first_install_time', installTime);
        }
        await db.saveSetting('first_install_time', installTime);
      } catch (e) {}
    }

    return new Date(installTime);
  }

  /**
   * Tính số ngày dùng thử còn lại (Mặc định 7 ngày kể từ lần đầu mở app)
   */
  async getTrialStatus() {
    const installDate = await this.getInstallTime();
    const expiresAt = new Date(installDate.getTime() + LICENSE_CONFIG.TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const diffMs = expiresAt.getTime() - Date.now();
    const isTrialActive = diffMs > 0;
    const remainingDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    return {
      isTrialActive,
      daysLeft: remainingDays,
      totalTrialDays: LICENSE_CONFIG.TRIAL_DAYS,
      installedAt: installDate.toISOString(),
      expiresAt: expiresAt.toISOString(),
      diffMs
    };
  }

  /**
   * Đọc thông tin bản quyền đã lưu
   */
  async getSavedLicense() {
    try {
      const lic = await db.getSetting('license_info');
      if (lic && lic.licenseKey) return lic;
    } catch (e) {}

    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('kite_license_info');
        if (raw) return JSON.parse(raw);
      }
    } catch (e) {}

    return null;
  }

  /**
   * Lưu thông tin bản quyền mới vào DB & LocalStorage
   */
  async saveLicense(licenseData) {
    try {
      await db.saveSetting('license_info', licenseData);
    } catch (e) {
      console.warn('[License] Lỗi lưu license vào DB:', e);
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('kite_license_info', JSON.stringify(licenseData));
      }
    } catch (e) {}
  }

  /**
   * Kiểm tra toàn diện trạng thái bản quyền hiện tại của app
   * @returns {Promise<{status: 'licensed'|'trial'|'expired', planName: string, daysLeft: number, expiryText: string, licenseKey: string}>}
   */
  async checkStatus() {
    await this.ensureDeviceIdPersisted();
    const saved = await this.getSavedLicense();

    // 1. Nếu đã có key bản quyền -> Kiểm tra tính hợp lệ
    if (saved && saved.licenseKey) {
      const check = await verifyLicenseKey(saved.licenseKey, this.deviceId);
      if (check.valid) {
        let daysLeft = 99999;
        if (!check.isLifetime && check.expiresAt) {
          const expTime = new Date(check.expiresAt).getTime();
          daysLeft = Math.max(0, Math.ceil((expTime - Date.now()) / (1000 * 60 * 60 * 24)));
        }

        const planName = (LICENSE_CONFIG.PLANS[check.plan] && LICENSE_CONFIG.PLANS[check.plan].name) || check.plan;
        const countdownText = check.isLifetime
          ? 'Vĩnh viễn (Trọn đời không giới hạn)'
          : formatRemainingCountdown(check.expiresAt);

        return {
          status: 'licensed',
          plan: check.plan,
          planName,
          isLifetime: check.isLifetime,
          expiresAt: check.expiresAt,
          expiryText: check.expiryDisplay,
          daysLeft,
          countdownText,
          licenseKey: saved.licenseKey,
          activatedAt: saved.activatedAt || null,
          customerName: saved.customerName || '',
          deviceId: this.deviceId
        };
      }
    }

    // 2. Chưa có key hoặc key hỏng -> Kiểm tra chế độ Dùng thử (Trial)
    const trial = await this.getTrialStatus();
    if (trial.isTrialActive) {
      return {
        status: 'trial',
        plan: 'TRIAL',
        planName: `Dùng Thử Miễn Phí (${trial.daysLeft} ngày)`,
        isLifetime: false,
        daysLeft: trial.daysLeft,
        expiresAt: trial.expiresAt,
        expiryText: `Hết hạn: ${new Date(trial.expiresAt).toLocaleDateString('vi-VN')}`,
        countdownText: formatRemainingCountdown(trial.expiresAt),
        licenseKey: '',
        deviceId: this.deviceId
      };
    }

    // 3. Đã hết hạn dùng thử và chưa kích hoạt -> Khóa ứng dụng
    return {
      status: 'expired',
      plan: 'EXPIRED',
      planName: 'Đã Hết Hạn Bản Quyền',
      isLifetime: false,
      daysLeft: 0,
      expiresAt: null,
      expiryText: 'Hết hạn dùng thử',
      countdownText: '00 ngày 00 giờ 00 phút 00 giây (Hết hạn)',
      licenseKey: saved ? saved.licenseKey : '',
      deviceId: this.deviceId
    };
  }

  /**
   * Thực hiện kích hoạt với License Key
   */
  async activate(keyStr, customerName = '') {
    const check = await verifyLicenseKey(keyStr, this.deviceId);
    if (!check.valid) {
      return { success: false, error: check.reason };
    }

    const licenseData = {
      licenseKey: keyStr.trim().toUpperCase(),
      plan: check.plan,
      isLifetime: check.isLifetime,
      expiresAt: check.expiresAt,
      expiryDisplay: check.expiryDisplay,
      deviceId: this.deviceId,
      customerName: customerName.trim(),
      activatedAt: new Date().toISOString()
    };

    await this.saveLicense(licenseData);
    return {
      success: true,
      message: `🎉 Kích hoạt bản quyền thành công! Gói: ${LICENSE_CONFIG.PLANS[check.plan]?.name || check.plan}.`,
      licenseData
    };
  }

  /**
   * Hiển thị Màn hình Khóa Bản Quyền khi app bị hết hạn
   */
  showLockModal(onSuccessCallback = null) {
    const existing = document.getElementById('license-lock-modal');
    if (existing) existing.remove();

    const devId = this.deviceId;
    const modalHtml = `
      <div class="modal-backdrop license-lock-backdrop" id="license-lock-modal" style="z-index: 999999; background: rgba(15, 23, 42, 0.92); backdrop-filter: blur(8px);">
        <div class="modal-content license-lock-card" style="max-width: 480px; width: 92%; border-radius: 20px; border: 2px solid #38bdf8; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
          
          <div class="text-center p-3" style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #fff; border-radius: 18px 18px 0 0;">
            <div id="lock-secret-trigger" style="font-size: 40px; margin-bottom: 4px; cursor: pointer; user-select: none;">🪁</div>
            <h2 style="font-size: 20px; font-weight: 900; margin: 0; color: #fff;">KÍCH HOẠT BẢN QUYỀN</h2>
            <div style="font-size: 12px; opacity: 0.9; margin-top: 3px;">Phần Mềm Quản Lý Bán Diều & Tồn Kho (Khóa Máy)</div>
          </div>

          <div class="p-3">
            <div class="alert alert-warning text-sm mb-3" style="border-radius: 10px; font-weight: 600; line-height: 1.5;">
              ⚠️ Bản dùng thử miễn phí của bạn đã hết hạn. Vui lòng gửi <b>Mã Thiết Bị</b> dưới đây cho người bán để nhận mã kích hoạt bản quyền.
            </div>

            <!-- Khối Mã Thiết Bị Của Khách -->
            <div class="card p-3 mb-3" style="background: #f8fafc; border: 1.5px dashed #0284c7; border-radius: 12px; text-align: center;">
              <div class="text-xs text-muted mb-1 font-bold">MÃ THIẾT BỊ CỦA BẠN (DEVICE ID):</div>
              <div class="text-lg text-primary text-bold" id="lock-screen-device-id" style="font-family: monospace; letter-spacing: 1.5px; user-select: all; padding: 6px; background: #e0f2fe; border-radius: 8px;">
                ${devId}
              </div>
              <div class="mt-2" style="display: flex; gap: 8px; justify-content: center;">
                <button type="button" class="btn btn-outline-primary btn-sm" id="btn-copy-device-id" style="font-weight: 700;">
                  📋 Sao Chép Mã Máy
                </button>
                <button type="button" class="btn btn-primary btn-sm" id="btn-send-zalo-device-id" style="font-weight: 700;">
                  💬 Gửi Zalo Ngay
                </button>
              </div>
            </div>

            <!-- Khối Nhập Key Bản Quyền -->
            <div class="form-group mb-3">
              <label class="form-label text-bold" style="color: #0f172a; font-size: 13px;">
                🔑 Dán Mã Kích Hoạt (License Key):
              </label>
              <input type="text" id="lock-screen-license-key" class="form-input form-input-lg text-bold text-center" 
                placeholder="VD: KITE-1Y-20271111-..." 
                style="font-family: monospace; font-size: 14px; text-transform: uppercase;">
              <div class="text-xs text-muted mt-1">Mã kích hoạt có định dạng: <code>KITE-GÓI-NGÀY-MÃXÁC</code></div>
            </div>

            <button type="button" class="btn btn-success btn-block btn-lg" id="btn-submit-license-key" style="font-weight: 800; font-size: 16px;">
              🚀 KÍCH HOẠT PHẦN MỀM
            </button>

            <!-- Nút DEV KEY -->
            <div class="mt-3 pt-2 text-center" style="border-top: 1px dashed #cbd5e1;">
              <button type="button" class="btn btn-link btn-xs text-muted" id="btn-lock-dev-key" style="font-size: 11px; text-decoration: none; font-family: monospace; font-weight: 700;">
                ⚙️ DEV KEY
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Gán sự kiện
    const modalEl = document.getElementById('license-lock-modal');

    // Nút Sao chép mã máy
    document.getElementById('btn-copy-device-id').addEventListener('click', () => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(devId).then(() => {
          alert('✓ Đã sao chép mã thiết bị vào bộ nhớ tạm: ' + devId);
        });
      } else {
        prompt('Sao chép mã máy của bạn:', devId);
      }
    });

    // Nút Gửi Zalo
    document.getElementById('btn-send-zalo-device-id').addEventListener('click', () => {
      const msg = `Chào bạn, tôi muốn kích hoạt bản quyền phần mềm Quản Lý Diều. Mã thiết bị của tôi là: ${devId}`;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(msg);
      }
      const zaloUrl = `https://zalo.me/`;
      window.open(zaloUrl, '_blank');
      alert(`Đã sao chép nội dung tin nhắn gửi Zalo:\n\n"${msg}"\n\nBạn chỉ cần dán vào Zalo gửi cho người bán!`);
    });

    // Nút Kích hoạt
    document.getElementById('btn-submit-license-key').addEventListener('click', async () => {
      const keyInp = document.getElementById('lock-screen-license-key');
      const val = (keyInp.value || '').trim();
      if (!val) {
        return alert('Vui lòng nhập hoặc dán mã kích hoạt nhận được từ người bán!');
      }

      const res = await this.activate(val);
      if (res.success) {
        alert(res.message);
        modalEl.remove();
        if (onSuccessCallback) onSuccessCallback();
        else window.location.reload();
      } else {
        alert('❌ KÍCH HOẠT THẤT BẠI:\n' + res.error);
      }
    });

    // Lối mở Admin Keygen bí mật dành riêng cho bạn (chạm biểu tượng con diều 5 lần)
    let secretTapCount = 0;
    let secretTapTimer = null;
    const kiteLogo = document.getElementById('lock-secret-trigger');
    if (kiteLogo) {
      kiteLogo.addEventListener('click', () => {
        secretTapCount++;
        clearTimeout(secretTapTimer);
        secretTapTimer = setTimeout(() => { secretTapCount = 0; }, 2000);
        if (secretTapCount >= 5) {
          secretTapCount = 0;
          const pin = prompt('Nhập mã xác thực:');
          if (!pin) return;
          this.checkAdminPin(pin).then(ok => {
            if (ok) {
              modalEl.remove();
              this.showAdminKeygenModal();
            } else {
              alert('Mã xác thực không hợp lệ.');
            }
          });
        }
      });
    }

    // Nút DEV KEY trên màn hình khóa
    const btnLockDev = document.getElementById('btn-lock-dev-key');
    if (btnLockDev) {
      btnLockDev.addEventListener('click', () => {
        const pin = prompt('Nhập mã xác thực DEV KEY:');
        if (!pin) return;
        this.checkAdminPin(pin).then(ok => {
          if (ok) {
            modalEl.remove();
            this.showAdminKeygenModal();
          } else {
            alert('Mã xác thực DEV KEY không hợp lệ.');
          }
        });
      });
    }
  }

  /**
   * Kiểm tra mã PIN Admin
   */
  async checkAdminPin(enteredPin) {
    let savedPin = LICENSE_CONFIG.DEFAULT_ADMIN_PIN;
    try {
      const pinSetting = await db.getSetting('admin_license_pin');
      if (pinSetting) savedPin = String(pinSetting).trim();
    } catch (e) {}

    return String(enteredPin).trim() === savedPin;
  }

  /**
   * Đổi mã PIN Admin
   */
  async setAdminPin(newPin) {
    const cleanPin = String(newPin).trim();
    if (!cleanPin || cleanPin.length < 4) {
      throw new Error('Mã PIN phải có ít nhất 4 ký tự!');
    }
    await db.saveSetting('admin_license_pin', cleanPin);
    return true;
  }

  /**
   * Lưu lại nhật ký các Key đã cấp
   */
  async logIssuedKey(logItem) {
    try {
      const logs = (await db.getSetting('issued_keys_log')) || [];
      logs.unshift({
        ...logItem,
        issuedAt: new Date().toISOString()
      });
      // Giữ tối đa 100 log
      await db.saveSetting('issued_keys_log', logs.slice(0, 100));
    } catch (e) {
      console.warn('[License] Lỗi ghi log issued keys:', e);
    }
  }

  /**
   * Đọc danh sách key đã cấp
   */
  async getIssuedKeys() {
    try {
      return (await db.getSetting('issued_keys_log')) || [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Modal Công Cụ Cấp Key Bản Quyền (Dành riêng cho Người Bán)
   */
  async showAdminKeygenModal() {
    const existing = document.getElementById('admin-keygen-modal');
    if (existing) existing.remove();

    const currentDevId = this.deviceId;
    const modalHtml = `
      <div class="modal-backdrop" id="admin-keygen-modal" style="z-index: 999999;">
        <div class="modal-content" style="max-width: 520px; max-height: 90vh; overflow-y: auto;">
          <div class="modal-header bg-dark text-white p-3">
            <h2 class="modal-title" style="color: #fff; font-size: 17px; display: flex; align-items: center; gap: 8px;">
              🛡️ BỘ CẤP KEY BẢN QUYỀN (DÀNH CHO NGƯỜI BÁN)
            </h2>
            <button class="modal-close text-white" id="btn-close-keygen-modal">&times;</button>
          </div>

          <div class="modal-body p-3">
            <div class="alert alert-info text-xs mb-3">
              💡 <b>Cách dùng:</b> Khách gửi <b>Mã Thiết Bị (Device ID)</b> -> Bạn dán vào đây -> Chọn gói thời hạn -> Bấm <b>Tạo Key</b> -> Sao chép tin nhắn gửi lại cho khách qua Zalo.
            </div>

            <div class="form-group mb-2">
              <label class="form-label required text-bold">1. Mã thiết bị của khách (Device ID):</label>
              <div style="display: flex; gap: 6px;">
                <input type="text" id="kg-client-device" class="form-input text-bold" placeholder="VD: KITE-A1B2-C3D4-E5F6" style="font-family: monospace; text-transform: uppercase;">
                <button type="button" class="btn btn-outline-secondary btn-sm" id="btn-kg-use-my-device" title="Lấy mã của máy này">
                  Máy này
                </button>
              </div>
            </div>

            <div class="form-group mb-2">
              <label class="form-label text-bold">2. Tên khách hàng / Ghi chú:</label>
              <input type="text" id="kg-client-name" class="form-input" placeholder="VD: Anh Nam (Hải Phòng - Xưởng Diều)">
            </div>

            <div class="form-group mb-3">
              <label class="form-label required text-bold">3. Gói bản quyền muốn cấp:</label>
              <select id="kg-plan-select" class="form-select text-bold">
                <option value="LIFE">🌟 Gói Vĩnh Viễn (Trọn Đời - Không giới hạn)</option>
                <option value="1Y" selected>📅 Gói 1 Năm (365 ngày)</option>
                <option value="6M">📅 Gói 6 Tháng (180 ngày)</option>
                <option value="1M">📅 Gói 1 Tháng (30 ngày)</option>
                <option value="TRIAL">🎁 Gói Dùng Thử (7 ngày)</option>
              </select>
            </div>

            <button type="button" class="btn btn-primary btn-block btn-lg" id="btn-generate-client-key" style="font-weight: 800;">
              ⚡ TẠO KEY BẢN QUYỀN NGAY
            </button>

            <!-- Kết quả Key vừa tạo -->
            <div id="kg-result-box" class="card p-3 mt-3 bg-light" style="display:none; border: 1.5px solid #22c55e;">
              <div class="text-xs text-success text-bold mb-1">🎉 KEY BẢN QUYỀN ĐÃ ĐƯỢC TẠO THÀNH CÔNG:</div>
              <div class="text-bold text-lg" id="kg-output-key" style="font-family: monospace; color: #15803d; word-break: break-all; background: #dcfce7; padding: 8px; border-radius: 8px; text-align: center;"></div>
              
              <div class="mt-2" style="display: flex; gap: 8px;">
                <button type="button" class="btn btn-success btn-block btn-sm" id="btn-copy-zalo-script" style="font-weight: 700;">
                  📋 Sao Chép Tin Nhắn Gửi Khách (Zalo)
                </button>
                <button type="button" class="btn btn-outline-primary btn-sm" id="btn-quick-activate-this-machine" style="display:none; white-space:nowrap;">
                  Kích hoạt máy này
                </button>
              </div>
            </div>

            <!-- Tab Lịch sử cấp key & Đổi PIN -->
            <div class="mt-4 pt-3" style="border-top: 1px dashed #cbd5e1;">
              <details>
                <summary class="text-xs text-muted cursor-pointer text-bold">⚙️ Quản Lý Thêm: Đổi Mã PIN & Lịch Sử Cấp Key</summary>
                <div class="mt-2">
                  <div class="form-row mb-2">
                    <div class="form-group flex-2">
                      <input type="password" id="kg-new-pin" class="form-input-sm" placeholder="Nhập PIN Admin mới (tối thiểu 4 số)">
                    </div>
                    <div class="form-group flex-1">
                      <button type="button" class="btn btn-secondary btn-sm" id="btn-save-new-pin">Đổi PIN</button>
                    </div>
                  </div>
                  <div class="text-xs text-muted">Lịch sử cấp key lưu trên máy bạn để tiện tra cứu khách hàng cũ.</div>
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('admin-keygen-modal');
    const close = () => modal.remove();
    document.getElementById('btn-close-keygen-modal').addEventListener('click', close);

    const clientDevInp = document.getElementById('kg-client-device');
    const clientNameInp = document.getElementById('kg-client-name');
    const planSelect = document.getElementById('kg-plan-select');
    const resultBox = document.getElementById('kg-result-box');
    const outputKeyEl = document.getElementById('kg-output-key');
    const btnQuickActivate = document.getElementById('btn-quick-activate-this-machine');

    document.getElementById('btn-kg-use-my-device').addEventListener('click', () => {
      clientDevInp.value = currentDevId;
    });

    let lastCreatedKey = '';
    let lastClientDevice = '';
    let lastPlan = '';
    let lastClientName = '';

    document.getElementById('btn-generate-client-key').addEventListener('click', async () => {
      const dev = (clientDevInp.value || '').trim();
      if (!dev) return alert('Vui lòng nhập Mã thiết bị (Device ID) của khách!');
      const plan = planSelect.value;
      const clientName = (clientNameInp.value || '').trim();

      try {
        const key = await generateLicenseKey(dev, plan);
        lastCreatedKey = key;
        lastClientDevice = dev;
        lastPlan = plan;
        lastClientName = clientName;

        outputKeyEl.textContent = key;
        resultBox.style.display = 'block';

        if (dev.toUpperCase() === currentDevId.toUpperCase()) {
          btnQuickActivate.style.display = 'block';
        } else {
          btnQuickActivate.style.display = 'none';
        }

        // Lưu vào log
        await this.logIssuedKey({
          licenseKey: key,
          deviceId: dev,
          customerName: clientName,
          plan: plan,
          planName: LICENSE_CONFIG.PLANS[plan]?.name || plan
        });
      } catch (err) {
        alert('Lỗi tạo key: ' + err.message);
      }
    });

    // Sao chép tin nhắn Zalo gửi khách
    document.getElementById('btn-copy-zalo-script').addEventListener('click', () => {
      if (!lastCreatedKey) return;
      const planTitle = LICENSE_CONFIG.PLANS[lastPlan]?.name || lastPlan;
      const msg = 
`🪁 KÍCH HOẠT BẢN QUYỀN PHẦN MỀM BÁN DIỀU 🪁
----------------------------------------
Kính gửi: ${lastClientName || 'Quý Khách Hàng'}
Mã thiết bị: ${lastClientDevice}
Gói bản quyền: ${planTitle}

🔑 MÃ KÍCH HOẠT CỦA BẠN:
👉 ${lastCreatedKey} 👈

📖 HƯỚNG DẪN KÍCH HOẠT:
1. Mở phần mềm Quản Lý Diều trên máy của bạn.
2. Sao chép và dán chính xác dòng mã kích hoạt ở trên vào ô "Mã kích hoạt".
3. Bấm nút [🚀 KÍCH HOẠT PHẦN MỀM] là mở khóa thành công!

Chúc bạn buôn may bán đắt!`;

      if (navigator.clipboard) {
        navigator.clipboard.writeText(msg).then(() => {
          alert('✓ Đã sao chép tin nhắn gửi Zalo!\nBạn chỉ cần mở Zalo và dán gửi cho khách hàng.');
        });
      } else {
        prompt('Sao chép tin nhắn gửi khách:', msg);
      }
    });

    // Nút kích hoạt nhanh nếu tạo cho chính máy này
    btnQuickActivate.addEventListener('click', async () => {
      if (!lastCreatedKey) return;
      const res = await this.activate(lastCreatedKey, lastClientName);
      if (res.success) {
        alert('🎉 Đã kích hoạt bản quyền cho máy này thành công!');
        close();
        window.location.reload();
      } else {
        alert('Lỗi kích hoạt: ' + res.error);
      }
    });

    // Đổi mã PIN
    document.getElementById('btn-save-new-pin').addEventListener('click', async () => {
      const newPinInp = document.getElementById('kg-new-pin');
      const p = (newPinInp.value || '').trim();
      if (!p || p.length < 4) return alert('Mã PIN phải từ 4 số trở lên!');
      await this.setAdminPin(p);
      alert('✓ Đã đổi mã PIN Quản trị thành: ' + p);
      newPinInp.value = '';
    });
  }
}

export const licenseService = new LicenseService();
