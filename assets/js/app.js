var currentUser = null;
var appData = { mmtb: [], yeuCau: [], user: [], khuVuc: [], loaiYC: [] };
var fullCalendarObj = null;

if (typeof document !== 'undefined') {
  document.addEventListener("DOMContentLoaded", function() {
    if (window.location.hostname === 'phongmythuan-2026.github.io') {
      var appFrame = document.createElement('iframe');
      appFrame.src = API_CONFIG.GAS_API_URL;
      appFrame.title = 'ME Manager';
      appFrame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;background:#fff;';
      var loadingState = document.createElement('div');
      loadingState.style.cssText = 'position:fixed;inset:0;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;background:#fff;color:#334155;text-align:center;font:16px sans-serif;';
      loadingState.textContent = 'Đang kết nối ME Manager...';

      var fallbackTimer = window.setTimeout(function() {
        loadingState.textContent = 'Không tải được giao diện nhúng. Mở ME Manager trực tiếp:';
        var directLink = document.createElement('a');
        directLink.href = API_CONFIG.GAS_API_URL;
        directLink.target = '_blank';
        directLink.rel = 'noopener';
        directLink.textContent = 'Mở ứng dụng';
        directLink.style.cssText = 'display:inline-block;padding:10px 16px;border-radius:6px;background:#0d6efd;color:#fff;text-decoration:none;font-weight:600;';
        loadingState.appendChild(directLink);
      }, 8000);

      appFrame.addEventListener('load', function() {
        window.clearTimeout(fallbackTimer);
        loadingState.remove();
      }, { once: true });

      document.body.replaceChildren(appFrame, loadingState);
      return;
    }

    var savedUser = localStorage.getItem('mmtb_user');
    if (savedUser) {
      currentUser = JSON.parse(savedUser);
      initApp();
    }
  });
}

function handleLogin(e) {
  e.preventDefault();
  var maNV = document.getElementById('loginMaNV').value;
  var pwd = document.getElementById('loginPassword').value;

  // Gọi trực tiếp hàm backend GAS hiện tại hoặc qua fetch API tùy thuộc vào cách deploy GAS
  Swal.fire({ title: 'Đang đăng nhập...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  
  // (Giả lập hoặc gọi Google Script nếu chạy nhúng, nếu chạy GitHub Pages thuần, 
  // anh chuyển đổi backend Google Apps Script thành dạng nhận JSON doPost() thuần túy)
}

function initApp() {
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('app-layout').style.display = 'block';
  document.getElementById('current-user-name').innerText = currentUser.hoTen || 'Admin';
  document.getElementById('current-user-id').innerText = currentUser.maNV || '00528';
  
  // Tải dữ liệu ban đầu
  loadModuleSharePointData('BAO_CAO_SX');
}

function switchTab(tabName, element) {
  document.querySelectorAll('.sidebar .nav-link').forEach(el => el.classList.remove('active'));
  if (element) element.classList.add('active');

  document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.add('d-none'));
  document.getElementById('tab-' + tabName).classList.remove('d-none');

  if (tabName === 'baocaosx') {
    loadModuleSharePointData('BAO_CAO_SX');
  }
}

// Hàm tải dữ liệu SharePoint theo Module linh hoạt
async function loadModuleSharePointData(tableKey) {
  var tbody = document.getElementById('tblSPBody');
  var thead = document.getElementById('tblSPHead');
  tbody.innerHTML = '<tr><td colspan="10" class="text-center text-primary py-4"><i class="fa-solid fa-spinner fa-spin me-2"></i> Đang tải dữ liệu module SharePoint...</td></tr>';

  try {
    var rows = await fetchSharePointModuleData(tableKey);
    if (!rows || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-3">Không có dữ liệu từ SharePoint.</td></tr>';
      return;
    }

    var keys = Object.keys(rows[0]).filter(k => k !== '@odata.etag' && k !== 'ItemInternalId' && k !== 'ID');
    
    var headHtml = '<tr><th class="text-center" style="width:50px;">#</th>';
    keys.forEach(k => headHtml += `<th>${k}</th>`);
    headHtml += '</tr>';
    thead.innerHTML = headHtml;

    tbody.innerHTML = '';
    rows.forEach((row, idx) => {
      var tr = `<tr><td class="text-center text-muted small">${idx + 1}</td>`;
      keys.forEach(k => {
        tr += `<td>${row[k] !== undefined && row[k] !== null ? row[k] : ''}</td>`;
      });
      tr += '</tr>';
      tbody.innerHTML += tr;
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center text-danger py-3">Lỗi kết nối SharePoint: ${err.message}</td></tr>`;
  }
}

function hideContextMenu() {
  var menu = document.getElementById('custom-context-menu');
  if (menu) menu.style.display = 'none';
}