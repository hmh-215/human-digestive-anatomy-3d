---
name: hollow-organ-layer-synthesizer
description: >-
  Universal 3D Hollow Organ Layer Preparation & Procedural Texture Synthesizer for Medical Education & Anatomical 3D Viewers (Three.js / WebGL / Blender).
  Kỹ năng toàn diện hướng dẫn quy trình tạo mô hình 3D nhiều lớp mô học lồng nhau (Concentric Histological Layers) cho các tạng rỗng (Dạ dày - Stomach, Thực quản - Esophagus, Ruột non - Small Intestine, Đại tràng - Colon),
  thuật toán Vertex Inset co rút pháp tuyến, tạo tọa độ UV giải phẫu (Local Anatomical UVs), sinh thủ tục Texture PBR & Bump Map thớ cơ/mạch máu/nếp gấp Rugae bằng HTML5 Canvas không phụ thuộc ảnh ngoài,
  và công thức bóc tách 3D theo trục chiều sâu vuông góc màn hình (Near-to-Far Orthogonal Depth Explosion) triệt tiêu 100% chồng đè (Zero Overlap).
  Kích hoạt khi người dùng yêu cầu: tạo layer tạng rỗng, bóc tách dạ dày/thực quản/ruột non/đại tràng, vẽ texture thớ cơ, tạo bump map Rugae/niêm mạc, nhân bản model lồng nhau, chuẩn bị layer tạng tiêu hóa, hollow organ layers.
---

# 🩺 Hollow Organ Layer Synthesizer: 3D Layers & Procedural Textures Guide

Bộ cẩm nang kỹ thuật chuẩn mực hướng dẫn trọn vẹn quy trình bóc tách mô học, nhân bản hình học 3D, tạo vật liệu PBR thủ tục (Procedural Textures & Bump Maps) và thiết lập động học bóc tách chiều sâu cho các **tạng rỗng (Hollow Visceral Organs)** trong ứng dụng giải phẫu y khoa 3D.

---

## 1. Bản Đồ Mô Học Các Tạng Rỗng (Anatomical Histology Matrix)

Mọi tạng rỗng trong ống tiêu hóa người đều tuân thủ cấu trúc thành 4 tầng mô học kinh điển (từ ngoài vào trong), với các biến thể giải phẫu đặc thù:

| Tạng rỗng | Lớp 1: Ngoài cùng | Lớp 2: Tầng cơ (Tunica Muscularis) | Lớp 3: Tầng dưới niêm mạc | Lớp 4: Niêm mạc (Tunica Mucosa) |
| :--- | :--- | :--- | :--- | :--- |
| **Dạ dày (Stomach)** | **Thanh mạc (Serosa)**: Phúc mạc tạng mỏng $0.5 - 0.8\text{ mm}$ | **3 lớp cơ riêng biệt**:<br>• 2A: Cơ dọc (Longitudinal, ngoài)<br>• 2B: Cơ vòng (Circular, giữa, môn vị)<br>• 2C: Cơ chéo (Oblique, trong, góc $45^\circ$) | Mô liên kết giàu mạch máu & đám rối Meissner | Nếp gấp vị dọc (**Rugae**) uốn lượn sâu, tuyến tiết acid HCl/pepsinogen |
| **Thực quản (Esophagus)** | **Ngoại mạc (Adventitia)**: Mô liên kết sợi (chưa có phúc mạc) | **2 lớp cơ**:<br>• 1/3 trên: Cơ vân tự ý<br>• 1/3 giữa: Hỗn hợp cơ vân - cơ trơn<br>• 1/3 dưới: Cơ trơn thuần túy | Giàu tuyến nhầy thực quản bôi trơn viên thức ăn | Biểu mô lát tầng không sừng hóa, chịu lực ma sát nuốt |
| **Ruột non (Small Intestine)** | **Thanh mạc (Serosa)**: Bao bọc hỗng tràng & hồi tràng | **2 lớp cơ trơn**:<br>• Cơ dọc ngoài<br>• Cơ vòng trong (tạo sóng nhu động) | Đám rối thần kinh & mạch bạch huyết mảng Peyer | Nếp gấp vòng (**Van Kerckring**) + Vi nhung mao (**Villi**) tăng diện tích hấp thu |
| **Đại tràng (Colon)** | **Thanh mạc (Serosa)**: Có các túi thừa mạc nối (túi mỡ) | **2 lớp cơ**:<br>• Cơ dọc tụ lại thành **3 dải cơ dọc (Taeniae coli)**<br>• Cơ vòng co thắt tạo các **túi phình (Haustra)** | Chứa các nang bạch huyết đơn độc | Biểu mô trụ đơn nhiều tế bào đài (**Goblet cells**) tiết nhầy làm trơn phân |

---

## 2. Kỹ Thuật Nhân Bản 3D Lồng Nhau (Concentric Inset Geometry)

Để tạo $N$ lớp lồng nhau từ **1 file 3D tạng rỗng gốc** (không cần dựng thủ công nhiều file Blender riêng), sử dụng thuật toán **Vertex Normal Inset**:

### Công thức co rút đỉnh dọc theo pháp tuyến:
Với mỗi đỉnh $i$ của lớp thứ $k$ ($k = 0..N-1$):
$$\mathbf{P}_{\text{new}}(i) = \mathbf{P}_{\text{orig}}(i) - \mathbf{N}(i) \times d_k$$

Trong đó:
- $\mathbf{N}(i)$ là vector pháp tuyến đơn vị (Vertex Normal) tại đỉnh $i$.
- $d_k$ là độ co rút theo bán kính bao tạng ($R = \text{boundingSphere.radius}$):
  $$d_k = \text{insets}[k] \times R$$

### Bảng tỷ lệ co rút chuẩn (Normalized Inset Offsets):
```javascript
// Áp dụng cho Dạ dày / Ruột (R ≈ 8.0 - 10.0 cm)
const insets = [
  0.0,            // Lớp 1 (Serosa): Bề mặt ngoài cùng
  0.012 * radius, // Lớp 2A (Cơ dọc): Co vào 1.2%
  0.024 * radius, // Lớp 2B (Cơ vòng): Co vào 2.4%
  0.036 * radius, // Lớp 2C (Cơ chéo): Co vào 3.6%
  0.048 * radius, // Lớp 3 (Dưới niêm mạc): Co vào 4.8%
  0.060 * radius  // Lớp 4 (Niêm mạc & Lòng tạng): Co vào 6.0%
];
```

> [!IMPORTANT]
> **Khắc phục lỗi Z-Fighting khi lắp ráp (`explodeFactor = 0`)**:
> Nhờ bước thụt lùi $d_k$ tăng dần, các lớp lồng khít vào nhau mà không bao giờ bị hiện tượng nhấp nháy đa giác (Z-fighting). Lớp ngoài cùng che kín hoàn toàn các lớp bên trong.

---

## 3. Tạo Tọa Độ UV Giải Phẫu Cục Bộ (Local Anatomical UV Projection)

File 3D xuất từ atlas chung (như Z-Anatomy) thường nén UV của từng tạng vào một góc nhỏ xíu ($0.05 \times 0.05$). Để texture thớ cơ và nếp gấp mô học hiển thị sắc nét, **phải tính toán lại UV cục bộ** dựa trên bounding box của chính tạng đó:

```javascript
export function generateHollowOrganUVs(geometry) {
  geometry.computeBoundingBox();
  const bbox = geometry.boundingBox;
  const sizeX = Math.max(0.001, bbox.max.x - bbox.min.x);
  const sizeY = Math.max(0.001, bbox.max.y - bbox.min.y);
  const sizeZ = Math.max(0.001, bbox.max.z - bbox.min.z);

  const pos = geometry.attributes.position;
  const uvs = new Float32Array(pos.count * 2);

  for (let i = 0; i < pos.count; i++) {
    const nx = (pos.getX(i) - bbox.min.x) / sizeX; // 0..1 trục ngang
    const ny = (pos.getY(i) - bbox.min.y) / sizeY; // 0..1 trục dọc
    const nz = (pos.getZ(i) - bbox.min.z) / sizeZ; // 0..1 trục trước-sau

    // Chiếu bán trụ (Cylindrical Projection) bao bọc quanh chu vi tạng:
    uvs[i * 2]     = nx * 1.8 + nz * 0.7; // Trục chu vi U (cho cơ vòng / mạch máu)
    uvs[i * 2 + 1] = ny * 2.0;            // Trục chiều dài V (cho cơ dọc / nếp gấp Rugae)
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}
```

---

## 4. Công Thức Vẽ Texture & Bump Map Bằng HTML5 Canvas

Không cần tải ảnh `.jpg` / `.png` nặng megabytes từ internet. Khởi tạo trực tiếp bằng mã JavaScript Canvas 512x512 trong bộ nhớ:

### A. Lớp 1: Thanh Mạc (Tunica Serosa) — Glistening Mesothelium
- **Đặc điểm**: Bề mặt trơn láng, bóng phản quang, màu hồng tạng, mao mạch mảnh li ti.
- **Vật liệu Three.js**:
  ```javascript
  new THREE.MeshStandardMaterial({
    map: serosaTexture,
    roughness: 0.22,  // Độ bóng cao, bề mặt ướt dịch thanh mạc
    metalness: 0.08,
    side: THREE.DoubleSide
  });
  ```

### B. Lớp 2A: Thớ Cơ Dọc (Stratum Longitudinale)
- **Đặc điểm**: Các bó sợi cơ song song chạy dọc theo chiều dài tạng (trục dọc $Y$).
- **Canvas Color Map**: Vẽ các đường kẻ dọc `ctx.moveTo(x, 0); ctx.lineTo(x, 512);` với tone màu đỏ rượu vang (`#701a24` $\rightarrow$ `#881337`).
- **Bump Map**: Các vạch trắng đen xen kẽ cách nhau $4\text{ px}$, `bumpScale: 0.025`.

### C. Lớp 2B: Thớ Cơ Vòng (Stratum Circulare)
- **Đặc điểm**: Các bó sợi cơ chạy ngang bao quanh chu vi tạng (trục ngang $X$).
- **Canvas Color Map**: Vẽ các dải ngang `ctx.moveTo(0, y); ctx.lineTo(512, y);` với tone đỏ đậm (`#66101f` $\rightarrow$ `#7f1d1d`).
- **Bump Map**: Rãnh ngang tạo khấc vòng nhu động, `bumpScale: 0.025`.

### D. Lớp 2C: Thớ Cơ Chéo (Fibrae Obliquae)
- **Đặc điểm**: Các sợi cơ đan chéo góc nghiêng $45^\circ$, đặc trưng riêng biệt ở dạ dày để tạo lực nhào trộn đa chiều.
- **Canvas Color Map**: Vẽ các đường chéo `ctx.moveTo(i, 0); ctx.lineTo(i + 512, 512);` phối màu tím mận - đỏ thẫm (`#581c87` $\rightarrow$ `#6b1111`).
- **Bump Map**: Gờ chéo $45^\circ$, `bumpScale: 0.025`.

### E. Lớp 3: Tầng Dưới Niêm Mạc (Tela Submucosa) — Mạng Lưới Mạch Máu
- **Đặc điểm**: Nền mô liên kết màu kem đào nhạt (`#fdf2f8` $\rightarrow$ `#fed7aa`), có cây phân nhánh động mạch đỏ (`#dc2626`) và tĩnh mạch xanh (`#2563eb`).
- **Thuật toán đệ quy vẽ mạch máu (Fractal Vessel Branching)**:
  ```javascript
  const drawVascularBranch = (ctx, x0, y0, length, angle, depth, color, width) => {
    if (depth <= 0) return;
    const x1 = x0 + Math.cos(angle) * length;
    const y1 = y0 + Math.sin(angle) * length;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(
      (x0 + x1)/2 + (Math.random() - 0.5) * 12,
      (y0 + y1)/2 + (Math.random() - 0.5) * 12,
      x1, y1
    );
    ctx.stroke();
    const spread = 0.5 + Math.random() * 0.3;
    drawVascularBranch(ctx, x1, y1, length * 0.72, angle + spread, depth - 1, color, width * 0.7);
    drawVascularBranch(ctx, x1, y1, length * 0.72, angle - spread, depth - 1, color, width * 0.7);
  };
  ```

### F. Lớp 4: Niêm Mạc & Nếp Gấp Rugae (Tunica Mucosa)
- **Đặc điểm**: Các nếp gấp nhăn nheo uốn lượn sâu 3D trên nền cam hổ phách (`#c2410c` $\rightarrow$ `#ea580c`).
- **Công thức sóng sin kép sinh nếp gấp Rugae**:
  $$Y_{\text{fold}}(x) = y + \sin\left(\frac{4\pi x}{512} + \phi\right) \times 16 + \cos\left(\frac{2\pi x}{512}\right) \times 8$$
- **Bump Map**: Nét bút đậm $14\text{ px}$ kết hợp viền sáng phản quang $4\text{ px}$, `bumpScale: 0.045` để tạo chiều sâu gồ ghề của lòng dạ dày.

---

## 5. Động Học Bóc Tách 3D Chiều Sâu Vuông Góc (Orthogonal Depth Explosion)

Khi người dùng thao tác kéo thanh trượt **Bóc Tách (`0% → 100%`)**:

```
[Màn hình / Người xem] (+Z, Gần màn hình nhất)
        ▲
        │  [Lớp 1: Thanh Mạc (Serosa)]           (+2.5 bước) ── Gần nhất, lớn nhất
        │  [Lớp 2A: Cơ Dọc (Longitudinal)]       (+1.5 bước)
        │  [Lớp 2B: Cơ Vòng (Circular)]          (+0.5 bước)
        │  [Lớp 2C: Cơ Chéo (Oblique)]           (-0.5 bước)
        │  [Lớp 3: Dưới Niêm Mạc (Submucosa)]    (-1.5 bước)
        │  [Lớp 4: Niêm Mạc Rugae (Mucosa)]      (-2.5 bước) ── Xa nhất, sâu trong lòng
        ▼
[Sâu bên trong] (-Z, Xa màn hình nhất)
```

### Công thức vector bước tách chống chồng đè (Zero-Overlap Step Vector):
Để đảm bảo các lớp **không bao giờ che lấp lẫn nhau**, khoảng cách không gian 3D giữa 2 lớp liền kề phải lớn hơn kích thước thực tế của tạng:

$$\text{StepVector} = (\Delta X = -11.5, \Delta Y = 2.0, \Delta Z = 7.5)\text{ cm}$$

$$\text{Distance} = \sqrt{(-11.5)^2 + 2.0^2 + 7.5^2} = \sqrt{132.25 + 4 + 56.25} \approx 13.9\text{ cm} > 11.0\text{ cm (Bề rộng tạng)}$$

### Code cập nhật tọa độ trong `ExplosionManager`:
```javascript
const shellBaseStep = new THREE.Vector3(-11.5, 2.0, 7.5);

stomachWallMeshes.forEach((mesh, idx) => {
  const initPos = mesh.userData.initialPos;
  // idx = 0 (Serosa, ngoài cùng) -> centeredStep = +2.5 (+Z gần màn hình nhất)
  // idx = 5 (Mucosa, trong cùng) -> centeredStep = -2.5 (-Z xa màn hình nhất)
  const centeredStep = 2.5 - idx;
  const offset = new THREE.Vector3(
    shellBaseStep.x * centeredStep,
    shellBaseStep.y * centeredStep,
    shellBaseStep.z * centeredStep
  );
  mesh.position.copy(initPos).addScaledVector(offset, t);
});
```

---

## 6. Quản Lý Mặt Phẳng Cắt Thông Minh (Dynamic Clipping Planes)

- **Khi lắp ráp (`explodeFactor < 0.25`)**: Kích hoạt mặt phẳng cắt bậc thang (`stepped cutaway window`) để học viên nhìn xuyên từ ngoài vào trong thấy rõ từng tầng mô học.
- **Khi bóc tách (`explodeFactor ≥ 0.25`)**:
  - Các lớp ngoài (`idx = 0..4`): Gỡ bỏ hoàn toàn mặt phẳng cắt (`mesh.material.clippingPlanes = null;`) để hiển thị hình thể 3D nguyên vẹn cùng bề mặt thớ cơ sắc nét, không bị lỗ khuyết.
  - Lớp niêm mạc trong cùng (`idx = 5`): Giữ nguyên mặt phẳng cắt lòng tạng co-moving để học viên quan sát được các nếp gấp nhăn nheo Rugae bên trong lòng ống tiêu hóa.
