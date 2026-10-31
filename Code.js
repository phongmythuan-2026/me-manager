/**
 * WEB APP QUẢN LÝ BẢO TRÌ MÁY MÓC THIẾT BỊ (ME MANAGER)
 * Backend Engine & Centralized RBAC Permission Control
 */

function doGet(e) {
  var parameters = e && e.parameter ? e.parameter : {};
  if (parameters.bridge === '1') {
    var nonce = String(parameters.nonce || '');
    if (!/^[a-zA-Z0-9_-]{20,80}$/.test(nonce)) {
      return HtmlService.createHtmlOutput('Invalid bridge request.');
    }
    var template = HtmlService.createTemplateFromFile('Backend');
    template.bridgeNonce = nonce;
    return template.evaluate()
      .setTitle('ME Manager backend')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return HtmlService.createHtmlOutput(
    '<!doctype html><html lang="vi"><meta charset="utf-8"><title>ME Manager</title>' +
    '<body>Giao diện ME Manager được phục vụ tại ' +
    '<a href="https://phongmythuan-2026.github.io/me-manager/">GitHub Pages</a>.</body></html>'
  ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getDb() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function normalizeSheetName(value) {
  return String(value == null ? '' : value).trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function findDatabaseSheet(sheetName) {
  var targetName = normalizeSheetName(sheetName);
  var matches = getDb().getSheets().filter(function(sheet) {
    return normalizeSheetName(sheet.getName()) === targetName;
  });
  matches.sort(function(a, b) { return b.getLastRow() - a.getLastRow(); });
  return matches[0] || null;
}

function normalizeEmployeeCode(value) {
  return String(value == null ? '' : value).trim().replace(/^0+(?=\d)/, '');
}

function getCanonicalEmployeeCode(value) {
  var code = String(value == null ? '' : value).trim();
  var sheet = getDb().getSheetByName('USER');
  if (!sheet || sheet.getLastRow() < 2) return code;
  var rows = sheet.getDataRange().getDisplayValues();
  var codeIndex = rows[0].indexOf('Mã NV');
  if (codeIndex === -1) return code;
  for (var i = 1; i < rows.length; i++) {
    if (normalizeEmployeeCode(rows[i][codeIndex]) === normalizeEmployeeCode(code)) return String(rows[i][codeIndex]).trim();
  }
  return code;
}

function setEmployeeCodeCell(sheet, rowIndex, columnIndex, value) {
  if (rowIndex < 1 || columnIndex < 1) return;
  var cell = sheet.getRange(rowIndex, columnIndex);
  cell.setNumberFormat('@');
  cell.setValue(String(value == null ? '' : value).trim());
}

function sheetToObjects(sheetName) {
  var sheet = findDatabaseSheet(sheetName);
  if (!sheet) return [];
  var range = sheet.getDataRange();
  var data = range.getValues();
  var displayData = range.getDisplayValues();
  if (data.length < 2) return [];
  
  var headers = data[0];
  var result = [];
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var header = String(headers[j] == null ? '' : headers[j]).trim();
      var val = row[j];
      if (['Mã NV', 'Người yêu cầu', 'Người thực hiện', 'Người tiếp nhận', 'Người tạo'].indexOf(header) !== -1) {
        val = displayData[i][j];
      } else if (val instanceof Date) {
        val = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
      }
      obj[header] = (val === null || val === undefined) ? "" : val;
      if (header === 'ID YC' || header === 'ID TH' || header === 'ID KHO') obj.ID = obj[header];
    }
    result.push(obj);
  }
  return result;
}

// ----------------------------------------------------
// HÀM PHÂN QUYỀN TẬP TRUNG (PERMISSIONS ENGINE)
// ----------------------------------------------------
function checkPermission(user, action, targetObject) {
  if (!user || !user.maNV) return false;

  var role = String(user.vaiTro || '').trim().toLowerCase();
  var isAdmin = (role === 'admin');
  var isKyThuat = (role === 'kỹ thuật' || role === 'ky thuat' || isAdmin);
  var status = String(targetObject && (targetObject['Trạng thái'] || targetObject.trangThai) || '').trim();
  if (status === 'Chờ thực hiện') status = 'Đã tiếp nhận';
  if (status === 'Đã hoàn thành') status = 'Hoàn thành';
  var owner = targetObject && (targetObject['Người yêu cầu'] || targetObject.nguoiYeuCau) || '';

  switch (action) {
    case 'YEU_CAU_ADD':
    case 'YEU_CAU_COPY':
      return true;

    case 'YEU_CAU_EDIT':
      return !!targetObject && (isAdmin || (status === 'Chờ tiếp nhận' && normalizeEmployeeCode(owner) === normalizeEmployeeCode(user.maNV)));

    case 'YEU_CAU_DELETE':
    case 'YEU_CAU_HUY':
      if (!targetObject) return false;
      return !!targetObject && status === 'Chờ tiếp nhận' && (isAdmin || normalizeEmployeeCode(owner) === normalizeEmployeeCode(user.maNV));

    case 'YEU_CAU_TIEP_NHAN':
      return isKyThuat && status === 'Chờ tiếp nhận';

    case 'YEU_CAU_MARK_DONE':
      return isKyThuat && (status === 'Đã thực hiện' || status === 'Đang thực hiện');

    case 'YEU_CAU_CONFIRM':
      return !!targetObject && status === 'Chờ xác nhận' && (isAdmin || normalizeEmployeeCode(owner) === normalizeEmployeeCode(user.maNV));

    case 'REPAIR_LOG_MANAGE':
    case 'KHO_MANAGE':
      return isKyThuat;

    case 'MMTB_MANAGE':
    case 'USER_MANAGE':
    case 'KHU_VUC_MANAGE':
    case 'LOAI_YC_MANAGE':
    case 'FORM_LAYOUT_MANAGE':
      return isAdmin;

    case 'FORM_LAYOUT_VIEW':
      return true;

    default:
      return false;
  }
}

// ----------------------------------------------------
// AUTHENTICATION & APP DATA
// ----------------------------------------------------
function loginUser(maNV, password) {
  try {
    var users = sheetToObjects('USER');
    var normalizedMaNV = String(maNV).trim().replace(/^0+(?=\d)/, '');
    var found = users.find(function(u) {
      return String(u['Mã NV']).trim().replace(/^0+(?=\d)/, '') === normalizedMaNV && 
             String(u['Mật khẩu']).trim() === String(password).trim();
    });
    
    if (found) {
      var sessionToken = Utilities.getUuid().replace(/-/g, '');
      CacheService.getScriptCache().put(
        'FORM_LAYOUT_SESSION_' + sessionToken,
        normalizeEmployeeCode(found['Mã NV']),
        21600
      );
      return {
        success: true,
        user: { 
          maNV: getCanonicalEmployeeCode(found['Mã NV']),
          hoTen: found['Họ tên'], 
          vaiTro: found['Vai trò'] || 'Sản xuất',
          formLayoutSessionToken: sessionToken
        }
      };
    }
    return { success: false, message: 'Mã nhân viên hoặc mật khẩu không chính xác!' };
  } catch (e) {
    return { success: false, message: 'Lỗi đăng nhập: ' + e.toString() };
  }
}

function changePassword(maNV, oldPassword, newPassword) {
  try {
    var sheet = getDb().getSheetByName('USER');
    if (!sheet) return { success: false, message: 'Không tìm thấy trang USER!' };
    
    var rows = sheet.getDataRange().getValues();
    var headers = rows[0];
    var maNVColIdx = headers.indexOf('Mã NV');
    var pwdColIdx = headers.indexOf('Mật khẩu');

    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][maNVColIdx]).trim() === String(maNV).trim()) {
        if (String(rows[i][pwdColIdx]).trim() !== String(oldPassword).trim()) {
          return { success: false, message: 'Mật khẩu hiện tại không chính xác!' };
        }
        sheet.getRange(i + 1, pwdColIdx + 1).setValue(newPassword);
        return { success: true, message: 'Đổi mật khẩu thành công!' };
      }
    }
    return { success: false, message: 'Không tìm thấy người dùng!' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function getAppData() {
  var yeuCau = sheetToObjects('YEU_CAU');
  var yeuCauTH = sheetToObjects('YEU_CAU_TH');
  var dmvt = sheetToObjects('DMVT');
  var kho = sheetToObjects('KHO');
  var thayThe = sheetToObjects('THAY_THE');
  var yeuCauVT = sheetToObjects('YEU_CAU_VT');
  [dmvt, kho, thayThe, yeuCauVT].forEach(function(rows) {
    rows.forEach(function(row) {
      var codeKey = Object.keys(row).find(function(key) {
        return ['mã vật tư', 'mã vt', 'mã hàng', 'mã'].indexOf(String(key).trim().toLowerCase()) !== -1;
      });
      if (codeKey) row[codeKey] = getMaterialCodeValue(row[codeKey]);
    });
  });
  yeuCau.forEach(function(request) {
    var legacyStatus = String(request['Trạng thái'] || '').trim();
    if (legacyStatus === 'Đã hoàn thành') {
      request['Trạng thái'] = 'Hoàn thành';
    } else if (legacyStatus === 'Chờ thực hiện' || legacyStatus === 'Đang thực hiện') {
      var linkedLogs = yeuCauTH.filter(function(log) { return String(log['Mã yêu cầu']).trim() === String(request.ID).trim(); });
      request['Trạng thái'] = !linkedLogs.length ? 'Đã tiếp nhận'
        : linkedLogs.every(function(log) { return String(log['Trạng thái']).trim() === 'Đã thực hiện'; }) ? 'Đã thực hiện' : 'Đang thực hiện';
    }
  });
  return {
    mmtb: sheetToObjects('MMTB'),
    yeuCau: yeuCau,
    yeuCauTH: yeuCauTH,
    dmvt: dmvt,
    thayThe: thayThe,
    yeuCauVT: yeuCauVT,
    kho: kho,
    user: sheetToObjects('USER'),
    khuVuc: sheetToObjects('KHU_VUC'),
    loaiYC: sheetToObjects('LOAI_YC'),
    pushSubs: sheetToObjects('PUSH_SUBS')
  };
}

function getDataRevision() {
  var sheetRevision = DriveApp.getFileById(getDb().getId()).getLastUpdated().getTime();
  var layoutRevision = PropertiesService.getScriptProperties().getProperty('FORM_LAYOUT_REVISION') || '0';
  return String(sheetRevision) + '-' + layoutRevision;
}

function getAppDataSnapshot() {
  var revision = getDataRevision();
  return { revision: revision, data: getAppData() };
}

function getStoredUserForLayoutConfig(currentUser) {
  if (!currentUser || !currentUser.maNV) return null;
  var userCode = normalizeEmployeeCode(currentUser.maNV);
  return sheetToObjects('USER').find(function(user) {
    return normalizeEmployeeCode(user['Mã NV']) === userCode;
  }) || null;
}

function getAuthenticatedUserForLayoutConfig(currentUser) {
  var storedUser = getStoredUserForLayoutConfig(currentUser);
  var token = currentUser && String(currentUser.formLayoutSessionToken || '');
  if (!storedUser || !/^[a-f0-9]{32}$/i.test(token)) return null;
  var tokenUserCode = CacheService.getScriptCache().get('FORM_LAYOUT_SESSION_' + token);
  if (!tokenUserCode || normalizeEmployeeCode(tokenUserCode) !== normalizeEmployeeCode(currentUser.maNV)) return null;
  return storedUser;
}

function getFormLayoutConfig(currentUser) {
  try {
    if (!getStoredUserForLayoutConfig(currentUser)) {
      return { success: false, message: 'Vui lòng đăng nhập để tải cấu hình giao diện.' };
    }
    var properties = PropertiesService.getScriptProperties().getProperties();
    var config = { sharedTypes: {}, forms: {} };
    if (properties.FORM_LAYOUT_SHARED_TYPES) {
      config.sharedTypes = JSON.parse(properties.FORM_LAYOUT_SHARED_TYPES);
    }
    Object.keys(properties).forEach(function(key) {
      if (key.indexOf('FORM_LAYOUT_FORM_') === 0) {
        config.forms[key.substring('FORM_LAYOUT_FORM_'.length)] = JSON.parse(properties[key]);
      }
    });
    return { success: true, config: config };
  } catch (error) {
    return { success: false, message: 'Không thể đọc cấu hình giao diện: ' + error.message };
  }
}

function saveFormLayoutConfig(config, currentUser) {
  try {
    var storedUser = getAuthenticatedUserForLayoutConfig(currentUser);
    if (!storedUser) {
      return { success: false, message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.' };
    }
    if (String(storedUser['Vai trò'] || '').trim().toLowerCase() !== 'admin') {
      return { success: false, message: 'Chỉ Admin mới được lưu cấu hình giao diện.' };
    }
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return { success: false, message: 'Cấu hình giao diện không hợp lệ.' };
    }

    var allowedTypes = ['text', 'date', 'datetime', 'number', 'textarea', 'select', 'file', 'full', 'work-type', 'request-type', 'area', 'machine', 'reference', 'material', 'unit', 'frequency', 'quantity', 'unit-price', 'amount', 'action'];
    var allowedInputs = ['auto', 'text', 'date', 'datetime-local', 'number', 'textarea'];
    var normalized = { sharedTypes: {}, forms: {} };
    var sharedTypes = config.sharedTypes || {};
    if (typeof sharedTypes !== 'object' || Array.isArray(sharedTypes)) {
      return { success: false, message: 'Danh sách kiểu dữ liệu dùng chung không hợp lệ.' };
    }
    Object.keys(sharedTypes).forEach(function(type) {
      var preset = sharedTypes[type];
      if (allowedTypes.indexOf(type) === -1 || !preset || typeof preset !== 'object') {
        throw new Error('Kiểu dữ liệu dùng chung không hợp lệ.');
      }
      var width = Number(preset.width);
      var inputType = String(preset.inputType || 'auto');
      if (!Number.isInteger(width) || width < 1 || width > 100 || allowedInputs.indexOf(inputType) === -1) {
        throw new Error('Độ rộng hoặc loại input của kiểu ' + type + ' không hợp lệ.');
      }
      normalized.sharedTypes[type] = { width: width, inputType: inputType };
    });

    var forms = config.forms || {};
    if (typeof forms !== 'object' || Array.isArray(forms)) {
      return { success: false, message: 'Danh sách modal cấu hình không hợp lệ.' };
    }
    if (Object.keys(forms).length > 20) {
      return { success: false, message: 'Chỉ được cấu hình tối đa 20 modal.' };
    }
    Object.keys(forms).forEach(function(formId) {
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,59}$/.test(formId)) {
        throw new Error('Mã modal không hợp lệ.');
      }
      var form = forms[formId];
      if (!form || typeof form !== 'object' || Array.isArray(form)) {
        throw new Error('Cấu hình modal ' + formId + ' không hợp lệ.');
      }
      var columns = form.columns === null || form.columns === '' || form.columns === undefined ? null : Number(form.columns);
      if (columns !== null && (!Number.isInteger(columns) || columns < 1 || columns > 24)) {
        throw new Error('Số cột của modal phải từ 1 đến 24.');
      }
      var normalizedForm = { columns: columns, fields: {} };
      var fields = form.fields || {};
      if (typeof fields !== 'object' || Array.isArray(fields)) {
        throw new Error('Danh sách trường của modal ' + formId + ' không hợp lệ.');
      }
      var maxGridColumns = columns || (formId === 'mmtbForm' ? 200 : 100);
      if (Object.keys(fields).length > 100) {
        throw new Error('Modal ' + formId + ' có quá nhiều trường cấu hình.');
      }
      Object.keys(fields).forEach(function(fieldId) {
        if (!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(fieldId)) {
          throw new Error('Mã trường không hợp lệ trong modal ' + formId + '.');
        }
        var field = fields[fieldId];
        if (!field || typeof field !== 'object' || Array.isArray(field)) {
          throw new Error('Cấu hình trường ' + fieldId + ' không hợp lệ.');
        }
        var type = String(field.type || 'text');
        var width = field.width === null || field.width === '' || field.width === undefined ? null : Number(field.width);
        var row = field.row === null || field.row === '' || field.row === undefined ? null : Number(field.row);
        var column = field.column === null || field.column === '' || field.column === undefined ? null : Number(field.column);
        var span = field.span === null || field.span === '' || field.span === undefined ? null : Number(field.span);
        var order = field.order === null || field.order === '' || field.order === undefined ? null : Number(field.order);
        var required = field.required === null || field.required === undefined || field.required === '' ? null : field.required;
        var inputType = field.inputType === null || field.inputType === undefined || field.inputType === '' ? null : String(field.inputType);
        var label = field.label === null || field.label === undefined ? '' : String(field.label).trim();
        if (allowedTypes.indexOf(type) === -1 ||
            (width !== null && (!Number.isInteger(width) || width < 1 || width > 100)) ||
            (row !== null && (!Number.isInteger(row) || row < 1 || row > 100)) ||
            (column !== null && (!Number.isInteger(column) || column < 1 || column > maxGridColumns)) ||
            (span !== null && (!Number.isInteger(span) || span < 1 || span > maxGridColumns)) ||
            (order !== null && (!Number.isInteger(order) || order < 0 || order > 100)) ||
            (column !== null && span !== null && column + span - 1 > maxGridColumns) ||
            (required !== null && typeof required !== 'boolean') ||
            (inputType !== null && allowedInputs.indexOf(inputType) === -1) ||
            label.length > 80) {
          throw new Error('Giá trị cấu hình không hợp lệ cho trường ' + fieldId + '.');
        }
        normalizedForm.fields[fieldId] = {
          type: type,
          useShared: field.useShared === true,
          width: width,
          row: row,
          column: column,
          span: span,
          order: order,
          label: label,
          required: required,
          inputType: inputType
        };
      });
      normalized.forms[formId] = normalizedForm;
    });

    var properties = PropertiesService.getScriptProperties();
    var updates = {
      FORM_LAYOUT_SHARED_TYPES: JSON.stringify(normalized.sharedTypes),
      FORM_LAYOUT_REVISION: String(new Date().getTime())
    };
    Object.keys(normalized.forms).forEach(function(formId) {
      updates['FORM_LAYOUT_FORM_' + formId] = JSON.stringify(normalized.forms[formId]);
    });
    var serializedValues = Object.keys(updates).map(function(key) { return updates[key]; });
    if (serializedValues.some(function(value) { return Utilities.newBlob(value).getBytes().length > 8000; })) {
      return { success: false, message: 'Cấu hình quá lớn để lưu. Hãy rút gọn nội dung nhãn.' };
    }
    var existingKeys = Object.keys(properties.getProperties()).filter(function(key) {
      return key.indexOf('FORM_LAYOUT_FORM_') === 0 && !Object.prototype.hasOwnProperty.call(updates, key);
    });
    properties.setProperties(updates, false);
    existingKeys.forEach(function(key) { properties.deleteProperty(key); });
    return { success: true, message: 'Đã lưu cấu hình giao diện dùng chung.' };
  } catch (error) {
    return { success: false, message: 'Không thể lưu cấu hình giao diện: ' + error.message };
  }
}

function saveMachineReplacementItem(data, currentUser) {
  if (!checkPermission(currentUser, 'MMTB_MANAGE')) return { success: false, message: 'Chỉ Admin mới có quyền quản lý vật tư thay thế.' };
  try {
    var sheet = getOrCreateInventorySheet('THAY_THE', ['ID TT', 'Mã máy', 'Tên máy', 'Mã vật tư', 'Phụ tùng / việc bảo trì', 'Đơn vị', 'Tần suất', 'Người tạo', 'Ngày tạo']);
    var values = sheet.getDataRange().getValues();
    var headers = values[0];
    var idIndex = inventoryColumnIndex(headers, ['ID TT', 'ID']);
    var machineCodeIndex = inventoryColumnIndex(headers, ['Mã máy']);
    var machineNameIndex = inventoryColumnIndex(headers, ['Tên máy']);
    var materialCodeIndex = inventoryColumnIndex(headers, ['Mã vật tư']);
    var maintenanceIndex = inventoryColumnIndex(headers, ['Phụ tùng / việc bảo trì', 'Phụ tùng/việc bảo trì']);
    var unitIndex = inventoryColumnIndex(headers, ['Đơn vị', 'ĐVT']);
    var frequencyIndex = inventoryColumnIndex(headers, ['Tần suất']);
    var creatorIndex = inventoryColumnIndex(headers, ['Người tạo']);
    var createdDateIndex = inventoryColumnIndex(headers, ['Ngày tạo']);
    if ([idIndex, machineCodeIndex, materialCodeIndex, maintenanceIndex].some(function(index) { return index === -1; })) {
      return { success: false, message: 'Sheet THAY_THE cần các cột ID TT, Mã máy, Mã vật tư và Phụ tùng / việc bảo trì.' };
    }

    var machineCode = String(data.maMay || '').trim();
    var materialCode = normalizeMaterialCode(data.maVatTu);
    var machine = sheetToObjects('MMTB').find(function(item) { return String(item['Mã'] || '').trim() === machineCode; });
    var material = sheetToObjects('DMVT').find(function(item) {
      return normalizeMaterialCode(item['Mã vật tư'] || item['Mã VT'] || item['Mã hàng'] || item['Mã']) === materialCode;
    });
    if (!machineCode || !materialCode) return { success: false, message: 'Vui lòng chọn máy và vật tư.' };
    if (!machine) return { success: false, message: 'Mã máy không tồn tại trong danh mục MMTB.' };
    if (!material) return { success: false, message: 'Mã vật tư không tồn tại trong danh mục DMVT.' };
    var maintenance = String(material['Tên vật tư'] || material['Tên hàng'] || material['Tên'] || '').trim();
    if (!maintenance) return { success: false, message: 'Vật tư đã chọn chưa có tên trong danh mục DMVT.' };

    var id = String(data.id || '').trim();
    var targetRow = -1;
    if (id) {
      for (var i = 1; i < values.length; i++) {
        if (String(values[i][idIndex]).trim() === id) { targetRow = i + 1; break; }
      }
      if (targetRow === -1) return { success: false, message: 'Không tìm thấy khai báo vật tư thay thế #' + id + '.' };
    }
    var row = targetRow > 0 ? values[targetRow - 1].slice() : Array(headers.length).fill('');
    row[idIndex] = targetRow > 0 ? row[idIndex] : getNextInventoryId(values, idIndex);
    row[machineCodeIndex] = machineCode;
    if (machineNameIndex !== -1) row[machineNameIndex] = machine['Tên'] || '';
    row[materialCodeIndex] = getMaterialCodeValue(materialCode);
    row[maintenanceIndex] = maintenance;
    if (unitIndex !== -1) row[unitIndex] = 'Giờ';
    if (frequencyIndex !== -1) row[frequencyIndex] = String(data.tanSuat || '').trim();
    var savedRow = targetRow > 0 ? targetRow : sheet.getLastRow() + 1;
    if (targetRow === -1) {
      if (creatorIndex !== -1) row[creatorIndex] = getCanonicalEmployeeCode(currentUser.maNV);
      if (createdDateIndex !== -1) row[createdDateIndex] = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
      sheet.appendRow(row);
    } else sheet.getRange(targetRow, 1, 1, headers.length).setValues([row]);
    if (typeof getMaterialCodeValue(row[materialCodeIndex]) === 'number') sheet.getRange(savedRow, materialCodeIndex + 1).setNumberFormat('0');
    if (targetRow === -1) return { success: true, message: 'Đã thêm khai báo vật tư thay thế #' + row[idIndex] + '.' };
    return { success: true, message: 'Đã cập nhật khai báo vật tư thay thế #' + id + '.' };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

function deleteMachineReplacementItem(id, currentUser) {
  if (!checkPermission(currentUser, 'MMTB_MANAGE')) return { success: false, message: 'Chỉ Admin mới có quyền quản lý vật tư thay thế.' };
  try {
    var sheet = findDatabaseSheet('THAY_THE');
    if (!sheet || sheet.getLastRow() < 2) return { success: false, message: 'Chưa có khai báo vật tư thay thế.' };
    var values = sheet.getDataRange().getValues();
    var idIndex = inventoryColumnIndex(values[0], ['ID TT', 'ID']);
    if (idIndex === -1) return { success: false, message: 'Không tìm thấy cột ID TT trong THAY_THE.' };
    for (var i = values.length - 1; i >= 1; i--) {
      if (String(values[i][idIndex]).trim() === String(id).trim()) {
        sheet.deleteRow(i + 1);
        return { success: true, message: 'Đã xóa khai báo vật tư thay thế #' + id + '.' };
      }
    }
    return { success: false, message: 'Không tìm thấy khai báo vật tư thay thế #' + id + '.' };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

function inventoryColumnIndex(headers, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var target = String(candidates[i]).trim().toLowerCase();
    var index = headers.findIndex(function(header) { return String(header == null ? '' : header).trim().toLowerCase() === target; });
    if (index !== -1) return index;
  }
  return -1;
}

function normalizeMaterialCode(value) {
  var text = String(value == null ? '' : value).trim();
  if (!text) return '';
  var number = Number(text);
  return isFinite(number) && Math.floor(number) === number ? String(number) : text;
}

function getMaterialCodeValue(value) {
  var normalized = normalizeMaterialCode(value);
  return normalized && isFinite(Number(normalized)) && Math.floor(Number(normalized)) === Number(normalized)
    ? Number(normalized)
    : normalized;
}

function getOrCreateInventorySheet(sheetName, defaultHeaders) {
  var spreadsheet = getDb();
  var sheet = findDatabaseSheet(sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(sheetName);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, defaultHeaders.length).setValues([defaultHeaders]);
  } else {
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn() || defaultHeaders.length).getValues()[0];
    var missingHeaders = defaultHeaders.filter(function(header) {
      return inventoryColumnIndex(headers, [header]) === -1;
    });
    if (missingHeaders.length) sheet.getRange(1, sheet.getLastColumn() + 1, 1, missingHeaders.length).setValues([missingHeaders]);
    if (['DMVT', 'KHO', 'THAY_THE', 'YEU_CAU_VT'].indexOf(sheetName) !== -1 && sheet.getLastRow() > 1) {
      var materialHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var materialCodeColumnIndex = inventoryColumnIndex(materialHeaders, ['Mã vật tư']);
      if (materialCodeColumnIndex !== -1) {
        var storedCodes = sheet.getRange(2, materialCodeColumnIndex + 1, sheet.getLastRow() - 1, 1).getValues();
        var numericCodes = storedCodes.map(function(row) {
          var normalizedCode = getMaterialCodeValue(row[0]);
          return [typeof row[0] === 'string' && typeof normalizedCode === 'number' ? normalizedCode : row[0]];
        });
        if (storedCodes.some(function(row, index) { return row[0] !== numericCodes[index][0]; })) {
          sheet.getRange(2, materialCodeColumnIndex + 1, numericCodes.length, 1).setValues(numericCodes);
        }
        sheet.getRange(2, materialCodeColumnIndex + 1, storedCodes.length, 1).setNumberFormat('0');
      }
    }
    if (sheetName === 'KHO') {
      var noteHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var noteIndexes = [];
      noteHeaders.forEach(function(header, index) {
        if (String(header == null ? '' : header).trim().toLowerCase() === 'ghi chú') noteIndexes.push(index);
      });
      while (noteIndexes.length > 1) {
        var primaryNoteIndex = noteIndexes[0];
        var duplicateNoteIndex = noteIndexes[noteIndexes.length - 1];
        if (sheet.getLastRow() > 1) {
          var noteValues = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
          var primaryNotes = [];
          noteValues.forEach(function(row) {
            var primaryNote = String(row[primaryNoteIndex] == null ? '' : row[primaryNoteIndex]).trim();
            var duplicateNote = String(row[duplicateNoteIndex] == null ? '' : row[duplicateNoteIndex]).trim();
            if (duplicateNote) {
              if (!primaryNote) primaryNote = duplicateNote;
              else if (primaryNote !== duplicateNote) primaryNote += '\n' + duplicateNote;
            }
            primaryNotes.push([primaryNote]);
          });
          sheet.getRange(2, primaryNoteIndex + 1, primaryNotes.length, 1).setValues(primaryNotes);
        }
        sheet.deleteColumn(duplicateNoteIndex + 1);
        noteHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        noteIndexes = [];
        noteHeaders.forEach(function(header, index) {
          if (String(header == null ? '' : header).trim().toLowerCase() === 'ghi chú') noteIndexes.push(index);
        });
      }
      var currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var legacyMachineIndex = inventoryColumnIndex(currentHeaders, ['Máy móc/thiết bị']);
      var machineCodeIndex = inventoryColumnIndex(currentHeaders, ['Mã máy móc/thiết bị']);
      if (legacyMachineIndex !== -1 && machineCodeIndex !== -1 && legacyMachineIndex !== machineCodeIndex) {
        if (sheet.getLastRow() > 1) {
          var legacyMachineValues = sheet.getRange(2, legacyMachineIndex + 1, sheet.getLastRow() - 1, 1).getValues();
          var machineCodeValues = sheet.getRange(2, machineCodeIndex + 1, sheet.getLastRow() - 1, 1).getValues();
          var mergedMachineValues = machineCodeValues.map(function(row, index) {
            var machineCode = String(row[0] == null ? '' : row[0]).trim();
            return [machineCode ? row[0] : legacyMachineValues[index][0]];
          });
          sheet.getRange(2, machineCodeIndex + 1, mergedMachineValues.length, 1).setValues(mergedMachineValues);
        }
        sheet.deleteColumn(legacyMachineIndex + 1);
        currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      }
      var valueIndex = inventoryColumnIndex(currentHeaders, ['Giá trị xuất/nhập kho']);
      var quantityIndex = inventoryColumnIndex(currentHeaders, ['Số lượng']);
      var priceIndex = inventoryColumnIndex(currentHeaders, ['Đơn giá']);
      if (valueIndex !== -1 && quantityIndex !== -1 && priceIndex !== -1 && sheet.getLastRow() > 1) {
        var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
        values.forEach(function(row) {
          if (String(row[valueIndex] || '').trim() === '') row[valueIndex] = Number(row[quantityIndex] || 0) * Number(row[priceIndex] || 0);
        });
        sheet.getRange(2, 1, values.length, values[0].length).setValues(values);
      }
    }
  }
  return sheet;
}

function normalizeInventoryId(value) {
  var text = String(value == null ? '' : value).trim();
  if (!text) return '';
  var number = Number(text);
  return isFinite(number) ? String(parseInt(number, 10)) : text;
}

function getNextInventoryId(rows, idColumnIndex) {
  var maxId = 0;
  for (var i = 1; i < rows.length; i++) {
    var id = Number(rows[i][idColumnIndex]);
    if (isFinite(id)) maxId = Math.max(maxId, id);
  }
  return maxId + 1;
}

function saveMaterialCatalogItem(data, currentUser) {
  if (!checkPermission(currentUser, 'KHO_MANAGE')) return { success: false, message: 'Bạn không có quyền quản lý vật tư.' };
  var lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    var sheet = getOrCreateInventorySheet('DMVT', ['Mã vật tư', 'Tên vật tư', 'Đvt', 'Người tạo', 'Ngày tạo']);
    var values = sheet.getDataRange().getValues();
    var headers = values[0];
    var codeIndex = inventoryColumnIndex(headers, ['Mã vật tư', 'Mã VT', 'Mã hàng', 'Mã']);
    var nameIndex = inventoryColumnIndex(headers, ['Tên vật tư', 'Tên hàng', 'Tên']);
    var unitIndex = inventoryColumnIndex(headers, ['Đvt', 'ĐVT', 'Đơn vị tính', 'ĐVT chính', 'Đơn vị']);
    var creatorIndex = inventoryColumnIndex(headers, ['Người tạo']);
    var createdDateIndex = inventoryColumnIndex(headers, ['Ngày tạo']);
    if (codeIndex === -1 || nameIndex === -1) return { success: false, message: 'Sheet DMVT cần có cột Mã vật tư và Tên vật tư.' };

    var code = normalizeMaterialCode(data.ma);
    if (!String(data.ten || '').trim()) return { success: false, message: 'Vui lòng nhập tên vật tư.' };
    var targetRow = -1;
    if (code) {
      for (var rowIndex = 1; rowIndex < values.length; rowIndex++) {
        if (normalizeMaterialCode(values[rowIndex][codeIndex]) === code) { targetRow = rowIndex + 1; break; }
      }
      if (targetRow === -1) return { success: false, message: 'Không tìm thấy mã vật tư cần cập nhật.' };
    }
    var row = targetRow > 0 ? values[targetRow - 1].slice() : Array(headers.length).fill('');
    while (row.length < headers.length) row.push('');
    if (targetRow === -1) code = String(getNextInventoryId(values, codeIndex));
    row[codeIndex] = getMaterialCodeValue(code);
    row[nameIndex] = String(data.ten).trim();
    if (unitIndex !== -1) row[unitIndex] = data.dvt || '';
    if (targetRow === -1) {
      if (creatorIndex !== -1) row[creatorIndex] = getCanonicalEmployeeCode(currentUser.maNV);
      if (createdDateIndex !== -1) row[createdDateIndex] = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    }
    var savedRow = targetRow > 0 ? targetRow : sheet.getLastRow() + 1;
    if (targetRow > 0) sheet.getRange(savedRow, 1, 1, headers.length).setValues([row]);
    else sheet.appendRow(row);
    var savedCode = getMaterialCodeValue(row[codeIndex]);
    var codeCell = sheet.getRange(savedRow, codeIndex + 1);
    if (typeof savedCode === 'number') codeCell.setNumberFormat('0');
    codeCell.setValue(savedCode);
    if (creatorIndex !== -1 && targetRow === -1) setEmployeeCodeCell(sheet, savedRow, creatorIndex + 1, row[creatorIndex]);
    return { success: true, message: targetRow > 0 ? 'Đã cập nhật vật tư.' : 'Đã thêm vật tư #' + code + '.', ma: savedCode };
  } catch (error) {
    return { success: false, message: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

function deleteMaterialCatalogItem(materialCode, currentUser) {
  if (!checkPermission(currentUser, 'KHO_MANAGE')) return { success: false, message: 'Bạn không có quyền quản lý vật tư.' };
  try {
    var code = normalizeMaterialCode(materialCode);
    var usageRows = sheetToObjects('YEU_CAU_VT');
    var stockRows = sheetToObjects('KHO');
    var hasUsage = usageRows.some(function(row) { return normalizeMaterialCode(row['Mã vật tư']) === code; });
    var hasStock = stockRows.some(function(row) { return normalizeMaterialCode(row['Mã vật tư']) === code; });
    if (hasUsage || hasStock) return { success: false, message: 'Vật tư đã có phát sinh trong yêu cầu hoặc sổ kho nên không thể xóa.' };

    var sheet = getDb().getSheetByName('DMVT');
    if (!sheet) return { success: false, message: 'Không tìm thấy sheet DMVT.' };
    var values = sheet.getDataRange().getValues();
    var codeIndex = inventoryColumnIndex(values[0], ['Mã vật tư', 'Mã VT', 'Mã hàng', 'Mã']);
    if (codeIndex === -1) return { success: false, message: 'Không tìm thấy cột mã vật tư trong DMVT.' };
    for (var i = values.length - 1; i >= 1; i--) {
      if (normalizeMaterialCode(values[i][codeIndex]) === code) {
        sheet.deleteRow(i + 1);
        return { success: true, message: 'Đã xóa vật tư ' + code + '.' };
      }
    }
    return { success: false, message: 'Không tìm thấy vật tư ' + code + '.' };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

function saveStockReceipt(data, currentUser) {
  if (!checkPermission(currentUser, 'KHO_MANAGE')) return { success: false, message: 'Bạn không có quyền quản lý sổ kho.' };
  var lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    var sheet = getOrCreateInventorySheet('KHO', ['ID KHO', 'Ngày nhập xuất', 'Mã vật tư', 'Số lượng', 'Đơn giá', 'Ghi chú', 'Người thực hiện', 'Ngày thực hiện', 'Mã yêu cầu', 'Mã máy móc/thiết bị', 'Giá trị xuất/nhập kho']);
    var rows = sheet.getDataRange().getValues();
    var headers = rows[0];
    var codeIndex = inventoryColumnIndex(headers, ['Mã vật tư']);
    var quantityIndex = inventoryColumnIndex(headers, ['Số lượng']);
    var dateIndex = inventoryColumnIndex(headers, ['Ngày nhập xuất']);
    var idIndex = inventoryColumnIndex(headers, ['ID KHO', 'ID']);
    var requestIndex = inventoryColumnIndex(headers, ['Mã yêu cầu']);
    var noteIndex = inventoryColumnIndex(headers, ['Ghi chú']);
    var priceIndex = inventoryColumnIndex(headers, ['Đơn giá']);
    var valueIndex = inventoryColumnIndex(headers, ['Giá trị xuất/nhập kho']);
    var performerIndex = inventoryColumnIndex(headers, ['Người thực hiện']);
    var performedDateIndex = inventoryColumnIndex(headers, ['Ngày thực hiện']);
    var machineIndex = inventoryColumnIndex(headers, ['Mã máy móc/thiết bị', 'Máy móc/thiết bị']);
    if ([codeIndex, quantityIndex, dateIndex, idIndex, requestIndex].some(function(index) { return index === -1; })) {
      return { success: false, message: 'Sheet KHO thiếu một hoặc nhiều cột theo thiết kế mới.' };
    }
    var existingRowIndex = -1;
    var stockId = normalizeInventoryId(data.id);
    if (stockId) {
      for (var existingIndex = 1; existingIndex < rows.length; existingIndex++) {
        if (normalizeInventoryId(rows[existingIndex][idIndex]) === stockId) {
          existingRowIndex = existingIndex;
          break;
        }
      }
      if (existingRowIndex === -1) return { success: false, message: 'Không tìm thấy giao dịch kho #' + stockId + '.' };
      var existingNote = noteIndex === -1 ? '' : String(rows[existingRowIndex][noteIndex] || '');
      if (existingNote.indexOf('Xuất sử dụng cho nhật ký ') === 0) {
        return { success: false, message: 'Vật tư đã tự động ghi từ nhật ký sửa chữa; hãy sửa nhật ký để cập nhật dòng kho này.' };
      }
    }
    var quantity = Number(data.soLuong);
    if (!data.maVatTu || !isFinite(quantity) || quantity === 0) return { success: false, message: 'Vui lòng chọn vật tư và nhập số lượng khác 0 (nhập kho số dương, xuất kho số âm).' };
    var priceInput = String(data.donGia == null ? '' : data.donGia).trim();
    var price = priceInput === '' ? 0 : Number(priceInput);
    if (!isFinite(price) || price < 0) return { success: false, message: 'Đơn giá phải là số không âm.' };
    var materialExists = sheetToObjects('DMVT').some(function(item) {
      return normalizeMaterialCode(item['Mã vật tư'] || item['Mã VT'] || item['Mã hàng'] || item['Mã']) === normalizeMaterialCode(data.maVatTu);
    });
    if (!materialExists) return { success: false, message: 'Mã vật tư không tồn tại trong DMVT.' };
    var logId = normalizeInventoryId(data.maYeuCau);
    var repairLog = null;
    if (logId) repairLog = sheetToObjects('YEU_CAU_TH').find(function(log) {
      return normalizeInventoryId(log['ID TH'] || log.ID) === logId;
    });
    if (logId && !repairLog) return { success: false, message: 'Mã yêu cầu phải là ID TH tồn tại trong nhật ký sửa chữa.' };
    var machineCode = String(data.mayMocThietBi || '').trim();
    var linkedMachine = repairLog ? String(repairLog['Máy móc/thiết bị'] || '').trim() : '';
    if (logId) machineCode = linkedMachine;
    if (machineCode && !sheetToObjects('MMTB').some(function(machine) {
      return String(machine['Mã'] || '').trim() === machineCode;
    })) return { success: false, message: 'Máy móc/thiết bị không tồn tại trong danh mục MMTB.' };
    var row = existingRowIndex === -1 ? Array(headers.length).fill('') : rows[existingRowIndex].slice();
    row[idIndex] = existingRowIndex === -1 ? getNextInventoryId(rows, idIndex) : rows[existingRowIndex][idIndex];
    row[dateIndex] = data.ngay || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    row[codeIndex] = getMaterialCodeValue(data.maVatTu);
    row[quantityIndex] = quantity;
    if (requestIndex !== -1 && machineIndex !== -1) {
      var repairLogs = sheetToObjects('YEU_CAU_TH');
      for (var stockRow = 1; stockRow < rows.length; stockRow++) {
        if (String(rows[stockRow][machineIndex] || '').trim()) continue;
        var stockLogId = normalizeInventoryId(rows[stockRow][requestIndex]);
        var stockLog = repairLogs.find(function(log) {
          return normalizeInventoryId(log['ID TH'] || log.ID) === stockLogId;
        });
        if (stockLog && String(stockLog['Máy móc/thiết bị'] || '').trim()) {
          sheet.getRange(stockRow + 1, machineIndex + 1).setValue(String(stockLog['Máy móc/thiết bị']).trim());
        }
      }
    }
    var employeeCode = getCanonicalEmployeeCode(currentUser.maNV);
    if (priceIndex !== -1) row[priceIndex] = priceInput === '' ? '' : price;
    if (valueIndex !== -1) row[valueIndex] = quantity * price;
    if (noteIndex !== -1) row[noteIndex] = data.ghiChu || '';
    if (performerIndex !== -1) row[performerIndex] = employeeCode;
    if (performedDateIndex !== -1) row[performedDateIndex] = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    if (machineIndex !== -1) row[machineIndex] = machineCode;
    row[requestIndex] = logId;
    var newRowIndex = existingRowIndex === -1 ? sheet.getLastRow() + 1 : existingRowIndex + 1;
    if (existingRowIndex === -1) sheet.appendRow(row);
    else sheet.getRange(newRowIndex, 1, 1, headers.length).setValues([row]);
    if (idIndex !== -1) sheet.getRange(newRowIndex, idIndex + 1).setNumberFormat('@').setValue(String(row[idIndex]));
    if (typeof getMaterialCodeValue(row[codeIndex]) === 'number') sheet.getRange(newRowIndex, codeIndex + 1).setNumberFormat('0');
    if (performerIndex !== -1) setEmployeeCodeCell(sheet, newRowIndex, performerIndex + 1, employeeCode);
    return { success: true, message: existingRowIndex === -1
      ? (quantity > 0 ? 'Đã ghi nhận nhập kho.' : 'Đã ghi nhận xuất kho.')
      : 'Đã cập nhật giao dịch kho #' + stockId + '.' };
  } catch (error) {
    return { success: false, message: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

function deleteStockReceipt(stockId, currentUser) {
  if (!checkPermission(currentUser, 'KHO_MANAGE')) return { success: false, message: 'Bạn không có quyền quản lý sổ kho.' };
  var lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    var sheet = findDatabaseSheet('KHO');
    if (!sheet || sheet.getLastRow() < 2) return { success: false, message: 'Không tìm thấy giao dịch kho.' };
    var rows = sheet.getDataRange().getValues();
    var idIndex = inventoryColumnIndex(rows[0], ['ID KHO', 'ID']);
    var noteIndex = inventoryColumnIndex(rows[0], ['Ghi chú']);
    if (idIndex === -1) throw new Error('Sheet KHO thiếu cột ID KHO.');
    var targetId = normalizeInventoryId(stockId);
    for (var i = rows.length - 1; i > 0; i--) {
      if (normalizeInventoryId(rows[i][idIndex]) !== targetId) continue;
      var note = noteIndex === -1 ? '' : String(rows[i][noteIndex] || '');
      if (note.indexOf('Xuất sử dụng cho nhật ký ') === 0) {
        return { success: false, message: 'Vật tư đã tự động ghi từ nhật ký sửa chữa; hãy sửa hoặc xóa nhật ký để cập nhật dòng kho này.' };
      }
      sheet.deleteRow(i + 1);
      return { success: true, message: 'Đã xóa giao dịch kho #' + targetId + '.' };
    }
    return { success: false, message: 'Không tìm thấy giao dịch kho #' + targetId + '.' };
  } catch (error) {
    return { success: false, message: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

function getYeuCauRow(sheet, id) {
    if (!sheet || sheet.getLastRow() < 2) return null;
    var rows = sheet.getDataRange().getValues();
    var idIndex = inventoryColumnIndex(rows[0], ['ID YC', 'ID']);
    for (var i = 1; i < rows.length; i++) {
      if (idIndex !== -1 && String(rows[i][idIndex]).trim() === String(id).trim()) {
        return { sheet: sheet, row: i + 1, headers: rows[0], values: rows[i] };
      }
    }
    return null;
  }

function setYeuCauStatus(id, status) {
    var sheet = findDatabaseSheet('YEU_CAU');
    var entry = getYeuCauRow(sheet, id);
    if (!entry) throw new Error('Không tìm thấy yêu cầu #' + id + '.');
    var statusIndex = inventoryColumnIndex(entry.headers, ['Trạng thái']);
    if (statusIndex === -1) throw new Error('Sheet YEU_CAU thiếu cột Trạng thái.');
    sheet.getRange(entry.row, statusIndex + 1).setValue(status);
  }

function saveRepairLog(data, currentUser) {
    if (!checkPermission(currentUser, 'REPAIR_LOG_MANAGE')) return { success: false, message: 'Chỉ Admin hoặc Kỹ thuật mới được quản lý nhật ký sửa chữa.' };
    var lock = LockService.getDocumentLock();
    lock.waitLock(30000);
    try {
      var logSheet = getOrCreateInventorySheet('YEU_CAU_TH', ['ID TH', 'Từ giờ', 'Đến giờ', 'Loại công việc', 'Công việc thực hiện', 'Máy móc/thiết bị', 'Mã yêu cầu', 'Hình ảnh thực hiện', 'Người thực hiện', 'Trạng thái']);
      var stockSheet = getOrCreateInventorySheet('KHO', ['ID KHO', 'Ngày nhập xuất', 'Mã vật tư', 'Số lượng', 'Đơn giá', 'Ghi chú', 'Người thực hiện', 'Ngày thực hiện', 'Mã yêu cầu', 'Mã máy móc/thiết bị', 'Giá trị xuất/nhập kho']);
      var logRows = logSheet.getDataRange().getValues();
      var headers = logRows[0];
      var idIndex = inventoryColumnIndex(headers, ['ID TH', 'ID']);
      var requestIndex = inventoryColumnIndex(headers, ['Mã yêu cầu']);
      var workIndex = inventoryColumnIndex(headers, ['Công việc thực hiện']);
      var machineIndex = inventoryColumnIndex(headers, ['Máy móc/thiết bị']);
      var fromIndex = inventoryColumnIndex(headers, ['Từ giờ']);
      var toIndex = inventoryColumnIndex(headers, ['Đến giờ']);
      var typeIndex = inventoryColumnIndex(headers, ['Loại công việc']);
      var imageIndex = inventoryColumnIndex(headers, ['Hình ảnh thực hiện']);
      var performerIndex = inventoryColumnIndex(headers, ['Người thực hiện']);
      var statusIndex = inventoryColumnIndex(headers, ['Trạng thái']);
      if ([idIndex, requestIndex, workIndex, machineIndex, fromIndex, toIndex, typeIndex, performerIndex, statusIndex].some(function(index) { return index === -1; })) {
        throw new Error('Sheet YEU_CAU_TH thiếu một hoặc nhiều cột bắt buộc.');
      }
      var existing = null;
      var logId = String(data.id || '').trim();
      if (logId) {
        for (var i = 1; i < logRows.length; i++) {
          if (String(logRows[i][idIndex]).trim() === logId) {
            existing = { row: i + 1, values: logRows[i] };
            break;
          }
        }
        if (!existing) throw new Error('Không tìm thấy nhật ký sửa chữa #' + logId + '.');
      }
      var requestId = String(data.maYeuCau || '').trim();
      var fromTime = String(data.tuGio || '').trim().replace('T', ' ');
      var toTime = String(data.denGio || '').trim().replace('T', ' ');
      if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(fromTime) ||
          !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(toTime) ||
          toTime < fromTime) {
        throw new Error('Vui lòng nhập khoảng thời gian sửa chữa hợp lệ.');
      }
      if (!String(data.loaiCongViec || '').trim() || !String(data.congViec || '').trim() || !String(data.mmtb || '').trim()) {
        throw new Error('Vui lòng nhập loại công việc, công việc thực hiện và máy móc/thiết bị.');
      }
      var machineExists = sheetToObjects('MMTB').some(function(machine) { return String(machine['Mã']).trim() === String(data.mmtb).trim(); });
      if (!machineExists) throw new Error('Máy móc/thiết bị không tồn tại trong danh mục MMTB.');
      var workTypeExists = sheetToObjects('LOAI_YC').some(function(type) { return String(type['Mã yêu cầu']).trim() === String(data.loaiCongViec).trim(); });
      if (!workTypeExists) throw new Error('Loại công việc không tồn tại trong danh mục LOAI_YC.');
      if (requestId) {
        var requestEntry = getYeuCauRow(findDatabaseSheet('YEU_CAU'), requestId);
        if (!requestEntry) throw new Error('Mã yêu cầu không tồn tại.');
        var requestStatusIndex = inventoryColumnIndex(requestEntry.headers, ['Trạng thái']);
        var requestStatus = requestStatusIndex === -1 ? '' : String(requestEntry.values[requestStatusIndex]).trim();
        if (!existing && requestStatus !== 'Đã tiếp nhận' && requestStatus !== 'Đang thực hiện' && requestStatus !== 'Chờ thực hiện') {
          throw new Error('Chỉ tạo nhật ký cho yêu cầu đã tiếp nhận.');
        }
        if (existing && String(existing.values[requestIndex]).trim() !== requestId) {
          throw new Error('Không thể thay đổi yêu cầu đã liên kết với nhật ký. Hãy tạo nhật ký mới nếu cần.');
        }
      }
      if (existing && String(existing.values[requestIndex]).trim() && !requestId) {
        throw new Error('Không thể bỏ liên kết yêu cầu của nhật ký hiện có.');
      }
      var materialRows = Array.isArray(data.vatTu) ? data.vatTu : [];
      var catalog = sheetToObjects('DMVT');
      var stockRows = stockSheet.getDataRange().getValues();
      var stockHeaders = stockRows[0];
      var stockIdIndex = inventoryColumnIndex(stockHeaders, ['ID KHO', 'ID']);
      var stockDateIndex = inventoryColumnIndex(stockHeaders, ['Ngày nhập xuất']);
      var stockCodeIndex = inventoryColumnIndex(stockHeaders, ['Mã vật tư']);
      var stockQuantityIndex = inventoryColumnIndex(stockHeaders, ['Số lượng']);
      var stockPriceIndex = inventoryColumnIndex(stockHeaders, ['Đơn giá']);
      var stockNoteIndex = inventoryColumnIndex(stockHeaders, ['Ghi chú']);
      var stockUserIndex = inventoryColumnIndex(stockHeaders, ['Người thực hiện']);
      var stockPerformedIndex = inventoryColumnIndex(stockHeaders, ['Ngày thực hiện']);
      var stockLogIndex = inventoryColumnIndex(stockHeaders, ['Mã yêu cầu']);
      var stockMachineIndex = inventoryColumnIndex(stockHeaders, ['Mã máy móc/thiết bị', 'Máy móc/thiết bị']);
      var stockValueIndex = inventoryColumnIndex(stockHeaders, ['Giá trị xuất/nhập kho']);
      if ([stockIdIndex, stockDateIndex, stockCodeIndex, stockQuantityIndex, stockLogIndex].some(function(index) { return index === -1; })) {
        throw new Error('Sheet KHO thiếu cột để liên kết vật tư với nhật ký sửa chữa.');
      }
      materialRows.forEach(function(item) {
        var code = String(item.maVatTu || '').trim();
        var quantity = Number(item.soLuong);
        if (!code || !isFinite(quantity) || quantity <= 0) throw new Error('Mỗi dòng vật tư cần chọn mã vật tư và nhập số lượng lớn hơn 0.');
        if (!catalog.some(function(material) {
          return normalizeMaterialCode(material['Mã vật tư'] || material['Mã VT'] || material['Mã hàng'] || material['Mã']) === normalizeMaterialCode(code);
        })) throw new Error('Mã vật tư ' + code + ' không tồn tại trong DMVT.');
      });

      if (!logId) logId = String(getNextInventoryId(logRows, idIndex));
      var logValues = existing ? existing.values.slice() : Array(headers.length).fill('');
      logValues[idIndex] = logId;
      logValues[fromIndex] = data.tuGio;
      logValues[toIndex] = data.denGio;
      logValues[typeIndex] = data.loaiCongViec;
      logValues[workIndex] = data.congViec;
      logValues[machineIndex] = data.mmtb;
      logValues[requestIndex] = requestId;
      if (imageIndex !== -1) logValues[imageIndex] = data.fileUrl || '';
      var performerCode = getCanonicalEmployeeCode(currentUser.maNV);
      logValues[performerIndex] = performerCode;
      logValues[statusIndex] = 'Đã thực hiện';
      var logRowNumber = existing ? existing.row : logSheet.getLastRow() + 1;
      logSheet.getRange(logRowNumber, performerIndex + 1).setNumberFormat('@');
      logSheet.getRange(logRowNumber, 1, 1, headers.length).setValues([logValues]);
      if (existing) logRows[logRowNumber - 1] = logValues;
      else logRows.push(logValues);

      var previousStock = [];
      for (var stockRow = 1; stockRow < stockRows.length; stockRow++) {
        var stockNote = stockNoteIndex === -1 ? '' : String(stockRows[stockRow][stockNoteIndex] || '');
        if (normalizeInventoryId(stockRows[stockRow][stockLogIndex]) === normalizeInventoryId(logId) &&
            Number(stockRows[stockRow][stockQuantityIndex]) < 0 &&
            stockNote.indexOf('Xuất sử dụng cho nhật ký ' + logId) === 0) {
          previousStock.push({ row: stockRow + 1, values: stockRows[stockRow] });
        }
      }
      var nextStockId = getNextInventoryId(stockRows, stockIdIndex);
      var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
      var newStockRows = [];
      materialRows.forEach(function(item, index) {
        var previous = previousStock[index];
        var values = previous ? previous.values.slice() : Array(stockHeaders.length).fill('');
        values[stockIdIndex] = previous ? values[stockIdIndex] : nextStockId++;
        values[stockDateIndex] = item.ngay || String(data.denGio || '').slice(0, 10) || now.slice(0, 10);
        values[stockCodeIndex] = getMaterialCodeValue(item.maVatTu);
        values[stockQuantityIndex] = -Number(item.soLuong);
        if (stockPriceIndex !== -1) values[stockPriceIndex] = Number(item.donGia) || 0;
        if (stockValueIndex !== -1) values[stockValueIndex] = -Number(item.soLuong) * (Number(item.donGia) || 0);
        if (stockNoteIndex !== -1) values[stockNoteIndex] = 'Xuất sử dụng cho nhật ký ' + logId;
        if (stockUserIndex !== -1) values[stockUserIndex] = performerCode;
        if (stockPerformedIndex !== -1) values[stockPerformedIndex] = now;
        if (stockMachineIndex !== -1) values[stockMachineIndex] = String(data.mmtb || '').trim();
        values[stockLogIndex] = logId;
        if (previous) {
          if (stockUserIndex !== -1) stockSheet.getRange(previous.row, stockUserIndex + 1).setNumberFormat('@');
          if (typeof getMaterialCodeValue(values[stockCodeIndex]) === 'number') stockSheet.getRange(previous.row, stockCodeIndex + 1).setNumberFormat('0');
          stockSheet.getRange(previous.row, 1, 1, stockHeaders.length).setValues([values]);
        } else {
          newStockRows.push(values);
        }
      });
      if (newStockRows.length) {
        var firstNewStockRow = stockSheet.getLastRow() + 1;
        if (stockUserIndex !== -1) {
          stockSheet.getRange(firstNewStockRow, stockUserIndex + 1, newStockRows.length, 1).setNumberFormat('@');
        }
        stockSheet.getRange(firstNewStockRow, stockCodeIndex + 1, newStockRows.length, 1).setNumberFormat('0');
        stockSheet.getRange(firstNewStockRow, 1, newStockRows.length, stockHeaders.length).setValues(newStockRows);
      }
      previousStock.slice(materialRows.length).sort(function(a, b) { return b.row - a.row; }).forEach(function(item) {
        stockSheet.deleteRow(item.row);
      });
      if (requestId) {
        var linkedLogs = logRows.filter(function(log) { return String(log[requestIndex]).trim() === requestId; });
        var requestStatus = linkedLogs.length && linkedLogs.every(function(log) {
          return String(log[statusIndex]).trim() === 'Đã thực hiện';
        }) ? 'Đã thực hiện' : 'Đang thực hiện';
        setYeuCauStatus(requestId, requestStatus);
      }
      return { success: true, message: (existing ? 'Đã cập nhật' : 'Đã tạo') + ' nhật ký sửa chữa #' + logId + '.', id: logId };
    } catch (error) {
      return { success: false, message: error.toString() };
    } finally {
      lock.releaseLock();
    }
  }

function deleteRepairLog(id, currentUser) {
    if (!checkPermission(currentUser, 'REPAIR_LOG_MANAGE')) return { success: false, message: 'Chỉ Admin hoặc Kỹ thuật mới được xóa nhật ký sửa chữa.' };
    var lock = LockService.getDocumentLock();
    lock.waitLock(30000);
    try {
      var logSheet = findDatabaseSheet('YEU_CAU_TH');
      var logRows = logSheet ? logSheet.getDataRange().getValues() : [];
      var idIndex = logRows.length ? inventoryColumnIndex(logRows[0], ['ID TH', 'ID']) : -1;
      var requestIndex = logRows.length ? inventoryColumnIndex(logRows[0], ['Mã yêu cầu']) : -1;
      var logRow = -1;
      var requestId = '';
      for (var i = 1; i < logRows.length; i++) {
        if (String(logRows[i][idIndex]).trim() === String(id).trim()) {
          logRow = i + 1;
          requestId = requestIndex === -1 ? '' : String(logRows[i][requestIndex]).trim();
          break;
        }
      }
      if (logRow === -1) throw new Error('Không tìm thấy nhật ký sửa chữa #' + id + '.');
      var stockSheet = findDatabaseSheet('KHO');
      if (stockSheet && stockSheet.getLastRow() > 1) {
        var stockRows = stockSheet.getDataRange().getValues();
        var stockRequestIndex = inventoryColumnIndex(stockRows[0], ['Mã yêu cầu']);
        var stockQuantityIndex = inventoryColumnIndex(stockRows[0], ['Số lượng']);
        var stockNoteIndex = inventoryColumnIndex(stockRows[0], ['Ghi chú']);
        for (var row = stockRows.length - 1; row > 0; row--) {
          var stockNote = stockNoteIndex === -1 ? '' : String(stockRows[row][stockNoteIndex] || '');
          if (stockRequestIndex !== -1 && stockQuantityIndex !== -1 &&
              String(stockRows[row][stockRequestIndex]).trim() === String(id).trim() &&
              Number(stockRows[row][stockQuantityIndex]) < 0 &&
              stockNote.indexOf('Xuất sử dụng cho nhật ký ' + id) === 0) stockSheet.deleteRow(row + 1);
        }
      }
      logSheet.deleteRow(logRow);
      if (requestId) {
        var remaining = sheetToObjects('YEU_CAU_TH').filter(function(log) { return String(log['Mã yêu cầu']).trim() === requestId; });
        var nextStatus = !remaining.length ? 'Đã tiếp nhận'
          : remaining.every(function(log) { return String(log['Trạng thái']).trim() === 'Đã thực hiện'; }) ? 'Đã thực hiện' : 'Đang thực hiện';
        setYeuCauStatus(requestId, nextStatus);
      }
      return { success: true, message: 'Đã xóa nhật ký sửa chữa #' + id + ' và vật tư liên quan.' };
    } catch (error) {
      return { success: false, message: error.toString() };
    } finally {
      lock.releaseLock();
    }
  }

function syncYeuCauVatTu_(requestId, submittedItems, currentUser) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    var usageHeaders = ['ID', 'Mã yêu cầu', 'Ngày sử dụng', 'Mã vật tư', 'Số lượng', 'Đơn giá', 'Người thực hiện', 'Ngày thực hiện'];
    var stockHeaders = ['ID', 'Ngày nhập xuất', 'Mã vật tư', 'Số lượng', 'Đơn giá', 'Ghi chú', 'Người thực hiện', 'Ngày thực hiện', 'ID YCVT', 'Mã yêu cầu'];
    var usageSheet = getOrCreateInventorySheet('YEU_CAU_VT', usageHeaders);
    var stockSheet = getOrCreateInventorySheet('KHO', stockHeaders);
    var usageRows = usageSheet.getDataRange().getValues();
    var stockRows = stockSheet.getDataRange().getValues();
    var usageColumns = usageRows[0];
    var stockColumns = stockRows[0];
    var usageIdIndex = inventoryColumnIndex(usageColumns, ['ID']);
    var usageRequestIndex = inventoryColumnIndex(usageColumns, ['Mã yêu cầu']);
    var usageCodeIndex = inventoryColumnIndex(usageColumns, ['Mã vật tư']);
    var usageDateIndex = inventoryColumnIndex(usageColumns, ['Ngày sử dụng']);
    var usageQuantityIndex = inventoryColumnIndex(usageColumns, ['Số lượng']);
    var usagePriceIndex = inventoryColumnIndex(usageColumns, ['Đơn giá']);
    var usageUserIndex = inventoryColumnIndex(usageColumns, ['Người thực hiện']);
    var usagePerformedIndex = inventoryColumnIndex(usageColumns, ['Ngày thực hiện']);
    var stockIdIndex = inventoryColumnIndex(stockColumns, ['ID']);
    var stockDateIndex = inventoryColumnIndex(stockColumns, ['Ngày nhập xuất']);
    var stockCodeIndex = inventoryColumnIndex(stockColumns, ['Mã vật tư']);
    var stockQuantityIndex = inventoryColumnIndex(stockColumns, ['Số lượng']);
    var stockPriceIndex = inventoryColumnIndex(stockColumns, ['Đơn giá']);
    var stockNoteIndex = inventoryColumnIndex(stockColumns, ['Ghi chú']);
    var stockUserIndex = inventoryColumnIndex(stockColumns, ['Người thực hiện']);
    var stockPerformedIndex = inventoryColumnIndex(stockColumns, ['Ngày thực hiện']);
    var stockUsageIdIndex = inventoryColumnIndex(stockColumns, ['ID YCVT']);
    var stockRequestIndex = inventoryColumnIndex(stockColumns, ['Mã yêu cầu']);
    if ([usageIdIndex, usageRequestIndex, usageCodeIndex, usageDateIndex, usageQuantityIndex, stockDateIndex, stockCodeIndex, stockQuantityIndex, stockUsageIdIndex, stockRequestIndex].some(function(index) { return index === -1; })) {
      throw new Error('Thiếu cột bắt buộc trong YEU_CAU_VT hoặc KHO.');
    }
    var catalogRows = sheetToObjects('DMVT');
    var employeeCode = getCanonicalEmployeeCode(currentUser.maNV);

    var existingById = {};
    var existingForRequest = [];
    usageRows.slice(1).forEach(function(row, offset) {
      if (String(row[usageRequestIndex]).trim() !== String(requestId).trim()) return;
      var entry = { rowNumber: offset + 2, values: row, id: String(row[usageIdIndex]) };
      existingById[entry.id] = entry;
      existingForRequest.push(entry);
    });

    var nextUsageId = getNextInventoryId(usageRows, usageIdIndex);
    var nextStockId = stockIdIndex === -1 ? 0 : getNextInventoryId(stockRows, stockIdIndex);
    var keptIds = {};
    var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    (submittedItems || []).forEach(function(item) {
      var materialCode = String(item.maVatTu || '').trim();
      var quantity = Number(item.soLuong);
      if (!materialCode || !isFinite(quantity) || quantity <= 0) throw new Error('Mỗi dòng vật tư cần có mã vật tư và số lượng lớn hơn 0.');
      if (!catalogRows.some(function(material) {
        return normalizeMaterialCode(material['Mã vật tư'] || material['Mã VT'] || material['Mã hàng'] || material['Mã']) === normalizeMaterialCode(materialCode);
      })) throw new Error('Mã vật tư ' + materialCode + ' không tồn tại trong DMVT.');
      var id = String(item.id || '').trim();
      var existing = id && existingById[id];
      if (!existing) id = String(nextUsageId++);
      keptIds[id] = true;
      var usageValues = existing ? existing.values.slice() : Array(usageColumns.length).fill('');
      usageValues[usageIdIndex] = id;
      usageValues[usageRequestIndex] = requestId;
      usageValues[usageDateIndex] = item.ngaySuDung || timestamp.slice(0, 10);
      usageValues[usageCodeIndex] = getMaterialCodeValue(materialCode);
      usageValues[usageQuantityIndex] = quantity;
      if (usagePriceIndex !== -1) usageValues[usagePriceIndex] = Number(item.donGia) || 0;
      if (usageUserIndex !== -1) usageValues[usageUserIndex] = employeeCode;
      if (usagePerformedIndex !== -1) usageValues[usagePerformedIndex] = timestamp;
      if (existing) {
        if (typeof getMaterialCodeValue(usageValues[usageCodeIndex]) === 'number') usageSheet.getRange(existing.rowNumber, usageCodeIndex + 1).setNumberFormat('0');
        usageSheet.getRange(existing.rowNumber, 1, 1, usageColumns.length).setValues([usageValues]);
        if (usageUserIndex !== -1) setEmployeeCodeCell(usageSheet, existing.rowNumber, usageUserIndex + 1, employeeCode);
      } else {
        var newUsageRow = usageSheet.getLastRow() + 1;
        if (typeof getMaterialCodeValue(usageValues[usageCodeIndex]) === 'number') usageSheet.getRange(newUsageRow, usageCodeIndex + 1).setNumberFormat('0');
        usageSheet.appendRow(usageValues);
        if (usageUserIndex !== -1) setEmployeeCodeCell(usageSheet, newUsageRow, usageUserIndex + 1, employeeCode);
      }

      var stockRowNumber = -1;
      for (var stockIndex = 1; stockIndex < stockRows.length; stockIndex++) {
        if (String(stockRows[stockIndex][stockUsageIdIndex]).trim() === id && String(stockRows[stockIndex][stockRequestIndex]).trim() === String(requestId).trim()) {
          stockRowNumber = stockIndex + 1;
          break;
        }
      }
      var stockValues = stockRowNumber > 0 ? stockRows[stockRowNumber - 1].slice() : Array(stockColumns.length).fill('');
      if (stockIdIndex !== -1 && stockRowNumber < 0) stockValues[stockIdIndex] = nextStockId++;
      stockValues[stockDateIndex] = usageValues[usageDateIndex];
      stockValues[stockCodeIndex] = getMaterialCodeValue(materialCode);
      stockValues[stockQuantityIndex] = -quantity;
      if (stockPriceIndex !== -1) stockValues[stockPriceIndex] = usageValues[usagePriceIndex] || 0;
      if (stockNoteIndex !== -1) stockValues[stockNoteIndex] = 'Xuất sử dụng cho yêu cầu ' + requestId;
      if (stockUserIndex !== -1) stockValues[stockUserIndex] = employeeCode;
      if (stockPerformedIndex !== -1) stockValues[stockPerformedIndex] = timestamp;
      stockValues[stockUsageIdIndex] = id;
      stockValues[stockRequestIndex] = requestId;
      if (stockRowNumber > 0) {
        if (typeof getMaterialCodeValue(stockValues[stockCodeIndex]) === 'number') stockSheet.getRange(stockRowNumber, stockCodeIndex + 1).setNumberFormat('0');
        stockSheet.getRange(stockRowNumber, 1, 1, stockColumns.length).setValues([stockValues]);
        if (stockUserIndex !== -1) setEmployeeCodeCell(stockSheet, stockRowNumber, stockUserIndex + 1, employeeCode);
      } else {
        var newStockRow = stockSheet.getLastRow() + 1;
        if (typeof getMaterialCodeValue(stockValues[stockCodeIndex]) === 'number') stockSheet.getRange(newStockRow, stockCodeIndex + 1).setNumberFormat('0');
        stockSheet.appendRow(stockValues);
        if (stockUserIndex !== -1) setEmployeeCodeCell(stockSheet, newStockRow, stockUserIndex + 1, employeeCode);
      }
    });

    var removedKeys = {};
    existingForRequest.forEach(function(entry) {
      if (!keptIds[entry.id]) removedKeys[entry.id] = true;
    });
    existingForRequest.slice().reverse().forEach(function(entry) {
      if (!keptIds[entry.id]) usageSheet.deleteRow(entry.rowNumber);
    });
    if (Object.keys(removedKeys).length) {
      for (var deleteIndex = stockRows.length - 1; deleteIndex >= 1; deleteIndex--) {
        var stockId = String(stockRows[deleteIndex][stockUsageIdIndex]).trim();
        var stockRequest = String(stockRows[deleteIndex][stockRequestIndex]).trim();
        if (stockRequest === String(requestId).trim() && removedKeys[stockId]) stockSheet.deleteRow(deleteIndex + 1);
      }
    }
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

// ----------------------------------------------------
// DRIVE UPLOAD
// ----------------------------------------------------
function uploadFileToDrive(base64Data, fileName, mimeType) {
  try {
    var folderName = "ME_Uploads";
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

    var bytes = Utilities.base64Decode(base64Data.split(',')[1]);
    var blob = Utilities.newBlob(bytes, mimeType, fileName);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return { success: true, fileUrl: file.getUrl() };
  } catch (e) {
    return { success: false, message: 'Lỗi upload Drive: ' + e.toString() };
  }
}

// ----------------------------------------------------
// 1. QUẢN LÝ YÊU CẦU (YEU_CAU)
// ----------------------------------------------------
function allocateYeuCauId(rows, idIndex) {
  if (idIndex === -1) throw new Error('Sheet YEU_CAU thiếu cột ID.');
  var maxExistingId = 0;
  for (var i = 1; i < rows.length; i++) {
    var id = Number(rows[i][idIndex]);
    if (isFinite(id)) maxExistingId = Math.max(maxExistingId, id);
  }
  var properties = PropertiesService.getDocumentProperties();
  var storedNextId = Number(properties.getProperty('YEU_CAU_NEXT_ID')) || 0;
  var nextId = Math.max(storedNextId, maxExistingId + 1);
  properties.setProperty('YEU_CAU_NEXT_ID', String(nextId + 1));
  return nextId;
}

function saveYeuCau(data, currentUser) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    var sheet = getDb().getSheetByName('YEU_CAU');
    var rows = sheet.getDataRange().getValues();
    var headers = rows[0];
    var nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

    var imgYcIdx = headers.indexOf('Hình ảnh yêu cầu');
    if (imgYcIdx === -1) imgYcIdx = headers.indexOf('Hình ảnh');

    var idIndex = inventoryColumnIndex(headers, ['ID YC', 'ID']);
    if (idIndex === -1) throw new Error('Sheet YEU_CAU thiếu cột ID YC.');

    if (data.id) {
      var existingItem = sheetToObjects('YEU_CAU').find(function(y) { return String(y['ID']) === String(data.id); });
      if (!checkPermission(currentUser, 'YEU_CAU_EDIT', existingItem)) {
        return { success: false, message: 'Bạn không có quyền chỉnh sửa yêu cầu này!' };
      }

      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][idIndex]).trim() === String(data.id).trim()) {
          var rowIndex = i + 1;
          [['Loại yêu cầu', data.loaiYC], ['Mô tả yêu cầu', data.moTa], ['Khu vực', data.khuVuc], ['Máy móc/thiết bị', data.mmtb], ['Ngày yêu cầu hoàn thành', data.ngayYeuCauHoanThanh]]
            .forEach(function(field) {
              var index = headers.indexOf(field[0]);
              if (index !== -1) sheet.getRange(rowIndex, index + 1).setValue(field[1]);
            });
          if (data.fileUrl) sheet.getRange(rowIndex, imgYcIdx + 1).setValue(data.fileUrl);
          
          return { success: true, message: 'Cập nhật yêu cầu thành công!' };
        }
      }
    } else {
      if (!checkPermission(currentUser, 'YEU_CAU_ADD')) {
        return { success: false, message: 'Bạn không có quyền tạo yêu cầu mới!' };
      }

      var requesterIndex = headers.indexOf('Người yêu cầu');
      if (requesterIndex === -1) return { success: false, message: 'Sheet YEU_CAU thiếu cột Người yêu cầu.' };
      var employeeCode = getCanonicalEmployeeCode(currentUser.maNV);
      if (!employeeCode) return { success: false, message: 'Không xác định được mã nhân viên từ tài khoản đăng nhập.' };
      var id = allocateYeuCauId(rows, idIndex);
      var newRow = [];
      newRow[idIndex] = id;
      var dateIndex = headers.indexOf('Ngày yêu cầu');
      var typeIndex = headers.indexOf('Loại yêu cầu');
      var descriptionIndex = headers.indexOf('Mô tả yêu cầu');
      var areaIndex = headers.indexOf('Khu vực');
      var machineIndex = headers.indexOf('Máy móc/thiết bị');
      var statusIndex = headers.indexOf('Trạng thái');
      if ([dateIndex, typeIndex, descriptionIndex, areaIndex, machineIndex, statusIndex].some(function(index) { return index === -1; })) {
        throw new Error('Sheet YEU_CAU thiếu cột thông tin bắt buộc.');
      }
      newRow[dateIndex] = nowStr;
      newRow[typeIndex] = data.loaiYC;
      newRow[requesterIndex] = employeeCode;
      newRow[descriptionIndex] = data.moTa;
      newRow[areaIndex] = data.khuVuc;
      newRow[machineIndex] = data.mmtb;
      var dueDateIndex = headers.indexOf('Ngày yêu cầu hoàn thành');
      if (dueDateIndex !== -1) newRow[dueDateIndex] = data.ngayYeuCauHoanThanh || '';
      newRow[statusIndex] = 'Chờ tiếp nhận';

      for (var k = 0; k < headers.length; k++) { if (newRow[k] === undefined) newRow[k] = ""; }
      newRow[imgYcIdx] = data.fileUrl || "";

      var newRowIndex = sheet.getLastRow() + 1;
      sheet.appendRow(newRow);
      setEmployeeCodeCell(sheet, newRowIndex, requesterIndex + 1, employeeCode);
      return { success: true, message: 'Tạo yêu cầu thành công! ID: ' + id, id: id };
    }
  } catch (e) { return { success: false, message: e.toString() }; }
  finally { lock.releaseLock(); }
}

function updateYeuCauStatus(data, currentUser) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    var sheet = findDatabaseSheet('YEU_CAU');
    var rows = sheet ? sheet.getDataRange().getValues() : [];
    if (rows.length < 2) return { success: false, message: 'Không tìm thấy Yêu cầu #' + data.id };
    var headers = rows[0];
    var stColIdx = inventoryColumnIndex(headers, ['Trạng thái']);
    var idColIdx = inventoryColumnIndex(headers, ['ID YC', 'ID']);
    if (stColIdx === -1 || idColIdx === -1) throw new Error('Sheet YEU_CAU thiếu cột ID YC hoặc Trạng thái.');
    var requestRowIndex = -1;
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][idColIdx]).trim() === String(data.id).trim()) {
        requestRowIndex = i;
        break;
      }
    }
    if (requestRowIndex === -1) return { success: false, message: 'Không tìm thấy Yêu cầu #' + data.id };
    var existingItem = {};
    headers.forEach(function(header, columnIndex) {
      existingItem[String(header).trim()] = rows[requestRowIndex][columnIndex];
    });
    existingItem.ID = rows[requestRowIndex][idColIdx];
    var actionMap = {
      'TIEP_NHAN': 'YEU_CAU_TIEP_NHAN',
      'DA_THUC_HIEN': 'YEU_CAU_MARK_DONE',
      'XAC_NHAN': 'YEU_CAU_CONFIRM',
      'HUY': 'YEU_CAU_HUY'
    };
    if (!actionMap[data.action] || !checkPermission(currentUser, actionMap[data.action], existingItem)) {
      return { success: false, message: 'Bạn không đủ quyền thực hiện thao tác này!' };
    }

    var rowNumber = requestRowIndex + 1;
    if (data.action === 'TIEP_NHAN') {
      var receiverIndex = headers.indexOf('Người tiếp nhận');
      if (receiverIndex !== -1) setEmployeeCodeCell(sheet, rowNumber, receiverIndex + 1, getCanonicalEmployeeCode(currentUser.maNV));
      var acceptedAtIndex = headers.indexOf('Ngày tiếp nhận');
      if (acceptedAtIndex !== -1) {
        var nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
        sheet.getRange(rowNumber, acceptedAtIndex + 1).setValue(nowStr);
      }
      sheet.getRange(rowNumber, stColIdx + 1).setValue('Đã tiếp nhận');
      return { success: true, message: 'Đã tiếp nhận yêu cầu.' };
    }
    if (data.action === 'DA_THUC_HIEN') {
      var logSheet = findDatabaseSheet('YEU_CAU_TH');
      var logRows = logSheet ? logSheet.getDataRange().getValues() : [];
      if (logRows.length < 2) throw new Error('Yêu cầu chưa có nhật ký sửa chữa để xác nhận đã thực hiện.');
      var logHeaders = logRows[0];
      var logRequestIndex = inventoryColumnIndex(logHeaders, ['Mã yêu cầu']);
      var logStatusIndex = inventoryColumnIndex(logHeaders, ['Trạng thái']);
      if (logRequestIndex === -1 || logStatusIndex === -1) throw new Error('Sheet YEU_CAU_TH thiếu cột Mã yêu cầu hoặc Trạng thái.');
      var linkedLogs = logRows.slice(1).filter(function(log) {
        return String(log[logRequestIndex]).trim() === String(data.id).trim();
      });
      if (!linkedLogs.length) throw new Error('Yêu cầu chưa có nhật ký sửa chữa để xác nhận đã thực hiện.');
      if (!linkedLogs.every(function(log) { return String(log[logStatusIndex]).trim() === 'Đã thực hiện'; })) {
        throw new Error('Chỉ xác nhận khi tất cả nhật ký sửa chữa của yêu cầu đã ở trạng thái Đã thực hiện.');
      }
      sheet.getRange(rowNumber, stColIdx + 1).setValue('Chờ xác nhận');
      return { success: true, message: 'Đã ghi nhận công việc thực hiện. Yêu cầu đang chờ người yêu cầu xác nhận.' };
    }
    if (data.action === 'XAC_NHAN') {
      sheet.getRange(rowNumber, stColIdx + 1).setValue('Hoàn thành');
      return { success: true, message: 'Đã xác nhận hoàn thành yêu cầu.' };
    }
    if (data.action === 'HUY') {
      sheet.getRange(rowNumber, stColIdx + 1).setValue('Đã hủy');
      return { success: true, message: 'Đã hủy yêu cầu.' };
    }
    return { success: false, message: 'Thao tác trạng thái không hợp lệ.' };
  } catch (e) { return { success: false, message: e.toString() }; }
  finally { lock.releaseLock(); }
}

function deleteYeuCau(id, currentUser) {
  try {
    var existingItem = sheetToObjects('YEU_CAU').find(function(y) { return String(y['ID']) === String(id); });
    if (!checkPermission(currentUser, 'YEU_CAU_DELETE', existingItem)) {
      return { success: false, message: 'Bạn không có quyền xóa yêu cầu này!' };
    }

    var sheet = getDb().getSheetByName('YEU_CAU');
    var rows = sheet.getDataRange().getValues();
    var idIndex = inventoryColumnIndex(rows[0], ['ID YC', 'ID']);
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][idIndex]).trim() === String(id).trim()) {
        sheet.deleteRow(i + 1);
        return { success: true, message: 'Đã xóa thành công yêu cầu #' + id };
      }
    }
  } catch (e) { return { success: false, message: e.toString() }; }
}

// ----------------------------------------------------
// 2. MÁY MÓC THIẾT BỊ (MMTB)
// ----------------------------------------------------
function saveMMTB(data, currentUser) {
  if (!checkPermission(currentUser, 'MMTB_MANAGE')) return { success: false, message: 'Chỉ Admin mới có quyền quản lý MMTB!' };
  try {
    var sheet = getDb().getSheetByName('MMTB');
    var rows = sheet.getDataRange().getValues();
    var headers = rows[0];
    var nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

    var existingRow = -1;
    var existingValues = null;
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(data.ma).trim()) {
        existingRow = i + 1;
        existingValues = rows[i].slice();
        break;
      }
    }

    var imgColIdx = headers.indexOf('Hình ảnh');
    if (imgColIdx === -1) {
      sheet.getRange(1, headers.length + 1).setValue('Hình ảnh');
      headers.push('Hình ảnh');
      imgColIdx = headers.length - 1;
    }

    var rowValues = existingValues || [];
    rowValues[headers.indexOf('Mã')] = data.ma;
    rowValues[headers.indexOf('Tên')] = data.ten;
    rowValues[headers.indexOf('ĐVT chính')] = data.dvt || 'Bộ';
    rowValues[headers.indexOf('Thông tin MMTB')] = data.thongTin || 'Việt Nam';
    rowValues[headers.indexOf('Khu vực')] = data.khuVuc;
    rowValues[headers.indexOf('Ngày đưa vào sử dụng')] = data.ngaySuDung || '';
    rowValues[headers.indexOf('Hồ sơ tài chính MMTB')] = data.hoSoTaiChinh || '';
    rowValues[headers.indexOf('Tình trạng MMTB')] = data.tinhTrang || 'Sử dụng';
    rowValues[headers.indexOf('Ghi chú tình trạng sử dụng')] = data.ghiChu || '';
    rowValues[headers.indexOf('Thông số kỹ thuật cơ điện quản lý')] = data.thongSoKT || '';
    rowValues[headers.indexOf('Công suất tiêu thụ (KW/H)')] = data.congSuat || '';
    if (existingRow < 0) {
      rowValues[headers.indexOf('Người tạo')] = getCanonicalEmployeeCode(currentUser.maNV);
      rowValues[headers.indexOf('Ngày tạo')] = nowStr;
    }
    rowValues[imgColIdx] = data.fileUrl || '';

    for (var k = 0; k < headers.length; k++) {
      if (rowValues[k] === undefined) rowValues[k] = "";
    }

    if (existingRow > 0) {
      sheet.getRange(existingRow, 1, 1, headers.length).setValues([rowValues]);
      return { success: true, message: 'Cập nhật MMTB thành công!' };
    } else {
      sheet.appendRow(rowValues);
      var creatorIndex = headers.indexOf('Người tạo');
      if (creatorIndex !== -1) setEmployeeCodeCell(sheet, sheet.getLastRow(), creatorIndex + 1, getCanonicalEmployeeCode(currentUser.maNV));
      return { success: true, message: 'Thêm mới MMTB thành công!' };
    }
  } catch (e) { return { success: false, message: e.toString() }; }
}

function deleteMMTB(ma, currentUser) {
  if (!checkPermission(currentUser, 'MMTB_MANAGE')) return { success: false, message: 'Chỉ Admin mới có quyền xóa MMTB!' };
  try {
    var ycList = sheetToObjects('YEU_CAU');
    if (ycList.some(function(y) { return String(y['Máy móc/thiết bị']).trim() === String(ma).trim(); })) {
      return { success: false, message: 'Không thể xóa MMTB [' + ma + '] vì đang có lịch sử Yêu cầu!' };
    }

    var sheet = getDb().getSheetByName('MMTB');
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(ma).trim()) {
        sheet.deleteRow(i + 1);
        return { success: true, message: 'Đã xóa MMTB mã: ' + ma };
      }
    }
  } catch (e) { return { success: false, message: e.toString() }; }
}

// ----------------------------------------------------
// 3. DANH MỤC SYSTEM
// ----------------------------------------------------
function saveKhuVuc(data, currentUser) {
  if (!checkPermission(currentUser, 'KHU_VUC_MANAGE')) return { success: false, message: 'Quyền truy cập bị từ chối!' };
  try {
    var sheet = getDb().getSheetByName('KHU_VUC');
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(data.ma).trim()) {
        sheet.getRange(i + 1, 2).setValue(data.moTa);
        return { success: true, message: 'Cập nhật khu vực thành công!' };
      }
    }
    sheet.appendRow([data.ma, data.moTa]);
    return { success: true, message: 'Thêm khu vực thành công!' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function deleteKhuVuc(ma, currentUser) {
  if (!checkPermission(currentUser, 'KHU_VUC_MANAGE')) return { success: false, message: 'Quyền truy cập bị từ chối!' };
  try {
    var sheet = getDb().getSheetByName('KHU_VUC');
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(ma).trim()) {
        sheet.deleteRow(i + 1);
        return { success: true, message: 'Đã xóa khu vực: ' + ma };
      }
    }
  } catch (e) { return { success: false, message: e.toString() }; }
}

function saveLoaiYC(data, currentUser) {
  if (!checkPermission(currentUser, 'LOAI_YC_MANAGE')) return { success: false, message: 'Quyền truy cập bị từ chối!' };
  try {
    var sheet = getDb().getSheetByName('LOAI_YC');
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(data.ma).trim()) {
        sheet.getRange(i + 1, 2).setValue(data.ten);
        return { success: true, message: 'Cập nhật loại YC thành công!' };
      }
    }
    sheet.appendRow([data.ma, data.ten]);
    return { success: true, message: 'Thêm loại YC thành công!' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function deleteLoaiYC(ma, currentUser) {
  if (!checkPermission(currentUser, 'LOAI_YC_MANAGE')) return { success: false, message: 'Quyền truy cập bị từ chối!' };
  try {
    var sheet = getDb().getSheetByName('LOAI_YC');
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(ma).trim()) {
        sheet.deleteRow(i + 1);
        return { success: true, message: 'Đã xóa loại YC: ' + ma };
      }
    }
  } catch (e) { return { success: false, message: e.toString() }; }
}

function saveUser(data, currentUser) {
  if (!checkPermission(currentUser, 'USER_MANAGE')) return { success: false, message: 'Quyền truy cập bị từ chối!' };
  try {
    var sheet = getDb().getSheetByName('USER');
    var rows = sheet.getDataRange().getValues();
    var headers = rows[0];

    var roleColIdx = headers.indexOf('Vai trò');
    if (roleColIdx === -1) {
      sheet.getRange(1, headers.length + 1).setValue('Vai trò');
      headers.push('Vai trò');
      roleColIdx = headers.length - 1;
    }

    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(data.maNV).trim()) {
        sheet.getRange(i + 1, 2).setValue(data.hoTen);
        if (data.password) sheet.getRange(i + 1, 3).setValue(data.password);
        sheet.getRange(i + 1, roleColIdx + 1).setValue(data.vaiTro || 'Sản xuất');
        return { success: true, message: 'Cập nhật người dùng thành công!' };
      }
    }
    sheet.appendRow([data.maNV, data.hoTen, data.password, data.vaiTro || 'Sản xuất']);
    return { success: true, message: 'Thêm người dùng thành công!' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function deleteUser(maNV, currentUser) {
  if (!checkPermission(currentUser, 'USER_MANAGE')) return { success: false, message: 'Quyền truy cập bị từ chối!' };
  try {
    var sheet = getDb().getSheetByName('USER');
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(maNV).trim()) {
        sheet.deleteRow(i + 1);
        return { success: true, message: 'Đã xóa người dùng: ' + maNV };
      }
    }
  } catch (e) { return { success: false, message: e.toString() }; }
}

function savePushSubscription(subData) {
  try {
    var ss = getDb();
    var sheet = ss.getSheetByName('PUSH_SUBS');
    if (!sheet) {
      sheet = ss.insertSheet('PUSH_SUBS');
      sheet.appendRow(['Mã NV', 'Endpoint/Token', 'Trạng thái Push', 'Ngày cập nhật']);
    }

    var rows = sheet.getDataRange().getValues();
    var nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    var foundIndex = -1;

    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(subData.maNV).trim()) {
        foundIndex = i + 1;
        break;
      }
    }

    if (foundIndex > 0) {
      sheet.getRange(foundIndex, 2).setValue(subData.token || 'Browser-NativePush');
      sheet.getRange(foundIndex, 3).setValue(subData.status ? 'Bật' : 'Tắt');
      sheet.getRange(foundIndex, 4).setValue(nowStr);
    } else {
      sheet.appendRow([subData.maNV, subData.token || 'Browser-NativePush', subData.status ? 'Bật' : 'Tắt', nowStr]);
    }

    return { success: true, message: 'Đã lưu cấu hình thông báo Native thành công!' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function getMMTBPrintTemplate() {
  try {
    var files = DriveApp.getFilesByName('PE.QT09.F01 Template.xlsx');
    if (!files.hasNext()) return { success: false, message: 'Không tìm thấy PE.QT09.F01 Template.xlsx trên Drive.' };

    var file = files.next();
    return {
      success: true,
      name: file.getName(),
      base64: Utilities.base64Encode(file.getBlob().getBytes())
    };
  } catch (e) {
    return { success: false, message: 'Không đọc được mẫu in MTTB: ' + e.toString() };
  }
}

function createMMTBPrintFile(items) {
  var temporarySpreadsheetId = '';
  try {
    if (!Array.isArray(items) || items.length === 0) {
      return { success: false, message: 'Không có máy móc thiết bị phù hợp để in.' };
    }

    var templates = DriveApp.getFilesByName('PE.QT09.F01 Template.xlsx');
    if (!templates.hasNext()) return { success: false, message: 'Không tìm thấy PE.QT09.F01 Template.xlsx trên Drive.' };

    var templateFile = templates.next();
    var boundary = '----MEManager' + Utilities.getUuid().replace(/-/g, '');
    var metadata = {
      name: 'TEMP_MTTB_PRINT_' + new Date().getTime(),
      mimeType: 'application/vnd.google-apps.spreadsheet'
    };
    var startBytes = Utilities.newBlob(
      '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) + '\r\n--' + boundary + '\r\nContent-Type: ' +
      templateFile.getMimeType() + '\r\n\r\n'
    ).getBytes();
    var endBytes = Utilities.newBlob('\r\n--' + boundary + '--').getBytes();
    var payload = [];
    Array.prototype.push.apply(payload, startBytes);
    Array.prototype.push.apply(payload, templateFile.getBlob().getBytes());
    Array.prototype.push.apply(payload, endBytes);

    var token = ScriptApp.getOAuthToken();
    var convertResponse = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'post',
      contentType: 'multipart/related; boundary=' + boundary,
      payload: payload,
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });
    if (convertResponse.getResponseCode() < 200 || convertResponse.getResponseCode() >= 300) {
      throw new Error('Không chuyển được template Excel: ' + convertResponse.getContentText());
    }

    temporarySpreadsheetId = JSON.parse(convertResponse.getContentText()).id;
    var sheet = SpreadsheetApp.openById(temporarySpreadsheetId).getSheetByName('DSMMTB');
    if (!sheet) throw new Error('Template không có sheet DSMMTB.');

    var firstDataRow = 9;
    var originalLastDataRow = 30;
    var originalCapacity = originalLastDataRow - firstDataRow + 1;
    var extraRows = Math.max(0, items.length - originalCapacity);
    if (extraRows) {
      sheet.insertRowsBefore(31, extraRows);
      var lastColumn = sheet.getLastColumn();
      var sourceRow = sheet.getRange(originalLastDataRow, 1, 1, lastColumn);
      var sourceMerges = sourceRow.getMergedRanges().map(function(range) {
        return { column: range.getColumn(), width: range.getNumColumns() };
      });
      for (var offset = 1; offset <= extraRows; offset++) {
        var destinationRow = originalLastDataRow + offset;
        sourceRow.copyFormatToRange(sheet, 1, lastColumn, destinationRow, destinationRow);
        sourceMerges.forEach(function(merge) {
          sheet.getRange(destinationRow, merge.column, 1, merge.width).merge();
        });
      }
    }

    function printableText(value) {
      var text = value == null ? '' : String(value);
      return /^[=+\-@]/.test(text) ? "'" + text : text;
    }

    var rowCount = Math.max(originalCapacity, items.length);
    for (var index = 0; index < rowCount; index++) {
      var item = items[index] || {};
      var targetRow = firstDataRow + index;
      sheet.getRange(targetRow, 1).setValue(index < items.length ? index + 1 : '');
      sheet.getRange(targetRow, 3).setValue(printableText(item['Tên']));
      sheet.getRange(targetRow, 19).setValue(printableText(item['Mã']));
      sheet.getRange(targetRow, 24).setValue(printableText(item['Khu vực']));
      sheet.getRange(targetRow, 30).setValue(printableText(item['Ngày đưa vào sử dụng']));
    }
    sheet.getRange('AD6').setValue('Năm: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy'));
    SpreadsheetApp.flush();

    var exportUrl = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(temporarySpreadsheetId) +
      '/export?mimeType=' + encodeURIComponent('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    var exportResponse = UrlFetchApp.fetch(exportUrl, {
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });
    if (exportResponse.getResponseCode() < 200 || exportResponse.getResponseCode() >= 300) {
      throw new Error('Không xuất được file Excel từ template: ' + exportResponse.getContentText());
    }

    var fileName = 'Danh_muc_MTTB_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd') + '.xlsx';
    return {
      success: true,
      name: fileName,
      base64: Utilities.base64Encode(exportResponse.getBlob().getBytes())
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    if (temporarySpreadsheetId) {
      try { DriveApp.getFileById(temporarySpreadsheetId).setTrashed(true); } catch (cleanupError) {}
    }
  }
}

function getDb() {
  return SpreadsheetApp.openById("1AGGSMXLWjhTegh8H36I98pI0FI4D9Wy6YIa4bkI52rU");
}