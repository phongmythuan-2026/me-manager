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
      loadingState.style.cssText = 'position:fixed;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;padding:20px;background:#f1f5f9;color:#1e293b;text-align:center;font-family:system-ui,sans-serif;';
      var loginCard = document.createElement('main');
      loginCard.style.cssText = 'width:100%;max-width:480px;padding:32px 24px;border:1px solid #dbe3ec;border-radius:12px;background:#fff;box-shadow:0 12px 32px rgba(15,23,42,.12);';
      var brand = document.createElement('h1');
      brand.textContent = 'ME MANAGER';
      brand.style.cssText = 'margin:0 0 10px;font-size:24px;line-height:1.25;font-weight:700;';
      var status = document.createElement('p');
      status.textContent = 'Đang kết nối đến màn hình đăng nhập...';
      status.style.cssText = 'margin:0;color:#475569;font-size:16px;line-height:1.5;';
      loginCard.append(brand, status);
      loadingState.appendChild(loginCard);

      var fallbackTimer = window.setTimeout(function() {
        status.textContent = 'Không tải được giao diện nhúng. Mở màn hình đăng nhập trực tiếp:';
        var directLink = document.createElement('a');
        directLink.href = API_CONFIG.GAS_API_URL;
        directLink.textContent = 'Mở màn hình đăng nhập';
        directLink.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;min-height:54px;margin-top:20px;padding:12px 18px;border-radius:8px;background:#0d6efd;color:#fff;text-decoration:none;font-size:17px;font-weight:700;';
        loginCard.appendChild(directLink);
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