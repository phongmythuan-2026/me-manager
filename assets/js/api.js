// --- CẤU HÌNH CÁC ENDPOINT API ---
const API_CONFIG = {
  // URL Web App của Google Apps Script (Backend xử lý Google Sheets & Drive Upload)
  GAS_API_URL: "https://script.google.com/macros/s//AKfycbyBFMbRDL3CpnOJwo6Drh54hCTr6kn7Y7a9j7w8u5ItFUM0RlJLh3MGGeLo1c3O89zuLg/exec",

  // Cấu hình các bảng SharePoint qua Power Automate theo dạng Module
  SHAREPOINT_MODULES: {
    "BAO_CAO_SX": {
      name: "Báo cáo sản xuất",
      url: "https://defaultaab18f10652f4cd396cb119ca693ef.00.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/10/workflows/8ae53370aac14c0b88762d82cf742464/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=UZEPcMc-Vtkr9eArrpSNsDA6VUuwNFQVs4JALr1HLGI"
    }
    // Sau này muốn thêm module SharePoint mới, chỉ cần khai báo thêm vào đây:
    // "KHO_VAT_TU": { name: "Quản lý kho", url: "URL_POWER_AUTOMATE_MỚI" }
  }
};

// 1. Hàm gọi Google Apps Script (Đọc/Ghi dữ liệu ứng dụng chính)
async function callGasApi(action, payload) {
  try {
    const response = await fetch(API_CONFIG.GAS_API_URL, {
      method: "POST",
      mode: "no-cors", // Tránh lỗi CORS từ Google Script Web App
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: action, data: payload })
    });
    return { success: true, message: "Yêu cầu đã được gửi lên hệ thống." };
  } catch (error) {
    console.error("Lỗi gọi GAS API:", error);
    return { success: false, message: error.toString() };
  }
}

// 2. Hàm gọi Power Automate đọc dữ liệu SharePoint theo dạng Module linh hoạt
async function fetchSharePointModuleData(tableKey) {
  const modConfig = API_CONFIG.SHAREPOINT_MODULES[tableKey];
  if (!modConfig || !modConfig.url) {
    throw new Error(`Không tìm thấy cấu hình endpoint cho module SharePoint: ${tableKey}`);
  }

  try {
    const response = await fetch(modConfig.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getData", table: tableKey })
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const result = await response.json();
    return result.value || result; // Hỗ trợ cả cấu trúc mảng trực tiếp hoặc thuộc tính .value từ Power Automate
  } catch (error) {
    console.error(`Lỗi khi đọc module SharePoint [${tableKey}]:`, error);
    throw error;
  }
}