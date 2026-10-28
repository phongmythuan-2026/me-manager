/**
 * MODULE SHAREPOINT & POWER AUTOMATE (MODULAR EXTENSIBLE)
 * Quản lý kết nối và cấu hình dữ liệu từ SharePoint qua Power Automate Webhooks.
 * Dễ dàng mở rộng thêm các bảng khác trong tương lai.
 */

// Cấu hình danh sách các bảng SharePoint / Power Automate Flows
// Sau này muốn thêm bảng mới (VD: Kho, Kế hoạch...), chỉ cần khai báo thêm vào đây!
var SHAREPOINT_TABLES = {
  "BAO_CAO_SX": {
    name: "Báo cáo sản xuất",
    url: "https://defaultaab18f10652f4cd396cb119ca693ef.00.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/10/workflows/8ae53370aac14c0b88762d82cf742464/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=UZEPcMc-Vtkr9eArrpSNsDA6VUuwNFQVs4JALr1HLGI",
    columns: [
      "Tên sản phẩm", "Mã sản phẩm", "KL NL ban đầu", "KL thành phẩm", "Số lệnh SX",
      "Số lot", "Mẻ sx", "Công đoạn", "Số nhân công", "Công cụ sản xuất", "Từ giờ",
      "Đến giờ", "KL đầu vào", "KL đầu ra", "Nước", "Dầu DO", "Điện",
      "QC kiểm nghiệm \n(Đ/K)", "Mô tả tình trạng BTP/ P", "Mã số NCR",
      "Mô tả sự không phù hợp (NCR)", "Nguyên nhân", "Hành động khắc phục.. phòng ngừa",
      "Phân loại NCR", "Ngày hoàn thành", "QC giám sát", "ID", "Số giờ thực hiện",
      "Tên máy", "TP", "Năm", "Quý", "Năm-Tháng", "Tháng", "Ngày bắt đầu",
      "Ngày kết thúc", "Nhóm công đoạn", "Tháng kế hoạch", "Công đoạn tính thành phẩm",
      "Hiệu suất LAB TP/NL", "Hiệu suất SX TP/NL", "Số giờ công", "Ngày SX", "HSD",
      "Giờ bình thường (8:00 - 17:00)", "Giờ làm thêm (17:00 - 22:00)",
      "Giờ làm việc ban đêm (22:00-8:00)",
      "Số giờ công Giờ bình thường (8:00 - 17:00)2",
      "Số giờ công  Giờ làm thêm (17:00 - 22:00)2",
      "Số giờ công  Giờ làm việc ban đêm (22:00-8:00)2", "Ghi chú"
    ]
  }
  // Ví dụ thêm bảng mới sau này:
  // "BAO_CAO_KHO": {
  //   name: "Báo cáo kho",
  //   url: "URL_POWER_AUTOMATE_MỚI_Ở_ĐÂY"
  // }
};

/**
 * Hàm chung để gọi Power Automate lấy dữ liệu bảng bất kỳ theo mã định danh (tableKey)
 */
function fetchSharePointTableData(tableKey) {
  try {
    var config = SHAREPOINT_TABLES[tableKey];
    if (!config || !config.url) {
      return { success: false, data: [], message: "Không tìm thấy cấu hình SharePoint cho bảng: " + tableKey };
    }

    var options = {
      "method": "post",
      "contentType": "application/json",
      "payload": JSON.stringify({ "action": "getData", "table": tableKey })
    };

    var response = UrlFetchApp.fetch(config.url, options);
    if (response.getResponseCode() === 200) {
      var result = JSON.parse(response.getContentText());
      var body = result && result.body ? result.body : result;
      var items = Array.isArray(body) ? body
        : (body && (body.value || body.data || body.rows));
      var columns = result && (result.columns || result.headers || result.columnNames);
      if (!Array.isArray(columns) && body && body !== result) {
        columns = body.columns || body.headers || body.columnNames;
      }
      if (!Array.isArray(items)) {
        return { success: false, data: [], message: "Power Automate không trả về danh sách dòng dạng JSON." };
      }
      return {
        success: true,
        data: items,
        columns: Array.isArray(columns) && columns.length ? columns : (config.columns || []),
        tableName: config.name
      };
    }
    
    return { success: false, data: [], message: "Lỗi phản hồi từ Power Automate, mã lỗi: " + response.getResponseCode() };
  } catch (e) {
    return { success: false, data: [], message: "Ngoại lệ khi gọi SharePoint: " + e.toString() };
  }
}

/**
 * Hàm gọi riêng cho Báo cáo sản xuất (tương thích code cũ)
 */
function getBaoCaoSanXuatFromSharePoint() {
  return fetchSharePointTableData("BAO_CAO_SX");
}

/**
 * Hàm kiểm tra kết nối nhanh
 */
function testKetNoiSharePoint() {
  var res = fetchSharePointTableData("BAO_CAO_SX");
  Logger.log("Kết quả kiểm tra SharePoint: " + JSON.stringify(res));
  return res;
}