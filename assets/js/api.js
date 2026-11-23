// --- CẤU HÌNH CÁC ENDPOINT API ---
const API_CONFIG = {
  // URL Web App của Google Apps Script (backend dữ liệu và bridge RPC).
  GAS_API_URL: "https://script.google.com/macros/s/AKfycbyBFMbRDL3CpnOJwo6Drh54hCTr6kn7Y7a9j7w8u5ItFUM0RlJLh3MGGeLo1c3O89zuLg/exec"
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
