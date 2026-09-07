# VAN-HANH-SHOP — AI Context

## Tổng quan dự án

**Vận Hành Shop** là ứng dụng quản lý nhập hàng nội bộ cho shop bán lẻ. Ứng dụng giúp nhân viên theo dõi tồn kho, tự động tính số lượng cần nhập dựa trên dữ liệu bán hàng, và tạo phiếu nhập hàng gửi nhà cung cấp.

- **URL production**: https://tunoai.github.io/van-hanh-shop/
- **Repo**: https://github.com/tunoai/van-hanh-shop
- **Ngôn ngữ giao diện**: Tiếng Việt

---

## Tech Stack

| Layer        | Công nghệ                           |
|-------------|--------------------------------------|
| Framework    | React 19 (JSX, Hooks)               |
| Build tool   | Vite 8                               |
| Database     | Firebase Firestore (realtime)         |
| Icons        | lucide-react                         |
| Excel I/O    | SheetJS (xlsx)                       |
| Styling      | Vanilla CSS (`index.css`)            |
| Deploy       | GitHub Pages via `gh-pages` package  |

---

## Cấu trúc file

```
src/
├── App.jsx          # Toàn bộ logic + UI (single-file app, ~1350 dòng)
├── firebase.js      # Khởi tạo Firebase, export `db` (Firestore instance)
├── index.css        # Toàn bộ CSS, design tokens, responsive
├── main.jsx         # Entry point, render App
└── assets/          # Static assets
```

> **Lưu ý quan trọng**: App.jsx là file monolithic chứa TẤT CẢ components, logic, và UI. Chưa tách thành components riêng.

---

## Firebase Collections

### `products`
| Field          | Type       | Mô tả                                               |
|---------------|------------|------------------------------------------------------|
| `sku`         | string     | Mã sản phẩm (unique identifier)                     |
| `name`        | string     | Tên sản phẩm                                         |
| `stock`       | number     | Tồn kho hiện tại                                     |
| `source`      | string     | Nhà cung cấp (tên, không phải ID)                   |
| `monthlySales`| number[]   | Doanh số 12 tháng `[T1, T2, ..., T12]`              |
| `maxSales`    | number     | Giá trị bán MAX (= max của monthlySales)             |
| `sales1M`     | number     | Doanh số tháng 1 (legacy, ít dùng)                  |
| `importQty`   | number     | Số chốt nhập (tự tính hoặc manual)                  |
| `status`      | string     | `'Cần nhập'` / `'Sắp cần nhập'` / `'Chưa cần nhập'`|
| `note`        | string     | Ghi chú                                              |
| `isManual`    | boolean    | `true` nếu user đã chỉnh tay maxSales/importQty     |

### `suppliers`
| Field    | Type   | Mô tả               |
|---------|--------|----------------------|
| `name`  | string | Tên nhà cung cấp     |
| `contact`| string | Địa chỉ             |
| `phone` | string | Số điện thoại        |

### `importReceipts`
| Field          | Type     | Mô tả                                      |
|---------------|----------|---------------------------------------------|
| `code`        | string   | Mã phiếu nhập (VD: `PN-20260612-211530`)   |
| `createdAt`   | number   | Timestamp (ms)                               |
| `createdDate` | string   | Ngày tạo (vi-VN format)                     |
| `createdTime` | string   | Giờ tạo (vi-VN format)                      |
| `totalProducts`| number  | Tổng số mặt hàng                            |
| `totalQty`    | number   | Tổng số lượng nhập                           |
| `items`       | array    | Danh sách sản phẩm trong phiếu              |
| `note`        | string   | Ghi chú phiếu nhập                          |

### `employees`
| Field          | Type    | Mô tả                                                      |
|---------------|---------|-------------------------------------------------------------|
| `code`        | string  | Mã nhân viên (VD: `NV001`)                                  |
| `name`        | string  | Họ tên (bắt buộc)                                            |
| `phone`       | string  | Số điện thoại                                                |
| `position`    | string  | Chức vụ (mặc định `'Nhân viên kho'`)                        |
| `salaryType`  | string  | `'month'` / `'day'` / `'hour'`                              |
| `salaryRate`  | number  | Mức lương theo kiểu lương (đ/tháng, đ/ngày hoặc đ/giờ)      |
| `standardDays`| number  | Ngày công chuẩn/tháng, chỉ dùng khi `salaryType='month'` (mặc định 26) |
| `allowance`   | number  | Phụ cấp mặc định mỗi tháng (ăn trưa, xăng xe...)            |
| `status`      | string  | `'Đang làm'` / `'Nghỉ việc'`                                |
| `note`        | string  | Ghi chú                                                      |

### `payrolls`
Mỗi document = 1 nhân viên trong 1 kỳ lương. **Document ID cố định**: `` `${period}_${employeeId}` `` (VD: `2026-09_aBcD1234`) — ghi bằng `setDoc(..., { merge: true })` nên không bao giờ tạo bản ghi trùng.

| Field          | Type    | Mô tả                                              |
|---------------|---------|-----------------------------------------------------|
| `period`      | string  | Kỳ lương dạng `YYYY-MM`                             |
| `employeeId`  | string  | ID document trong `employees`                       |
| `employeeCode`| string  | Snapshot mã NV tại thời điểm chấm công              |
| `employeeName`| string  | Snapshot họ tên                                      |
| `position`    | string  | Snapshot chức vụ                                     |
| `salaryType`  | string  | Snapshot kiểu lương                                  |
| `salaryRate`  | number  | Snapshot mức lương                                   |
| `standardDays`| number  | Snapshot ngày công chuẩn                             |
| `workDays`    | number  | Số ngày công thực tế (kiểu `month` / `day`)         |
| `workHours`   | number  | Số giờ làm thực tế (kiểu `hour`)                    |
| `allowance`   | number  | Phụ cấp kỳ này (mặc định lấy từ `employees.allowance`) |
| `baseSalary`  | number  | Lương chính đã tính                                  |
| `totalSalary` | number  | Tổng lương = `baseSalary + allowance`               |
| `updatedAt`   | number  | Timestamp (ms) lần sửa cuối                          |

---

## Business Logic quan trọng

### Công thức tính tự động (`recalculateProduct`)

```
Số chốt nhập (importQty) = maxSales - stock
  → Nếu < 0 thì = 0
  → Nếu isManual = true thì giữ nguyên giá trị user nhập

Trạng thái (status):
  → stock / maxSales <= 20%  → "Cần nhập"
  → stock / maxSales <= 49%  → "Sắp cần nhập"
  → Còn lại                  → "Chưa cần nhập"
```

### Hai chế độ upload Excel

1. **"Tải lên Excel"** (`handleFileUpload`): Nhập mới + cập nhật toàn bộ. Thêm sản phẩm mới nếu SKU chưa tồn tại. Đè thông tin Tên, Nguồn nhập, Ghi chú, monthlySales...
2. **"Tải số tồn kho"** (`handleInventoryUpload`): CHỈ cập nhật cột `stock` cho SKU đã có trong hệ thống. **KHÔNG BAO GIỜ thêm sản phẩm mới.** Bỏ qua SKU không tìm thấy.

> ⚠️ **NGUYÊN TẮC BẮT BUỘC**: Hàm `handleInventoryUpload` KHÔNG ĐƯỢC phép thêm sản phẩm mới vào database. Chỉ `batch.update()`, không có `batch.set()`.

### Công thức tính lương (`calcPayroll`)

```
Lương chính (baseSalary):
  salaryType = 'month' → salaryRate × workDays / standardDays   (standardDays mặc định 26)
  salaryType = 'day'   → salaryRate × workDays
  salaryType = 'hour'  → salaryRate × workHours
  → làm tròn bằng Math.round()

Phụ cấp (allowance):
  → lấy từ bản ghi payroll của kỳ nếu đã nhập, ngược lại lấy mặc định từ employees.allowance

Tổng lương (totalSalary) = baseSalary + allowance
```

- `calcPayroll` là hàm thuần (pure), khai báo ngoài component → dễ test, không phụ thuộc state.
- Bảng lương **chỉ tính cho nhân viên có `status = 'Đang làm'`**.
- Mỗi ô chấm công là component `NumberCell`, chỉ ghi Firestore khi **blur hoặc Enter** (không ghi mỗi lần gõ phím).

---

## Các trang / Menu chính

| Menu          | State key         | Mô tả                                    |
|--------------|-------------------|-------------------------------------------|
| Nhập hàng     | `nhap-hang`       | Trang chính, có 2 tab con                 |
| Sản phẩm      | `san-pham`        | Danh sách sản phẩm, chỉnh sửa inline     |
| Nhà cung cấp  | `nha-cung-cap`    | CRUD nhà cung cấp                         |
| Kho hàng      | —                 | Chưa implement                            |
| Nhân viên     | `nhan-vien`       | Quản lý nhân viên + tính lương, 2 tab con |

### Tab con trong "Nhập hàng"

| Tab                          | State key     | Mô tả                                        |
|-----------------------------|---------------|-----------------------------------------------|
| Kiểm tra & Làm phiếu nhập   | `phieu-nhap`  | Bảng SP cần nhập, chọn và tạo phiếu          |
| Lịch sử phiếu nhập          | `lich-su`     | Danh sách phiếu đã tạo, expandable detail    |

### Tab con trong "Nhân viên" (state key `activeEmployeeTab`)

| Tab                  | State key    | Mô tả                                                        |
|---------------------|--------------|---------------------------------------------------------------|
| Danh sách nhân viên  | `danh-sach`  | CRUD nhân viên, lọc theo trạng thái, tìm theo tên/mã/SĐT      |
| Bảng lương           | `bang-luong` | Chọn kỳ lương (`<input type="month">`), chấm công, xuất Excel |

---

## Bảng trong tab "Kiểm tra & Làm phiếu nhập"

Các cột hiện tại: `☐ | SKU | Tên SP | Nguồn nhập | Tồn hiện tại | Số bán MAX | Số chốt nhập | Trạng thái`

- Chỉ hiển thị sản phẩm có `importQty > 0` HOẶC status là `'Cần nhập'` / `'Sắp cần nhập'`
- Filter: tìm kiếm SKU/tên, lọc trạng thái (multi-select), lọc nguồn nhập

## Bảng trong tab "Sản phẩm"

Các cột: `STT | SKU | Tên SP | Tồn kho | Nhà cung cấp | [T1..T12 ẩn/hiện] | Max | Ghi chú | Thao tác`

- Filter: tìm kiếm SKU/tên, lọc nhà cung cấp
- Inline edit: nguồn nhập (dropdown), monthly sales (number input), ghi chú
- Toggle hiện/ẩn cột tháng

---

## Conventions & Quy tắc

### Code style
- Single-file architecture (App.jsx)
- Inline styles phổ biến (chưa dùng CSS modules)
- State management: React `useState` + `useEffect` (không Redux/Zustand)
- Realtime data: Firebase `onSnapshot` listeners
- Tất cả text UI bằng **tiếng Việt**

### Commit messages
- Prefix: `feat:`, `fix:`, `refactor:`, `style:`
- Message bằng tiếng Việt

### Deploy workflow
```bash
# Build + deploy lên GitHub Pages
npm run deploy
# Lệnh trên tự chạy: predeploy (vite build --base=/van-hanh-shop/) → gh-pages -d dist

# Push source code lên main
git push
```

> ⚠️ **Sau mỗi thay đổi, PHẢI chạy cả `git push` VÀ `npm run deploy`** để cập nhật cả source code và trang web.

### CSS Design Tokens (trong index.css)
```css
--primary-color: #3b82f6;
--primary-hover: #2563eb;
--success-color: #10b981;
--warning-color: #f59e0b;
--danger-color: #ef4444;
--text-primary: #1e293b;
--text-secondary: #64748b;
--border-color: #e2e8f0;
--bg-color: #f1f5f9;
```

### Badge status colors
- `badge.red` → Cần nhập
- `badge.yellow` → Sắp cần nhập
- `badge.green` → Chưa cần nhập

---

## Lưu ý cho AI

1. **Không làm mất dữ liệu Firebase**: Dữ liệu nằm trên cloud, thay đổi code chỉ ảnh hưởng frontend. Nhưng cẩn thận với logic write/update/delete.
2. **Hàm `handleInventoryUpload` chỉ UPDATE**: Tuyệt đối không thêm logic `addDoc` hoặc `batch.set()` vào hàm này.
3. **Hàm `recalculateProduct` là core**: Mọi thay đổi stock, maxSales, monthlySales đều phải gọi qua hàm này để tính lại importQty và status.
4. **Deploy 2 bước**: Phải chạy cả `git push` (source) và `npm run deploy` (production site).
5. **File App.jsx rất lớn (~1350 dòng)**: Cẩn thận khi edit, đảm bảo không làm hỏng JSX structure.
6. **Tất cả ID trong Firestore là string**: Luôn dùng `String(id)` khi reference document.
7. **Bảng lương dùng `setDoc` với ID cố định**, KHÔNG dùng `addDoc` — nếu đổi sang `addDoc` sẽ tạo bản ghi trùng mỗi lần sửa ô chấm công.
8. **Xóa nhân viên không xóa bản ghi `payrolls` cũ**: các bản ghi đó trở thành lịch sử mồ côi nhưng vô hại vì `payrollRows` luôn duyệt từ danh sách `employees`.
