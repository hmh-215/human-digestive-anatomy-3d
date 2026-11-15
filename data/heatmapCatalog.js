import * as THREE from 'three';

/**
 * Samples a continuous, high-luminosity pastel-vibrant thermal color for s in [0.0, 1.0].
 * Shared single source of truth for 3D vertex heatmaps, hover/tap pins, and the right drawer.
 */
export function sampleContinuousThermalColor(s) {
  const stops = [
    new THREE.Color(0xff477e), // 0.00: Luminous Coral Rose (Hot / Nóng nhất)
    new THREE.Color(0xff8533), // 0.14: Warm Glowing Peach
    new THREE.Color(0xffd13b), // 0.28: Sunny Butter Amber
    new THREE.Color(0x7bed9f), // 0.42: Fresh Pastel Lime
    new THREE.Color(0x2fe091), // 0.56: Fresh Mint Emerald
    new THREE.Color(0x38e1ff), // 0.70: Luminous Sky Aqua
    new THREE.Color(0x54a0ff), // 0.82: Soft Cornflower Blue
    new THREE.Color(0xa55eea), // 0.92: Pastel Lavender
    new THREE.Color(0xff78cb)  // 1.00: Radiant Orchid Pink (Cold / Lạnh nhất)
  ];
  const t = Math.max(0, Math.min(1, s));
  const scaled = t * (stops.length - 1);
  const idx = Math.floor(scaled);
  const frac = scaled - idx;
  if (idx >= stops.length - 1) return stops[stops.length - 1].clone();
  return stops[idx].clone().lerp(stops[idx + 1], frac);
}

/**
 * Generates n discrete pastel colors sampled evenly along the thermal spectrum.
 */
export function getThermalPalette(n) {
  if (n === 2) {
    return [new THREE.Color(0xff477e), new THREE.Color(0x54a0ff)];
  }
  if (n <= 1) return [new THREE.Color(0xff477e)];
  const palette = [];
  for (let i = 0; i < n; i++) {
    palette.push(sampleContinuousThermalColor(i / (n - 1)));
  }
  return palette;
}

function buildSectionList(organId, tag, definitions) {
  const palette = getThermalPalette(definitions.length);
  return definitions.map((def, index) => ({
    ...def,
    organId,
    tag,
    color: '#' + palette[index].getHexString()
  }));
}

export const HEATMAP_CATALOG = {
  stomach: buildSectionList('stomach', 'PHÂN VÙNG DẠ DÀY', [
    {
      key: 'fundus',
      badge: 'Túi Hơi Dạ Dày',
      title: 'Đáy Vị (Fundus Gastricum)',
      subtitle: 'Vòm cong nằm phía trên mức lỗ tâm vị, thường chứa túi hơi dạ dày quan sát rõ trên phim X-quang bụng đứng không chuẩn bị.',
      centerLocal: [2.5, 121.8, 3.2]
    },
    {
      key: 'cardia',
      badge: 'Chống Trào Ngược',
      title: 'Tâm Vị & Ấn Tâm Vị (Pars Cardiaca & Incisura Cardiaca)',
      subtitle: 'Vùng nối tiếp giữa thực quản và dạ dày, tuyến tâm vị tiết chất nhầy kiềm bảo vệ niêm mạc chống trào ngược dịch vị acid.',
      centerLocal: [1.6, 119.5, 3.8]
    },
    {
      key: 'corpus',
      badge: 'Tiết Acid & Pepsin',
      title: 'Thân Vị (Corpus Gastricum)',
      subtitle: 'Phần lớn nhất của dạ dày, chứa tuyến vị với tế bào thành (tiết HCl pH 1.5 - 2 và yếu tố nội sinh hấp thu B12) và tế bào chính (tiết pepsinogen tiêu đạm).',
      centerLocal: [2.5, 116.0, 3.1]
    },
    {
      key: 'antrum',
      badge: 'Tiết Gastrin',
      title: 'Hang Môn Vị (Antrum Pyloricum)',
      subtitle: 'Phần phình trước môn vị, chứa tế bào G tiết hoóc-môn Gastrin kích thích bài tiết acid dịch vị; đây là vị trí phổ biến nhất của viêm loét dạ dày do H. pylori.',
      centerLocal: [0.5, 113.4, 2.8]
    },
    {
      key: 'pylorus',
      badge: 'Cơ Thắt Môn Vị',
      title: 'Ống Môn Vị & Môn Vị (Canalis Pyloricus & Pylorus)',
      subtitle: 'Đoạn tận cùng hẹp có cơ thắt môn vị tròn rất dày, hoạt động như van đóng mở điều hòa tống từng đợt vị trấp xuống tá tràng.',
      centerLocal: [-1.5, 114.0, 2.8]
    }
  ]),

  pancreas: buildSectionList('pancreas', 'PHÂN VÙNG TUYẾN TỤY', [
    {
      key: 'head',
      badge: 'Ngoại Tiết 98%',
      title: 'Đầu Tụy & Mỏm Móc (Caput & Processus Uncinatus)',
      subtitle: 'Nằm lọt trong khung chữ C tá tràng, chứa các nang tuyến ngoại tiết sản xuất enzym tiêu hóa (Amylase, Lipase, Trypsin) và kiềm NaHCO3.',
      centerLocal: [-2.8, 108.5, 1.5]
    },
    {
      key: 'neck',
      badge: 'Khuyết Tụy & TM Cửa',
      title: 'Cổ Tụy & Khuyết Tụy (Collum Pancreatis)',
      subtitle: 'Chỗ thắt hẹp kẹp bó mạch mạc treo tràng trên (SMA/SMV), mốc giải phẫu tối quan trọng tạo thành thân Tĩnh Mạch Cửa ngay phía sau.',
      centerLocal: [-0.8, 109.2, 1.4]
    },
    {
      key: 'body',
      badge: 'Băng Ngang L1-L2',
      title: 'Thân Tụy (Corpus Pancreatis)',
      subtitle: 'Chạy vắt ngang trước cột sống thắt lưng L1-L2, đè lên đám rối tạng giải thích cơ chế cơn đau xuyên lưng trong viêm tụy cấp.',
      centerLocal: [1.8, 110.2, 1.2]
    },
    {
      key: 'tail',
      badge: 'Đảo Langerhans Nội Tiết',
      title: 'Đuôi Tụy (Cauda Pancreatis)',
      subtitle: 'Phần di động chạm rốn lách, tập trung mật độ cao nhất các Đảo tụy Langerhans (tế bào Beta tiết Insulin, tế bào Alpha tiết Glucagon).',
      centerLocal: [4.2, 111.5, 0.6]
    }
  ]),

  duodenum: buildSectionList('duodenum', 'PHÂN VÙNG TÁ TRÀNG', [
    {
      key: 'd1',
      badge: 'Hành Tá Tràng D1',
      title: 'Đoạn Trên - Hành Tá Tràng (Pars Superior / Bulbus Duodeni)',
      subtitle: 'Đoạn di động duy nhất của tá tràng, tiếp nối ống môn vị tại L1; niêm mạc nhẵn và là vị trí xuất hiện >90% ổ loét tá tràng do acid.',
      centerLocal: [-1.8, 113.2, 2.5]
    },
    {
      key: 'flex_sup',
      badge: 'Góc Tá Trên L1',
      title: 'Góc Tá Trên (Flexura Duodeni Superior)',
      subtitle: 'Khúc ngoặt 90 độ giữa D1 và D2 nằm ngay dưới gan và túi mật, ngang mức bờ phải đốt sống thắt lưng L1.',
      centerLocal: [-4.4, 111.5, 2.2]
    },
    {
      key: 'd2',
      badge: 'Nhú Tá Lớn Vater',
      title: 'Đoạn Xuống & Nhú Tá Lớn (Pars Descendens & Papilla Duodeni Major)',
      subtitle: 'Chạy thẳng đứng dọc bờ phải cột sống L2-L3; thành sau trong chứa Nhú tá lớn có cơ thắt Oddi điều hòa dịch mật và tụy đổ vào.',
      centerLocal: [-5.3, 108.0, 1.8]
    },
    {
      key: 'flex_inf',
      badge: 'Góc Tá Dưới L3',
      title: 'Góc Tá Dưới (Flexura Duodeni Inferior)',
      subtitle: 'Góc gấp khúc chuyển tiếp giữa đoạn xuống D2 và đoạn ngang D3 tại mức đốt sống L3.',
      centerLocal: [-4.6, 104.8, 1.6]
    },
    {
      key: 'd3',
      badge: 'Bắt Chéo ĐMC & SMA',
      title: 'Đoạn Ngang (Pars Horizontalis / Pars Inferior)',
      subtitle: 'Chạy ngang sang trái băng qua trước IVC và động mạch chủ bụng tại L3, bị kẹp phía trước bởi động mạch mạc treo tràng trên (SMA).',
      centerLocal: [-2.2, 105.2, 1.5]
    },
    {
      key: 'd4',
      badge: 'Dây Chằng Treitz',
      title: 'Đoạn Lên & Góc Tá Hỗng Tràng (Pars Ascendens & Flexura Treitz)',
      subtitle: 'Chạy chếch lên trái đến L2 nối tiếp hỗng tràng, cố định bởi dây chằng Treitz — ranh giới phân định xuất huyết tiêu hóa trên và dưới.',
      centerLocal: [0.2, 108.2, 1.5]
    }
  ]),

  large_intestine: buildSectionList('large_intestine', 'PHÂN VÙNG ĐẠI TRÀNG', [
    {
      key: 'cecum',
      badge: 'Điểm McBurney',
      title: 'Manh Tràng & Ruột Thừa (Caecum & Appendix Vermiformis)',
      subtitle: 'Túi cùng ở hố chậu phải dưới van hồi manh tràng Bauhin; ruột thừa là vị trí điểm đau ngoại khoa kinh điển McBurney trong viêm ruột thừa cấp.',
      centerLocal: [-4.8, 92.0, 2.0]
    },
    {
      key: 'ascending',
      badge: 'Mạc Dính Toldt P',
      title: 'Đại Tràng Lên & Góc Gan (Colon Ascendens & Flexura Coli Dextra)',
      subtitle: 'Chạy dọc rãnh đại tràng phải lên bờ dưới gan tạo Góc gan; cố định bởi mạc dính Toldt phải và hấp thu chủ yếu nước, điện giải.',
      centerLocal: [-4.6, 102.0, 2.0]
    },
    {
      key: 'transverse',
      badge: 'Mạc Treo Di Động',
      title: 'Đại Tràng Ngang & Góc Lách (Colon Transversum & Flexura Coli Sinistra)',
      subtitle: 'Đoạn dài nhất và di động nhất nhờ mạc treo đại tràng ngang; uốn cong hình chữ U từ góc gan sang góc lách.',
      centerLocal: [0.0, 108.5, 2.5]
    },
    {
      key: 'descending',
      badge: 'Mạc Dính Toldt T',
      title: 'Đại Tràng Xuống (Colon Descendens)',
      subtitle: 'Chạy từ góc lách dọc mạn sườn trái xuống mào chậu, cố định bởi mạc dính Toldt trái, lòng hẹp chứa phân đặc.',
      centerLocal: [4.5, 100.0, 1.8]
    },
    {
      key: 'sigmoid',
      badge: 'Mạc Treo Sigma',
      title: 'Đại Tràng Sigma (Colon Sigmoideum)',
      subtitle: 'Quai ruột hình chữ S di động ở hố chậu trái nối tiếp trực tràng ngang mức S3, vị trí hay gặp túi thừa và xoắn đại tràng sigma.',
      centerLocal: [2.5, 91.0, 1.5]
    }
  ]),

  esophagus: buildSectionList('esophagus', 'PHÂN VÙNG THỰC QUẢN', [
    {
      key: 'cervical',
      badge: 'Miệng Thực Quản C6',
      title: 'Đoạn Cổ Thực Quản (Pars Cervicalis Oesophagi)',
      subtitle: 'Khởi đầu từ bờ dưới sụn nhẫn C6 (chỗ hẹp trên cùng ~15cm từ cung răng), đi sau khí quản và trước cột sống cổ.',
      centerLocal: [0.0, 141.0, -1.0]
    },
    {
      key: 'thoracic',
      badge: 'Chỗ Hẹp T4-T5',
      title: 'Đoạn Ngực Thực Quản (Pars Thoracica Oesophagi)',
      subtitle: 'Nằm trong trung thất sau, áp sát mặt sau tâm nhĩ trái và phế quản chính trái (hai chỗ hẹp ~22.5cm và 27.5cm từ cung răng).',
      centerLocal: [0.0, 132.0, -1.2]
    },
    {
      key: 'abdominal',
      badge: 'Lỗ Cơ Hoành T10',
      title: 'Đoạn Bụng Thực Quản (Pars Abdominalis Oesophagi)',
      subtitle: 'Chui qua lỗ cơ hoành T10 (~40cm từ cung răng) dài 2-3cm đổ vào tâm vị dạ dày tại góc His; cơ thắt thực quản dưới ngăn trào ngược.',
      centerLocal: [0.6, 121.0, 1.2]
    }
  ]),

  gallbladder_tree: buildSectionList('gallbladder_tree', 'PHÂN VÙNG ĐƯỜNG MẬT', [
    {
      key: 'fundus',
      badge: 'Điểm Đau Murphy',
      title: 'Đáy Túi Mật (Fundus Vesicae Biliaris)',
      subtitle: 'Nhô ra khỏi bờ dưới gan tại khuyết túi mật, tiếp xúc thành bụng trước tại điểm Murphy (bờ ngoài cơ thẳng bụng phải - bờ sườn 9).',
      centerLocal: [-3.5, 114.0, 6.8]
    },
    {
      key: 'corpus',
      badge: 'Cô Đặc Dịch Mật',
      title: 'Thân Túi Mật (Corpus Vesicae Biliaris)',
      subtitle: 'Áp sát vào hố túi mật ở mặt tạng gan; niêm mạc tổ ong cô đặc dịch mật 5-10 lần nhờ tái hấp thu nước và điện giải.',
      centerLocal: [-3.2, 115.2, 5.2]
    },
    {
      key: 'neck',
      badge: 'Túi Cùng Hartmann',
      title: 'Cổ Túi Mật & Túi Cùng Hartmann (Collum & Infundibulum)',
      subtitle: 'Hình chữ S uốn lượn nối vào ống túi mật; phần phình Hartmann là nơi sỏi mật hay kẹt gây viêm túi mật cấp.',
      centerLocal: [-2.7, 116.0, 3.6]
    },
    {
      key: 'bile_duct',
      badge: 'Tam Giác Calot',
      title: 'Ống Mật Chủ (Ductus Choledochus)',
      subtitle: 'Dẫn mật từ hợp lưu ống gan chung và ống túi mật đi trong cuống gan, chui sau đầu tụy đổ vào nhú tá lớn D2 tá tràng.',
      centerLocal: [-2.2, 113.0, 2.0]
    }
  ]),

  small_intestine: buildSectionList('small_intestine', 'PHÂN VÙNG RUỘT NON', [
    {
      key: 'jejunum',
      badge: '2/5 Trên Ruột Non',
      title: 'Hỗng Tràng (Jejunum)',
      subtitle: 'Chiếm 2/5 trên ruột non ở ô bụng trên trái; thành dày, mạch máu dồi dào, nếp vòng Kerckring và nhung mao dày đặc tối ưu hấp thu đường đạm.',
      centerLocal: [2.2, 102.5, 2.5]
    },
    {
      key: 'ileum',
      badge: '3/5 Dưới Ruột Non',
      title: 'Hồi Tràng (Ileum)',
      subtitle: 'Chiếm 3/5 dưới ruột non ở ô bụng dưới phải đổ vào manh tràng tại van Bauhin; chứa mảng Peyer miễn dịch và tái hấp thu muối mật, vitamin B12.',
      centerLocal: [-2.2, 95.0, 2.2]
    }
  ]),

  liver: buildSectionList('liver', 'PHÂN THÙY GAN COUINAUD', [
    {
      key: 'seg_1',
      badge: 'Hạ Phân Thùy I',
      title: 'Hạ Phân Thùy I — Thùy Đuôi (Spigel / Lobus Caudatus)',
      subtitle: 'Nằm ở mặt sau cạnh tĩnh mạch chủ dưới; nhận máu trực tiếp từ cả nhánh cửa phải và trái, dẫn lưu tĩnh mạch riêng đổ thẳng vào IVC (bảo tồn trong hội chứng Budd-Chiari).',
      couinaudRoman: 'I'
    },
    {
      key: 'seg_2',
      badge: 'Hạ Phân Thùy II',
      title: 'Hạ Phân Thùy II — Bên Sau Trái (Left Postero-Lateral)',
      subtitle: 'Phần trên thùy gan trái nằm bên trái khe liên phân thùy trái (tĩnh mạch gan trái), tiếp xúc vòm hoành trái.',
      couinaudRoman: 'II'
    },
    {
      key: 'seg_3',
      badge: 'Hạ Phân Thùy III',
      title: 'Hạ Phân Thùy III — Bên Trước Trái (Left Antero-Lateral)',
      subtitle: 'Phần trước dưới thùy gan trái nằm bên trái dây chằng liềm, tựa lên mặt trước dạ dày.',
      couinaudRoman: 'III'
    },
    {
      key: 'seg_4',
      badge: 'Hạ Phân Thùy IV',
      title: 'Hạ Phân Thùy IV — Thùy Vuông / Giữa Trái (Left Medial)',
      subtitle: 'Giới hạn bởi dây chằng liềm bên trái và khe chính Cantlie (tĩnh mạch gan giữa) bên phải; chia nhỏ thành IVa (trên) và IVb (dưới).',
      couinaudRoman: 'IV'
    },
    {
      key: 'seg_5',
      badge: 'Hạ Phân Thùy V',
      title: 'Hạ Phân Thùy V — Trước Dưới Phải (Right Antero-Inferior)',
      subtitle: 'Phần trước dưới gan phải nằm ngay cạnh hố túi mật và bờ dưới gan.',
      couinaudRoman: 'V'
    },
    {
      key: 'seg_6',
      badge: 'Hạ Phân Thùy VI',
      title: 'Hạ Phân Thùy VI — Sau Dưới Phải (Right Postero-Inferior)',
      subtitle: 'Phần ngoài dưới gan phải tạo ấn thận rõ rệt khi áp sát cực trên thận phải và tuyến thượng thận phải.',
      couinaudRoman: 'VI'
    },
    {
      key: 'seg_7',
      badge: 'Hạ Phân Thùy VII',
      title: 'Hạ Phân Thùy VII — Sau Trên Phải (Right Postero-Superior)',
      subtitle: 'Nằm ở vòm sau trên gan phải sát vùng trần và tĩnh mạch gan phải, ít di động do dây chằng tam giác phải.',
      couinaudRoman: 'VII'
    },
    {
      key: 'seg_8',
      badge: 'Hạ Phân Thùy VIII',
      title: 'Hạ Phân Thùy VIII — Trước Trên Phải (Right Antero-Superior)',
      subtitle: 'Khối nhu mô lớn ở vòm hoành phải giữa khe chính Cantlie (TM gan giữa) và khe liên phân thùy phải (TM gan phải).',
      couinaudRoman: 'VIII'
    }
  ]),

  peritoneum_omentum: buildSectionList('peritoneum_omentum', 'PHÂN VÙNG PHÚC MẠC', [
    {
      key: 'lesser_omentum',
      badge: 'Cuống Gan & Lỗ Winslow',
      title: 'Mạc Nối Nhỏ (Omentum Minus / Lesser Omentum)',
      subtitle: 'Nếp phúc mạc căng từ rốn gan đến bờ cong nhỏ dạ dày và tá tràng; bờ tự do bên phải chứa cuống gan và giới hạn trước lỗ Winslow.',
      centerLocal: [-1.0, 118.0, 2.5]
    },
    {
      key: 'mesocolon',
      badge: 'Chia 2 Tầng Ổ Bụng',
      title: 'Mạc Treo Đại Tràng Ngang (Mesocolon Transversum)',
      subtitle: 'Bản phúc mạc treo đại tràng ngang vào thành bụng sau, phân chia ổ phúc mạc thành tầng trên mạc treo và tầng dưới mạc treo.',
      centerLocal: [0.0, 108.0, 0.5]
    },
    {
      key: 'greater_omentum',
      badge: 'Người Cảnh Sát Ổ Bụng',
      title: 'Mạc Nối Lớn (Omentum Majus / Greater Omentum)',
      subtitle: 'Tạp dề 4 lá phúc mạc rủ xuống từ bờ cong lớn dạ dày phủ trước các quai ruột non, có khả năng di chuyển khu trú ổ viêm nhiễm ổ bụng.',
      centerLocal: [0.0, 101.0, 4.2]
    },
    {
      key: 'meso_appendix',
      badge: 'ĐM Ruột Thừa',
      title: 'Mạc Treo Ruột Thừa & Hố Chậu Phải (Meso-appendix)',
      subtitle: 'Nếp phúc mạc tam giác chứa động mạch ruột thừa (nhánh ĐM hồi đại tràng) — mốc kẹp thắt mạch then chốt khi cắt ruột thừa.',
      centerLocal: [-4.5, 91.5, 1.5]
    }
  ])
};

export function getOrganHeatmapRegions(organId) {
  return HEATMAP_CATALOG[organId] || null;
}
