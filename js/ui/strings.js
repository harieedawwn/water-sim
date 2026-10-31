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
    count: 'Số nguồn',
    run: 'Chạy nguồn',
    stop: 'Dừng nguồn',
    clear: 'Xóa sóng',
    settings: 'Cài đặt',
    present: 'Trình chiếu',
    fullscreen: 'Toàn màn hình',
    exitFullscreen: 'Thoát toàn màn hình',
    countN: (n) => `${n} nguồn`,
    tipCount: 'Số nguồn sóng (phím 1, 2, 3, 4)',
    tipRun: 'Bật / tắt dao động của các quả bóng (phím Space)',
    tipClear: 'Làm phẳng mặt nước, xóa toàn bộ sóng hiện có',
    tipSettings: 'Mở / đóng bảng cài đặt',
    tipPresent: 'Ẩn giao diện để trình chiếu (phím H, Esc để thoát)',
    tipFullscreen: 'Bật / tắt chế độ toàn màn hình',
    presentHint: 'Chế độ trình chiếu – nhấn Esc hoặc H để thoát',
  },

  // Fixed text on the page (title top, school name top right).
  chrome: {
    title: 'THÍ NGHIỆM MÔ PHỎNG GIAO THOA SÓNG NƯỚC',
    footer: 'TRƯỜNG THPT TRẦN QUỐC TOẢN (ĐỒNG THÁP)',
  },

  panel: {
    title: 'Cài đặt',
    close: 'Đóng bảng cài đặt',

    secView: 'Chế độ xem',
    secSources: 'Nguồn sóng',
    secLines: 'Đường giao thoa',
    secPhase: 'Pha ban đầu',
    secMore: 'Tùy chỉnh thêm',
    secAdvanced: 'Nâng cao',

    view: 'Chế độ xem',
    tipView: 'Chọn mặt hồ, mặt biển hoặc hình vẽ 2D nhìn từ trên xuống (phím M).',
    moveMode: 'Di chuyển nguồn',
    tipMoveMode: 'Bật để kéo các nguồn bằng chuột hoặc ngón tay; tắt thì bấm lên mặt nước để thả giọt (phím D).',
    frequency: 'Tần số',
    tipFrequency: 'Số dao động mỗi giây của bóng. Tần số càng cao thì bước sóng càng ngắn.',
    perSourceFreq: 'Chỉnh riêng từng nguồn',
    tipPerSourceFreq: 'Bật để đặt tần số riêng cho từng nguồn; tắt thì một thanh trượt chỉnh tần số cho mọi nguồn.',
    freqOf: (i) => `Tần số S${'₁₂₃₄'[i]}`,
    tipFreqOf: 'Tần số riêng của nguồn này.',

    maxima: 'Cực đại',
    tipMaxima: 'Vẽ các đường dao động mạnh nhất, khi hình giao thoa đã ổn định.',
    minima: 'Cực tiểu',
    tipMinima: 'Vẽ các đường đứng yên, khi hình giao thoa đã ổn định.',
    linesHint: 'Chỉ vẽ khi hình giao thoa đã ổn định.',
    legendSolid: 'nét liền',
    legendDashed: 'nét đứt',
    linesNeed: 'Cần ít nhất 2 nguồn cùng tần số',

    phaseOf: (i) => `Pha ban đầu của S${'₁₂₃₄'[i]}`,
    phaseHint: 'Pha ban đầu quyết định thời điểm nguồn bắt đầu dao động; nguồn cùng pha khi các giá trị bằng nhau.',
    spacing: 'Khoảng cách nguồn',
    tipSpacing: 'Khoảng cách giữa hai nguồn cạnh nhau.',
    amplitude: 'Biên độ',
    tipAmplitude: 'Độ cao của sóng ở cách nguồn 1 đơn vị.',
    layout: 'Bố cục',
    layoutHang: 'Hàng ngang',
    layoutVuong: 'Tam giác / Vuông',
    tipLayout: 'Cách xếp các nguồn (phím L). Có 3 nguồn: tam giác đều; có 4 nguồn: hình vuông.',
    ballSize: 'Kích thước bóng',
    ballColor: 'Màu bóng',
    ballColorNames: ['Vàng cam', 'Đỏ', 'Xanh lá', 'Vàng', 'Xanh dương', 'Tím', 'Hồng', 'Trắng'],
    tipBallSize: 'Phóng to hoặc thu nhỏ các quả bóng nguồn.',
    pitch: 'Góc nhìn',
    tipPitch: 'Góc của camera so với mặt nước; 90° là nhìn thẳng từ trên xuống.',
    troughs2d: 'Đáy sóng (nét đứt)',
    grid2d: 'Lưới tọa độ',
    resetPositions: 'Đặt lại vị trí',
    tipResetPositions: 'Đưa các nguồn về vị trí theo bố cục và khoảng cách đã chọn.',

    quality: 'Chất lượng',
    qualityNames: { auto: 'Tự động', low: 'Thấp', medium: 'Trung bình', high: 'Cao' },
    tipQuality: 'Tự động hạ hoặc nâng chất lượng để giữ khoảng 60 khung hình/giây.',
    current: (level, nx, nz, pr) => `Đang dùng: ${level} · lưới ${nx}×${nz} · độ phân giải ×${pr}`,
    reflection: 'Mây phản chiếu trên mặt nước',
    refraction: 'Khúc xạ và màu nước sâu',
    foam: 'Bọt trên đỉnh sóng',
    lowNote: 'Mức Thấp luôn tắt khúc xạ và bọt.',
    showFps: 'Hiện số khung hình/giây (phím F)',
    reset: 'Đặt lại mặc định',
    tipReset: 'Khôi phục mọi cài đặt về giá trị ban đầu.',
    keys: 'Phím tắt: 1 / 2 / 4 · L bố cục · Space chạy/dừng · M chế độ xem · D di chuyển nguồn · F FPS · H trình chiếu · Esc thoát',
  },

  tour: {
    skip: 'Bỏ qua',
    next: 'Tiếp tục',
    done: 'Hoàn tất',
    replay: 'Xem lại hướng dẫn',
    progress: (n, total) => `${n}/${total}`,
    steps: {
      count: { title: 'Số nguồn', text: 'Chọn 1 đến 4 nguồn sóng. Mỗi nguồn là một quả cầu đỏ dao động trên mặt nước.' },
      runclear: { title: 'Dừng nguồn và Xóa sóng', text: 'Tạm dừng các nguồn để quan sát, hoặc xóa hết sóng để làm lại từ đầu.' },
      settings: { title: 'Cài đặt', text: 'Mở bảng cài đặt: chế độ xem, tần số, pha ban đầu, khoảng cách nguồn...' },
      move: { title: 'Di chuyển nguồn', text: 'Bật lên rồi kéo từng quả cầu để đổi vị trí nguồn.' },
      lines: { title: 'Đường giao thoa', text: 'Hiện đường cực đại (vàng) và cực tiểu (xanh nhạt, nét đứt).' },
      readout: { title: 'Tần số và bước sóng', text: 'Số liệu này đổi theo tần số bạn chọn.' },
      tray: { title: 'Mẫu vật', text: 'Giữ tờ giấy, kéo vào mặt nước rồi thả để thấy nó nhấp nhô theo sóng.' },
      screen: { title: 'Trình chiếu', text: 'Chế độ trình chiếu và toàn màn hình, tiện khi dạy trên máy chiếu.' },
    },
  },

  readout: {
    f: 'Tần số (f)',
    lambda: 'Bước sóng (λ)',
  },

  hud: {
    fps: 'FPS',
    paper: 'Mẫu vật',
    paperHint: 'Nhấn giữ tờ giấy, kéo vào mặt nước rồi thả',
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

  views: {
    lake: 'Mặt hồ',
    sea: 'Mặt biển',
    twoD: '2D',
  },

  // Source names everywhere (index 0..3).
  sourceName: (i) => `S${'₁₂₃₄'[i]}`,
};

// Vietnamese number format: decimal comma.
export function fmt(v, digits) {
  return v.toFixed(digits).replace('.', ',');
}
