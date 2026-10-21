
// Hàm chuyển đổi và load nội dung các module động
async function loadModule(moduleName) {
    const contentArea = document.getElementById('main-content');
    const titleArea = document.getElementById('module-title');
    
    // Đổi tiêu đề Header tương ứng
    const titles = {
        'dashboard': 'Tổng quan Dashboard',
        'equipment': 'Quản lý Thiết bị',
        'maintenance': 'Lịch Bảo trì'
    };
    titleArea.innerText = titles[moduleName] || 'Hệ thống Quản lý';

    try {
        // Load file html của module tương ứng trong thư mục modules/
        const response = await fetch(`modules/${moduleName}.html`);
        if (!response.ok) throw new Error("Không tìm thấy file module");
        
        const htmlContent = await response.text();
        contentArea.innerHTML = htmlContent;

        // Nếu module là equipment hoặc maintenance, gọi API lấy dữ liệu SharePoint hiển thị
        if (moduleName === 'equipment' || moduleName === 'maintenance') {
            initModuleData(moduleName);
        }

    } catch (error) {
        contentArea.innerHTML = `
            <div style="background: #fff; padding: 24px; border-radius: 8px; text-align: center;">
                <h3>Đang phát triển module [${moduleName}]</h3>
                <p>Nội dung chi tiết của module này sẽ được cập nhật sớm.</p>
            </div>
        `;
    }
}

// Hàm khởi tạo dữ liệu riêng cho từng module sau khi load giao diện
async function initModuleData(moduleName) {
    const dataTableContainer = document.getElementById(`${moduleName}-data-table`);
    if (!dataTableContainer) return;

    dataTableContainer.innerHTML = "<p>Đang đồng bộ dữ liệu từ SharePoint...</p>";
    
    // Gọi API lấy dữ liệu từ SharePoint thông qua cấu hình trong api.js
    const data = await fetchSharePointData(moduleName);
    
    if (data && data.length > 0) {
        // Render dữ liệu ra bảng (Tùy biến hiển thị theo ý anh)
        let html = '<table border="1" width="100%" style="border-collapse: collapse; text-align: left;">';
        html += '<tr style="background:#fafafa;"><th style="padding:8px;">ID</th><th style="padding:8px;">Tên thiết bị/Hạng mục</th><th style="padding:8px;">Trạng thái</th></tr>';
        data.forEach(item => {
            html += `<tr><td style="padding:8px;">${item.ID || ''}</td><td style="padding:8px;">${item.Title || ''}</td><td style="padding:8px;">${item.Status || ''}</td></tr>`;
        });
        html += '</table>';
        dataTableContainer.innerHTML = html;
    } else {
        dataTableContainer.innerHTML = "<p>Chưa có dữ liệu hoặc đang chờ cấu hình kết nối SharePoint.</p>";
    }
}
