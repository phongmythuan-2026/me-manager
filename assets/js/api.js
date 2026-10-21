// --- CẤU HÌNH API ENDPOINTS ---
const CONFIG = {
    // URL Web App của Google Apps Script (Dùng để GHI dữ liệu & UPLOAD FILE)
    GAS_API_URL: "https://script.google.com/macros/s/YOUR_GAS_DEPLOY_ID/exec",
    
    // URL Power Automate HTTP Request (Dùng để ĐỌC dữ liệu từ SharePoint theo Module)
    SHAREPOINT_API_URL: "https://prod-xx.southeastasia.logic.azure.com:443/workflows/YOUR_WORKFLOW_ID/triggers/manual/paths/invoke..."
};

// 1. Hàm ĐỌC dữ liệu từ SharePoint (Thông qua Power Automate theo dạng Module)
async function fetchSharePointData(moduleName) {
    try {
        console.log(`Đang tải dữ liệu module [${moduleName}] từ SharePoint...`);
        const response = await axios.get(`${CONFIG.SHAREPOINT_API_URL}&module=${moduleName}`);
        return response.data; // Trả về danh sách dữ liệu JSON
    } catch (error) {
        console.error("Lỗi khi đọc dữ liệu SharePoint:", error);
        alert("Không thể tải dữ liệu từ SharePoint. Vui lòng kiểm tra lại kết nối!");
        return [];
    }
}

// 2. Hàm GHI dữ liệu lên Google Sheets (Thông qua Google Apps Script)
async function postGoogleSheetData(actionType, sheetName, payload) {
    try {
        const response = await axios.post(CONFIG.GAS_API_URL, {
            action: actionType,
            sheetName: sheetName,
            data: payload
        }, {
            headers: { "Content-Type": "text/plain;charset=utf-8" } // Tránh lỗi CORS preflight của Google Script
        });
        return { success: true, data: response.data };
    } catch (error) {
        console.error("Lỗi khi ghi dữ liệu Google Sheets:", error);
        return { success: false, error: error };
    }
}

// 3. Hàm UPLOAD FILE lên Google Drive (Thông qua Google Apps Script)
async function uploadFileToDrive(fileObject, fileName, mimeType) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(fileObject);
        reader.onload = async function () {
            const base64Data = reader.result.split(',')[1]; // Lấy chuỗi base64 thuần
            try {
                const response = await axios.post(CONFIG.GAS_API_URL, {
                    action: "UPLOAD_FILE",
                    fileName: fileName,
                    mimeType: mimeType,
                    fileBase64: base64Data
                });
                resolve(response.data.url); // Trả về URL file trên Google Drive
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = error => reject(error);
    });
}
