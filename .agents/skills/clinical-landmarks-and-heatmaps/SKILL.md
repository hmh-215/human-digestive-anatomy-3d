---
name: clinical-landmarks-and-heatmaps
description: >-
  SOP & Comprehensive Guide for Discrete Step-Based Functional Heatmaps, Landmark-Guided Smooth Cutaways, and Headless CDP Automated Testing across 9 Digestive Organs.
  Hướng dẫn toàn diện về quy chuẩn tô màu Heatmap phân vùng chức năng dạng bậc đơn sắc rời rạc (Discrete Step Heatmaps) cho 9 hệ cơ quan tiêu hóa,
  thuật toán tạo mặt phẳng cắt giải phẫu mượt mà chống răng cưa theo điểm mốc bề mặt (Catmull-Rom spline),
  định hình điểm mốc lâm sàng/ngoại khoa (Điểm Murphy, McBurney, Trung Quản, Treitz, His),
  tối giản hóa sơ đồ phân chia cơ thể SVG (Clinical Body Map), và quy trình kiểm thử tự động headless CDP với Microsoft Edge/Chrome.
  Kích hoạt khi người dùng yêu cầu: heatmap bậc rời rạc, discrete step heatmap, mặt cắt mượt theo landmark, điểm mốc lâm sàng, clinical landmarks, kiểm thử CDP, headless screenshot, rà soát màu sắc giải phẫu.
---

# 🩺 Clinical Landmarks, Discrete Step Heatmaps & Automated Verification

Quy chuẩn vận hành tiêu chuẩn (SOP) và cẩm nang kỹ thuật về phân vùng chức năng bậc rời rạc, định hình mặt cắt giải phẫu mượt theo điểm mốc lâm sàng và quy trình kiểm thử tự động trên ứng dụng **Giải Phẫu 3D Hệ Tiêu Hóa (ĐHYHN)**.

---

## 1. Nguyên Tắc Thiết Kế Heatmap Bậc Rời Rạc (Discrete Step Heatmaps)

### Triết Lý Cốt Lõi: Khối Màu Đơn Sắc Tuyệt Đối (Solid Step Color)
Trong giảng dạy giải phẫu lâm sàng, học viên cần nhận biết chính xác và tức thì ranh giới giữa các phân đoạn chức năng. Việc dùng dải màu gradient biến thiên liên tục sẽ làm mờ nhạt đường biên và gây hiểu lầm (ví dụ: Đại tràng xuống bị hiểu lầm là gồm 2 vùng chức năng riêng vì có cả màu xanh và tím).

Do đó, hệ thống tuân thủ nghiêm ngặt 3 quy tắc:
1. **Một Phân Đoạn = Một Màu Duy Nhất**: Mỗi vùng giải phẫu chỉ được tô đúng 1 màu đơn sắc từ mảng màu pastel (`palette[stepIndex]`).
2. **Biên Giới Sắc Nét (Sharp Boundaries)**: Ngưỡng chuyển tiếp giữa hai bậc màu kế tiếp nhau là dứt khoát, không có khoảng chuyển sắc trung gian.
3. **Đồng Bộ Màu 100% Giữa 3D Và UI**: Màu BufferAttribute của đỉnh 3D tại vị trí raycast trỏ tới phải trùng khớp hoàn toàn với chấm màu (`#hover-callout-dot`), đường dẫn SVG (`#hover-leader-line`) và đường viền của thẻ chú giải nổi (`#hover-callout-card`).

---

## 2. Bảng Ma Trận Phân Vùng 9 Hệ Cơ Quan Tiêu Hóa

```
Dải màu Pastel Luminous (Độ sáng L >= 65% - 75%, dịu mắt, sang trọng y khoa):
[Hot Inlet] Luminous Coral Rose (#ff477e) ──► Warm Peach (#ff8533) ──► Sunny Amber (#ffd13b)
──► Pastel Lime (#7bed9f) ──► Fresh Mint Emerald (#2fe091) ──► Luminous Sky Aqua (#38e1ff)
──► Soft Cornflower Blue (#54a0ff) ──► Pastel Lavender (#a55eea) ──► Radiant Orchid Pink (#ff78cb) [Cold Outlet]
```

### Chi Tiết Phân Bậc Từng Cơ Quan:

#### 1. Ruột Già / Đại Tràng (`large_intestine` - 5 Bậc)
- `s < 0.18`: **Manh tràng & Ruột thừa** (`palC[0]` - Đỏ san hô) • Điểm đau McBurney, mô bạch huyết dày đặc.
- `0.18 <= s < 0.38`: **Đại tràng lên & Góc gan** (`palC[1]` - Vàng mật) • Mạc dính Toldt phải, hấp thu nước/điện giải.
- `0.38 <= s < 0.65`: **Đại tràng ngang & Góc lách** (`palC[2]` - Xanh bạc hà) • Di động có mạc treo, mạc nối lớn che chắn.
- `0.65 <= s < 0.85`: **Đại tràng xuống** (`palC[3]` - Xanh ngô pastel **1 MÀU DUY NHẤT**) • Mạn sườn trái, lòng hẹp chứa phân đặc.
- `s >= 0.85`: **Đại tràng sigma** (`palC[4]` - Tím phong lan) • Quai chữ S di động, mốc túi thừa & xoắn đại tràng.

#### 2. Dạ Dày (`stomach` - 5 Bậc)
- `s < 0.18`: **Đáy vị** (`palStom[0]` - Đỏ hồng) • Vòm cong chứa túi hơi dạ dày (Gastric air bubble).
- `0.18 <= s < 0.32`: **Tâm vị & Ấn tâm vị** (`palStom[1]` - Cam ấm) • Tiết chất nhầy kiềm chống trào ngược acid.
- `0.32 <= s < 0.65`: **Thân vị** (`palStom[2]` - Vàng hổ phách) • Tế bào thành tiết HCl pH 1.5 - 2.0 & Yếu tố nội sinh B12.
- `0.65 <= s < 0.88`: **Hang môn vị** (`palStom[3]` - Xanh bạc hà) • Tế bào G tiết Gastrin, vị trí ổ loét H. pylori phổ biến.
- `s >= 0.88`: **Môn vị & Ống môn vị** (`palStom[4]` - Hồng phong lan) • Cơ thắt môn vị dày điều hòa tống vị trấp.

#### 3. Tá Tràng (`duodenum` - 6 Bậc)
- `s < 0.18`: **Hành tá tràng D1** (`palD[0]`) • Tiếp nối môn vị L1, niêm mạc nhẵn, vị trí >90% loét tá tràng.
- `0.18 <= s < 0.32`: **Góc tá trên** (`palD[1]`) • Gập 90 độ dưới gan tại mức L1.
- `0.32 <= s < 0.58`: **Đoạn xuống D2** (`palD[2]`) • Thành sau trong chứa Nhú tá lớn Vater (cơ thắt Oddi) và Nhú tá bé.
- `0.58 <= s < 0.72`: **Góc tá dưới** (`palD[3]`) • Khúc chuyển tiếp tại mức L3.
- `0.72 <= s < 0.86`: **Đoạn ngang D3** (`palD[4]`) • Bắt chéo trước IVC và ĐMC bụng tại L3, bị kẹp bởi động mạch SMA.
- `s >= 0.86`: **Đoạn lên D4 & Dây chằng Treitz** (`palD[5]`) • Mốc ngoại khoa phân định Xuất huyết tiêu hóa trên/dưới.

#### 4. Tuyến Tụy (`pancreas` - 4 Bậc)
- `s < 0.25`: **Đầu tụy & Mỏm móc** (`palP[0]`) • Nằm lọt trong khung C tá tràng, 98% mô ngoại tiết (Amylase, Lipase, Trypsin).
- `0.25 <= s < 0.45`: **Cổ tụy & Khuyết tụy** (`palP[1]`) • Kẹp bó mạch mạc treo tràng trên, mốc hình thành Tĩnh Mạch Cửa.
- `0.45 <= s < 0.80`: **Thân tụy** (`palP[2]`) • Băng ngang L1-L2, đè lên đám rối tạng (cơn đau xuyên lưng viêm tụy cấp).
- `s >= 0.80`: **Đuôi tụy** (`palP[3]`) • Chạm rốn lách, mật độ cao nhất các Đảo Langerhans (Insulin, Glucagon).
- *(Hệ thống ống Wirsung & Santorini giữ nguyên màu men sứ xanh lơ porcelain)*.

#### 5. Thực Quản (`esophagus` - 3 Bậc)
- `s < 0.28`: **Đoạn Cổ** (`palE[0]`) • Bờ dưới sụn nhẫn C6 (chỗ hẹp trên ~15cm từ cung răng).
- `0.28 <= s < 0.80`: **Đoạn Ngực** (`palE[1]`) • Trung thất sau, sau tâm nhĩ trái và phế quản trái (chỗ hẹp T4-T5).
- `s >= 0.80`: **Đoạn Bụng** (`palE[2]`) • Chui qua lỗ cơ hoành T10 (chỗ hẹp T10 ~40cm), tạo góc His với tâm vị.

#### 6. Túi Mật & Đường Mật (`gallbladder_tree` - 4 Bậc)
- `z > 6.0`: **Đáy túi mật** (`palG[0]`) • Điểm Murphy kinh điển tại giao điểm cơ thẳng bụng phải và bờ sườn 9.
- `4.5 < z <= 6.0`: **Thân túi mật** (`palG[1]`) • Áp sát hố túi mật ở mặt tạng gan, cô đặc dịch mật 5-10 lần.
- `z <= 4.5`: **Cổ túi mật & Túi Hartmann** (`palG[2]`) • Uốn hình chữ S, nơi sỏi mật hay bị kẹt.
- *Mesh ống mật*: **Ống mật chủ** (`palG[3]`) • Đi trong cuống gan (Tam giác Calot) đổ vào nhú tá lớn Vater.

#### 7. Ruột Non (`small_intestine` - 2 Bậc)
- `x > 0 || y > 98.0`: **Hỗng tràng (Jejunum)** (`palS[0]`) • Quai ruột nằm ngang ở ô bụng trên trái, thành dày, đỏ hồng giàu mạch, hấp thu đường đạm.
- `else`: **Hồi tràng (Ileum)** (`palS[1]`) • Quai ruột xếp thẳng đứng ở ô bụng dưới phải, chứa mảng Peyer, tái hấp thu muối mật & vitamin B12.

#### 8. Phúc Mạc & Mạc Nối (`peritoneum_omentum` - 4 Bậc)
- `Lesser omentum`: **Mạc nối nhỏ** (`palPerit[0]`) • Cuống gan, giới hạn bờ trước Lỗ Winslow dẫn vào hậu cung mạc nối.
- `Mesocolon`: **Mạc treo đại tràng ngang** (`palPerit[1]`) • Ranh giới chia tầng trên và tầng dưới mạc treo ổ bụng.
- `Greater omentum`: **Mạc nối lớn** (`palPerit[2]`) • "Người cảnh sát ổ bụng" gồm 4 lá phúc mạc giàu mỡ và tế bào lympho.
- `Meso-appendix`: **Mạc treo ruột thừa** (`palPerit[3]`) • Chứa Động mạch ruột thừa - mốc kẹp thắt then chốt khi mổ nội soi.

#### 9. Gan (`liver` - 8 Phân Thùy Couinaud)
- Hạ phân thùy I (Thùy đuôi) đến Hạ phân thùy VIII: 8 sắc thái pastel rời rạc phân định theo đường đi của tĩnh mạch trên gan và nhánh tĩnh mạch cửa.

---

## 3. Mặt Cắt Giải Phẫu Mượt Theo Điểm Mốc Bề Mặt (Smooth Landmark Cutaways)

### Vấn Đề Răng Cưa (Jagged Artifacts):
Khi dùng mặt phẳng $Z = c$ đơn thuần, các tam giác polygon bị xén cụt ngẫu nhiên tạo đường biên nham nhở.

### Giải Pháp:
1. **Lấy Tập Điểm Mốc Giải Phẫu Bề Mặt (`landmarks`)**:
   Lấy từ ảnh minh họa đường đánh dấu giải phẫu lâm sàng (ví dụ: đường viền bờ cong nhỏ, khuyết góc His, bờ ngoài cơ thẳng bụng).
2. **Nội Suy Đường Cong Mượt Bằng Catmull-Rom Spline 3D**:
   Tạo hàm chiếu đường cong liên tục:
   ```javascript
   const spline = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
   ```
3. **Chiếu Đỉnh & Loại Bỏ Triệt Để Răng Cưa**:
   Khoảng cách đỉnh $\mathbf{P}(x, y, z)$ được so sánh với điểm gần nhất trên spline $\mathbf{S}(t)$. Mặt cắt uốn lượn mềm mại theo đúng cấu trúc giải phẫu của cơ quan.

---

## 4. Điểm Mốc Lâm Sàng & Sơ Đồ Cơ Thể (Clinical Body Map)

1. **Hiển Thị Tối Giản**:
   - Theo chỉ thị người dùng: Loại bỏ hoàn toàn chế độ "Danh sách" (danh sách tạng gây rối mắt); chỉ giữ lại chế độ **Phân chia theo sơ đồ (SVG Clinical Body Map)** trực quan, kết nối các tạng theo hệ thống chức năng.
2. **Marker 3D Điểm Mốc Nhấp Nháy (Pulsing Effect)**:
   - Khi chọn điểm mốc (Trung Quản, Murphy, McBurney, v.v.), hình cầu đánh dấu 3D tự động phát xung nhịp nhàng:
     ```javascript
     const pulseScale = isActive ? (1.35 + 0.25 * Math.sin(time * 2.0)) : (1.0 + 0.12 * Math.sin(time));
     mesh.scale.set(pulseScale, pulseScale, pulseScale);
     mesh.material.emissive.setHex(isActive ? 0xef4444 : 0x0284c7);
     ```
   - Camera tự động lướt mượt mà (*lerp*) hội tụ về điểm mốc với khoảng cách và góc nhìn lâm sàng tối ưu.

---

## 5. Quy Trình Kiểm Thử Headless CDP Tự Động (SOP)

Mọi thay đổi hiển thị 3D bắt buộc phải được nghiệm thu thông qua script Python CDP độc lập:

1. **Khởi Chạy Trình Duyệt Headless**:
   ```python
   subprocess.Popen([
       EDGE_PATH, '--headless=new', f'--remote-debugging-port={PORT}',
       '--window-size=1600,1050', URL
   ])
   ```
2. **Kiểm Tra Trạng Thái ViewModels & Thuộc Tính Mesh**:
   Gửi lệnh `Runtime.evaluate` để kiểm tra `selectedOrganId`, `organDisplayMode`, `vertexColors`, và mảng màu đỉnh BufferAttribute.
3. **Chụp Ảnh Bằng Chứng Nghiệm Thu**:
   Gửi lệnh `Page.captureScreenshot` lưu ảnh PNG độ phân giải 1600x1050 vào thư mục artifact.
4. **Đối Chiếu & Nghiệm Thu Trực Quan**:
   So sánh ảnh chụp trực tiếp với ảnh phản hồi của người dùng để đảm bảo không còn bất kỳ sai sót nào trước khi bàn giao.
