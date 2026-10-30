// All user-visible Vietnamese text.
export const STR = {
  appTitle: 'Bể sóng 3D – Giao thoa sóng nước',

  err: {
    title: 'Đã xảy ra lỗi',
    hint: 'Hãy bấm "Tải lại". Nếu lỗi lặp lại, bấm "Sao chép" và gửi nội dung cho người phát triển.',
    uncaught: 'Lỗi chương trình',
    promise: 'Lỗi bất đồng bộ (promise bị từ chối)',
    shader: 'Lỗi biên dịch shader',
    shaderHint: 'Card đồ hoạ không dịch được chương trình vẽ. Hãy chọn Chất lượng "Thấp" trong tab Hiệu năng (Cài đặt), cập nhật driver card đồ hoạ rồi tải lại trang. Nếu vẫn lỗi, bấm "Sao chép" và gửi cho người phát triển.',
    load: 'Không tải được tệp',
    loadHint: 'Một tệp của ứng dụng không tải được. Hãy mở trang qua máy chủ (ví dụ http://localhost:8000) thay vì mở trực tiếp tệp index.html, kiểm tra đủ thư mục js/ và vendor/, rồi tải lại.',
    startup: 'Không khởi động được ứng dụng',
    loop: 'Lỗi trong vòng lặp vẽ – mô phỏng đã dừng',
    noWebGL2Title: 'Trình duyệt không hỗ trợ WebGL2',
    noWebGL2: 'Ứng dụng cần WebGL2 để mô phỏng mặt nước trên card đồ hoạ.',
    noWebGL2Hint: 'Hãy dùng Chrome hoặc Edge bản mới, bật "Sử dụng tăng tốc phần cứng khi khả dụng" trong phần Hệ thống của cài đặt trình duyệt, khởi động lại trình duyệt rồi tải lại trang.',
    floatTitle: 'GPU không hỗ trợ kết cấu số thực',
    float: 'Card đồ hoạ không cho phép ghi vào kết cấu float hoặc half-float (EXT_color_buffer_float), nên không thể chạy mô phỏng sóng.',
    floatHint: 'Hãy cập nhật driver card đồ hoạ, thử Chrome/Edge bản mới nhất, hoặc dùng máy tính khác.',
    contextLost: 'Mất ngữ cảnh WebGL',
    contextLostDetail: 'Card đồ hoạ vừa bị đặt lại (do driver hoặc thiếu bộ nhớ).',
    contextLostHint: 'Hãy bấm "Tải lại". Nếu lặp lại thường xuyên, chọn Chất lượng "Thấp" trong tab Hiệu năng.',
    copy: 'Sao chép',
    copied: 'Đã chép',
    close: 'Đóng',
    reload: 'Tải lại',
    repeated: (n) => `(lặp lại ${n} lần)`,
  },

  toolbar: {
    count: 'Số bóng',
    run: 'Chạy nguồn',
    stop: 'Dừng nguồn',
    clear: 'Xóa sóng',
    settings: 'Cài đặt',
    present: 'Trình chiếu',
    fullscreen: 'Toàn màn hình',
    exitFullscreen: 'Thoát toàn màn hình',
    tipCount: 'Số nguồn sóng (phím 1, 2, 4)',
    tipRun: 'Bật / tắt dao động của các quả bóng (phím Space)',
    tipClear: 'Làm phẳng mặt nước, xóa toàn bộ sóng hiện có',
    tipSettings: 'Mở / đóng bảng cài đặt',
    tipPresent: 'Ẩn giao diện để trình chiếu (phím H, Esc để thoát)',
    tipFullscreen: 'Bật / tắt chế độ toàn màn hình',
    presentHint: 'Chế độ trình chiếu – nhấn Esc hoặc H để thoát',
  },

  panel: {
    title: 'Cài đặt',
    close: 'Đóng bảng cài đặt',
    tabs: ['Thí nghiệm', 'Cảnh', 'Lý thuyết', 'Hiệu năng'],

    frequency: 'Tần số',
    amplitude: 'Biên độ',
    spacing: 'Khoảng cách nguồn',
    phaseOffset: 'Lệch pha',
    ballSize: 'Cỡ bóng',
    layout: 'Bố cục',
    layoutHang: 'Hàng ngang',
    layoutVuong: 'Hình vuông',
    tipFrequency: 'Số dao động mỗi giây của bóng. Tần số càng cao thì bước sóng càng ngắn (λ = v / f).',
    tipAmplitude: 'Độ cao của sóng ở cách nguồn 1 đơn vị.',
    tipSpacing: 'Khoảng cách d giữa hai nguồn cạnh nhau.',
    tipPhaseOffset: 'Độ lệch pha giữa các nguồn xen kẽ. 0° là cùng pha.',
    tipBallSize: 'Bán kính quả bóng. Bóng lớn hơn tạo sóng mạnh hơn.',
    tipLayout: 'Cách xếp các nguồn (phím L). Hình vuông áp dụng khi có 4 bóng.',

    map: 'Khung cảnh',
    tipMap: 'Chọn khung cảnh mặt nước (phím M).',
    pitch: 'Góc nhìn',
    tipPitch: 'Góc của camera so với mặt nước; 90° là nhìn thẳng từ trên xuống.',

    overlay: 'Vẽ đường nút lý thuyết',
    tipOverlay: 'Vẽ các hypebol nơi hai sóng triệt tiêu theo lý thuyết, để so với các đường đứng yên trên mặt nước (phím O).',
    overlayNeeds2: 'Chỉ hiển thị khi có đúng 2 bóng.',
    readout: 'Số liệu',
    formulas: [
      'Bước sóng: λ = v / f',
      'Cực đại (dao động mạnh): |d₁ − d₂| = kλ',
      'Cực tiểu (đứng yên): |d₁ − d₂| = (k + ½)λ',
    ],

    quality: 'Chất lượng',
    qualityNames: { auto: 'Tự động', low: 'Thấp', medium: 'Trung bình', high: 'Cao' },
    tipQuality: 'Tự động hạ hoặc nâng chất lượng để giữ khoảng 60 khung hình/giây.',
    current: (level, res, pr) => `Đang dùng: ${level} · lưới ${res}×${res} · độ phân giải ×${pr}`,
    reflection: 'Mây phản chiếu trên mặt nước',
    refraction: 'Khúc xạ và màu nước sâu',
    foam: 'Bọt trên đỉnh sóng',
    lowNote: 'Mức Thấp luôn tắt khúc xạ và bọt.',
    showFps: 'Hiện số khung hình/giây (phím F)',
    reset: 'Đặt lại mặc định',
    tipReset: 'Khôi phục mọi cài đặt về giá trị ban đầu.',
    keys: 'Phím tắt: 1 / 2 / 4 · L bố cục · Space chạy/dừng · M cảnh · O đường nút · F FPS · H trình chiếu',
  },

  readout: {
    f: 'Tần số f',
    lambda: 'Bước sóng λ',
    speed: 'Tốc độ sóng v',
    d: 'Khoảng cách d',
    ratio: 'd / λ',
    nodal: 'Số đường nút',
    na: '—',
  },

  hud: {
    fps: 'FPS',
  },

  tuning: {
    title: 'Tinh chỉnh hình ảnh',
    normalStrength: 'Độ nổi pháp tuyến',
    glareIntensity: 'Cường độ vệt sáng trời',
    fresnelBias: 'Độ phản xạ Fresnel',
    deepColor: 'Màu nước sâu',
    specularPower: 'Độ sắc lấp lánh',
    foam: 'Lượng bọt',
    copy: 'Sao chép thông số',
    copied: 'Đã chép',
    hint: 'Phím T để ẩn / hiện. Thay đổi chỉ áp dụng cho khung cảnh hiện tại trong phiên này.',
  },

  units: {
    hz: 'Hz',
    deg: '°',
    len: 'đv',
    speed: 'đv/s',
  },

  maps: {
    hoChieuXam: 'Hồ chiều xám',
    bienBanNgay: 'Biển ban ngày',
    hoangHon: 'Hoàng hôn',
    demTrang: 'Đêm trăng',
  },
};

// Vietnamese number format: decimal comma.
export function fmt(v, digits) {
  return v.toFixed(digits).replace('.', ',');
}
