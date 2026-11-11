# Ứng Dụng Quản Lý Bán Diều & Báo Giá (Offline-First PWA)

Ứng dụng quản lý bán hàng, báo giá, kho diều và theo dõi công nợ thiết kế chuyên biệt cho hộ kinh doanh bán diều (kite). Ứng dụng chạy **hoàn toàn offline**, không cần mạng, không cần máy chủ (backend), dữ liệu lưu trực tiếp và an toàn trong bộ nhớ máy điện thoại.

---

## 🌟 TÍNH NĂNG NỔI BẬT

1. **⚡ Thu ngân & Bán hàng nhanh (POS):**
   - Thêm diều vào đơn bằng 1 chạm, tìm kiếm nhanh theo tên/mã/kích thước/màu sắc.
   - Bán cho khách lẻ hoặc khách quen có lưu thông tin.
   - Chỉnh giá bán, số lượng, chiết khấu (% hoặc số tiền), phí vận chuyển linh hoạt.
   - Thanh toán đa dạng: Tiền mặt, Chuyển khoản, Ghi nợ, Trả một phần.
   - Tự động trừ tồn kho khi hoàn tất đơn bằng **Transaction an toàn**. Cảnh báo thông minh khi bán vượt tồn kho (cho phép xác nhận xuất âm).
   - Hủy đơn hàng hoàn trả số lượng lại vào kho ngay lập tức.

2. **🪁 Quản lý sản phẩm diều & phụ kiện:**
   - Quản lý tên diều, mã tự sinh, nhóm (Khí động học, Diều sáo, Diều rồng, Phượng hoàng, Sáo còi, Guồng cuộn dây...), kích thước, màu sắc, giá nhập gốc, giá bán, tồn kho, định mức cảnh báo tồn thấp.
   - Hỗ trợ chụp/tải ảnh diều, **tự động nén ảnh nhỏ** trước khi lưu để app luôn nhẹ và mượt.
   - Xóa mềm an toàn (đưa vào Thùng rác, không làm hỏng dữ liệu đơn cũ).

3. **📑 Báo giá chuyên nghiệp (Xuất PDF & Excel):**
   - Tạo báo giá riêng biệt với số báo giá tự tăng (`BG-YYYY-XXXX`).
   - **Xuất file PDF tiếng Việt có dấu chuẩn 100%**: Đã nhúng sẵn font tiếng Việt offline, hiển thị đầy đủ logo, thông tin cửa hàng, bảng hàng hóa, tổng tiền số và chữ, thông tin chuyển khoản ngân hàng, ngày hiệu lực.
   - **Xuất file Excel (.xlsx)** của báo giá.
   - Nút chia sẻ trực tiếp qua **Zalo / Messenger / Email** (Web Share API) hoặc tải file về máy.
   - Nút **"Lên Đơn Bán" (1-Click)**: Tự động chuyển báo giá thành đơn hàng thực tế và trừ kho ngay lập tức.

4. **📦 Quản lý kho hàng & Truy vết biến động:**
   - Tạo **Phiếu nhập hàng** (tăng tồn kho, tự động cập nhật giá nhập mới nhất).
   - **Cân kho / Điều chỉnh tồn kho** có ghi lý do rõ ràng.
   - **Lịch sử kho (Audit Trail)**: Ghi lại từng biến động (Bán hàng, Nhập kho, Hủy đơn, Kiểm kê) kèm số lượng trước và sau để truy vết khi lệch hàng.

5. **👥 Khách hàng & Công nợ:**
   - Quản lý danh bạ khách, lịch sử mua hàng và tổng số tiền đã chi tiêu.
   - Theo dõi danh sách khách còn nợ tiền diều.
   - Ghi nhận các đợt thu nợ (tiền mặt / chuyển khoản), lưu lịch sử thanh toán nợ.

6. **📊 Báo cáo kinh doanh & Tồn kho:**
   - Xem theo: Hôm nay, 7 ngày qua, Tháng này hoặc Khoảng ngày tùy chọn.
   - Doanh thu, Số đơn, Giá vốn hàng bán (COGS), **Lợi nhuận gộp (Lãi gộp)**, dòng tiền (Tiền mặt / Chuyển khoản / Công nợ).
   - Ghi chú nhắc nhở: *Doanh thu không phải là lợi nhuận*.
   - Danh sách diều bán chạy, danh sách hàng sắp hết tồn kho, giá trị tồn kho theo vốn và theo giá bán.
   - Xuất báo cáo tổng kết ra file Excel.

7. **🛡️ BẢO VỆ DỮ LIỆU TỐI ĐA (Offline Data Protection):**
   - Tự động gọi `navigator.storage.persist()` xin quyền lưu trữ bền vững để hệ điều hành không dọn dẹp dữ liệu.
   - **Nút SAO LƯU:** Xuất toàn bộ dữ liệu (sản phẩm, ảnh, khách, đơn, kho, cài đặt) ra 1 file `.json` có kèm mã băm kiểm tra tính toàn vẹn (Checksum SHA-256). Gửi thẳng vào Zalo Cloud hoặc Google Drive.
   - **Nút KHÔI PHỤC:** Nạp lại dữ liệu, kiểm tra checksum, xem trước thông tin và cho phép chọn *Thay thế toàn bộ* hoặc *Gộp dữ liệu*. **LUÔN tự động tạo bản chụp cứu hộ ngay trước khi nạp**.
   - **Bản chụp tự động (Snapshot hàng ngày):** Tự động sao lưu 1 bản nội bộ mỗi ngày khi mở app, giữ 7 bản gần nhất để cứu khi thao tác nhầm.
   - **Thùng rác:** Cho phép xem lại và khôi phục các mục đã xóa mềm.
   - **Xuất Excel toàn bộ:** Tạo bản sao lưu Excel tất cả các bảng đọc được bằng mắt thường.
   - Banner cảnh báo nổi bật màu đỏ/vàng trên đầu màn hình nếu quá 3 ngày chưa sao lưu hoặc có hơn 20 thay đổi mới.

---

## 🚀 HƯỚNG DẪN ĐƯA LÊN HOSTING TĨNH MIỄN PHÍ

> Toàn bộ ứng dụng là HTML + CSS + JS thuần, **không cần cài đặt môi trường, không cần lệnh build**. Bạn chỉ cần tải thư mục này lên hosting tĩnh.

### Cách 1: Đưa lên GitHub Pages (Miễn phí 100%)

1. Truy cập [github.com](https://github.com) và đăng nhập (hoặc tạo tài khoản miễn phí).
2. Bấm dấu **+** ở góc trên bên phải ➔ Chọn **New repository**.
3. Đặt tên (ví dụ: `ban-dieu`), chọn **Public** ➔ Bấm **Create repository**.
4. Tại trang hiển thị, bấm vào chữ **"uploading an existing file"**.
5. Kéo toàn bộ các file và thư mục trong thư mục này vào trình duyệt (bao gồm `index.html`, `manifest.json`, `sw.js`, `css/`, `js/`, `icons/`).
6. Bấm nút xanh **Commit changes**.
7. Chuyển sang tab **Settings** của repository ➔ Chọn mục **Pages** ở thanh menu bên trái.
8. Tại mục **Branch**, chọn `main` (hoặc `master`) và thư mục `/(root)` ➔ Bấm **Save**.
9. Chờ khoảng 1 - 2 phút, GitHub sẽ cung cấp cho bạn một đường link trang web dạng:
   `https://<ten-tai-khoan>.github.io/ban-dieu/`
10. Mở đường link này trên điện thoại của bạn!

---

### Cách 2: Đưa lên Cloudflare Pages (Siêu nhanh, bảo mật cao)

1. Đăng ký tài khoản miễn phí tại [cloudflare.com](https://cloudflare.com).
2. Vào mục **Workers & Pages** ➔ Bấm **Create application** ➔ Chọn tab **Pages** ➔ **Upload assets**.
3. Đặt tên dự án (ví dụ: `tiem-dieu`).
4. Kéo thả toàn bộ thư mục dự án này vào ô tải lên.
5. Bấm **Deploy site**.
6. Cloudflare sẽ cấp ngay cho bạn một tên miền miễn phí cực nhanh dạng:
   `https://tiem-dieu.pages.dev`
7. Mở link trên điện thoại và bắt đầu sử dụng!

---

## 📱 HƯỚNG DẪN CÀI ĐẶT LÊN ĐIỆN THOẠI & CHẠY OFFLINE

### 🍏 Dành cho iPhone / iPad (Trình duyệt Safari)

1. Mở đường link ứng dụng bằng trình duyệt **Safari** (không dùng Chrome trên iPhone).
2. Bấm vào nút **Chia sẻ** (biểu tượng ô vuông có mũi tên hướng lên ở thanh đáy màn hình).
3. Cuộn xuống và chọn **"Thêm vào MH chính" (Add to Home Screen)**.
4. Bấm **Thêm** ở góc trên bên phải.
5. Biểu tượng con diều sẽ xuất hiện trên màn hình điện thoại như một ứng dụng thông thường.
6. **LƯU Ý CỰC KỲ QUAN TRỌNG TRÊN IPHONE:**
   - **Luôn mở app từ biểu tượng con diều ngoài màn hình chính**, không mở dùng trong tab Safari thường. Khi chạy từ màn hình chính, iOS sẽ coi đây là ứng dụng độc lập và giữ dữ liệu bền vững (không tự động xóa sau 7 ngày).

---

### 🤖 Dành cho điện thoại Android (Google Chrome)

1. Mở đường link ứng dụng bằng trình duyệt **Google Chrome**.
2. Bấm vào nút **Menu 3 chấm** ở góc trên bên phải màn hình.
3. Chọn **"Cài đặt ứng dụng"** hoặc **"Thêm vào Màn hình chính"**.
4. Bấm **Cài đặt**.
5. Mở ứng dụng từ màn hình chính. Kể từ lúc này, bạn có thể **tắt hoàn toàn Wifi và 4G**, app vẫn mở lên và bán hàng bình thường!

---

## 🔄 CẬP NHẬT PHIÊN BẢN MỚI MÀ KHÔNG MẤT DỮ LIỆU

- Khi bạn sửa code hoặc tải phiên bản mới lên GitHub/Cloudflare:
  1. Chỉ cần đổi chuỗi phiên bản trong file `sw.js` (ví dụ từ `v1.0.0` thành `v1.0.1`).
  2. Khi người dùng mở app trên điện thoại, thanh banner màu vàng sẽ tự động hiện lên:
     **"🚀 Đã có phiên bản mới của ứng dụng! [Cập nhật ngay]"**.
  3. Bấm vào nút **"Cập nhật ngay"**, ứng dụng sẽ tự động làm mới giao diện với phiên bản mới nhất.
  4. **Toàn bộ dữ liệu sản phẩm, đơn hàng, khách hàng nằm trong IndexedDB được giữ nguyên vẹn 100%**, không bao giờ bị mất!

---

## 💾 QUY TRÌNH SAO LƯU & KHÔI PHỤC DỮ LIỆU

### Cách Sao Lưu (Nên làm định kỳ 1 tuần/lần hoặc cuối ngày bán nhiều)
1. Vào tab **⚙️ Cài Đặt**.
2. Bấm nút màu xanh to: **💾 SAO LƯU DỮ LIỆU (Gửi Zalo / Drive)**.
3. Hộp thoại chia sẻ của điện thoại sẽ hiện ra ➔ Chọn **Zalo** (gửi vào mục "Cloud của tôi") hoặc **Google Drive**.
4. File sao lưu có dạng: `saoluu-dieu-YYYY-MM-DD-HHmm.json`.

### Cách Khôi Phục (Khi đổi máy mới hoặc cài lại máy)
1. Trên máy mới, mở ứng dụng ➔ Vào tab **⚙️ Cài Đặt**.
2. Bấm nút: **🔄 Khôi Phục Dữ Liệu Từ File JSON**.
3. Chọn file `.json` bạn đã lưu trên Zalo/Drive.
4. Màn hình sẽ hiển thị bảng xem trước (Số lượng diều, số đơn hàng, ngày sao lưu, mã kiểm tra).
5. Chọn chế độ **"Thay thế toàn bộ"** ➔ Bấm **Bắt đầu khôi phục**.
6. Hệ thống sẽ tự động chụp 1 bản cứu hộ và nạp lại toàn bộ dữ liệu y nguyên như trên máy cũ!

---

## ✅ DANH SÁCH KIỂM TRA NGHIỆM THU (TEST CHECKLIST TRÊN ĐIỆN THOẠI)

Bạn hãy mở app trên điện thoại và thử nghiệm theo danh sách sau:

- [ ] **1. Thử nghiệm Chạy Ngoại Tuyến (Offline):**
  - Mở app một lần khi có mạng. Sau đó **tắt hoàn toàn Wifi và 4G**.
  - Đóng app, mở lại ➔ App vẫn khởi động mượt mà, huy hiệu hiển thị `● Ngoại tuyến (Offline)`.
  - Tạo đơn hàng mới, thêm diều ➔ Hoàn tất đơn thành công khi không có mạng.

- [ ] **2. Thử nghiệm Bán hàng & Trừ tồn kho:**
  - Vào Diều xem tồn kho của 1 loại (ví dụ 10 cái).
  - Sang Bán hàng, tạo đơn bán 3 cái.
  - Quay lại Diều kiểm tra: Tồn kho tự động giảm còn 7 cái.
  - Sang Lịch sử kho kiểm tra: Đã ghi nhận dòng log bán hàng (Tồn trước 10 ➔ Sau 7).
  - Vào Danh sách đơn hàng, bấm "Hủy đơn & hoàn kho" ➔ Tồn kho tự động tăng lại thành 10 cái.

- [ ] **3. Thử nghiệm Báo giá PDF & Excel:**
  - Tạo một báo giá mới có tên tiếng Việt có dấu (ví dụ: *Anh Nguyễn Văn Đức - Diều Sáo Cánh Bầu 2.5m Nan Carbon*).
  - Bấm **Xuất PDF**: Kiểm tra các chữ có dấu (*đ, ư, ơ, ê, ô, ặ, ề, ỹ*) hiển thị tròn trịa, sắc nét, không bị lỗi ô vuông hay mất dấu.
  - Kiểm tra dòng chữ: *Bằng chữ: ... đồng* được đọc chuẩn tiếng Việt.
  - Bấm **Excel**: File `.xlsx` mở ra xem được bảng tính đẹp mắt.
  - Bấm **⚡ Lên Đơn Bán**: Báo giá tự động chuyển thành đơn hàng và trừ kho.

- [ ] **4. Thử nghiệm Công nợ:**
  - Tạo một đơn bán hàng, chọn khách hàng cụ thể, phương thức thanh toán chọn **Ghi nợ** hoặc **Trả một phần**.
  - Vào tab **💵 Công Nợ**: Khách hàng hiển thị số tiền nợ màu đỏ.
  - Bấm **Thu Tiền Nợ**, nhập số tiền thu ➔ Công nợ tự động giảm hoặc hết nợ.

- [ ] **5. Thử nghiệm Sao lưu - Xóa sạch - Khôi phục:**
  - Bấm **SAO LƯU DỮ LIỆU** và lưu file `.json` về máy.
  - Vào Cài Đặt, bấm **Xóa Trắng Dữ Liệu Thử** (nhập chữ `XOA`).
  - Kiểm tra danh sách diều, khách, đơn hàng đều trống trơn.
  - Bấm **Khôi Phục Dữ Liệu Từ File JSON**, chọn file vừa lưu.
  - Mọi dữ liệu (sản phẩm, giá bán, lịch sử đơn, công nợ) trở lại **nguyên vẹn 100%**.

- [ ] **6. Thử nghiệm Chạy Kiểm Thử Tự Động:**
  - Mở file `tests/test-browser.html` trên trình duyệt hoặc chạy `node tests/run-tests.js` trong terminal.
  - Tất cả các kiểm thử đều hiển thị màu xanh **✓ ĐẠT (100%)**.

---

## ⚠️ CÁC GIỚI HẠN & LƯU Ý KỸ THUẬT

1. **Lưu trữ dữ liệu chỉ nằm trong máy:**
   - Ứng dụng **không có máy chủ trung tâm** để bảo đảm quyền riêng tư tuyệt đối cho chủ hộ kinh doanh và không phát sinh bất kỳ chi phí duy trì hàng tháng nào.
   - Do đó, nếu đổi điện thoại mới, bắt buộc phải dùng chức năng **Sao lưu** chuyển file sang máy mới và bấm **Khôi phục**.
2. **Web Share API trên máy tính bàn:**
   - Trên điện thoại thông minh (iPhone, Android), nút chia sẻ sẽ mở trực tiếp ứng dụng Zalo, Messenger, Gmail.
   - Trên một số trình duyệt máy tính cũ không hỗ trợ Web Share API, ứng dụng sẽ **tự động chuyển sang tải file PDF / Excel xuống máy**.
3. **Kích thước ảnh diều:**
   - Ứng dụng đã tích hợp sẵn bộ nén ảnh tự động thu về tối đa 600px và nén JPEG chất lượng 70%, giúp mỗi ảnh chỉ nặng ~40KB - 80KB, đảm bảo lưu được hàng nghìn ảnh sản phẩm mà bộ nhớ điện thoại vẫn rất nhẹ. Tuy nhiên không nên tải lên các file ảnh raw máy cơ dung lượng quá lớn (>20MB) vì sẽ mất thời gian giải nén trên các dòng điện thoại cũ.
