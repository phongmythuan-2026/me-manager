/**
 * Báo cáo sản xuất được frontend đọc từ JSON theo tháng trên Google Drive.
 */
var PRODUCTION_REPORT_DRIVE_FOLDER_ID = '1GpB1e3P7xlJq0pZHVo7uNV7bqiwEc7Mt';
var PRODUCTION_REPORT_SOURCE_FILE_NAME = 'PEROMA-BC Sản xuất 2026.xlsx';
var PRODUCTION_REPORT_JSON_PREFIX = 'bc_san_xuat_';
var PRODUCTION_REPORT_SYNC_CONFIG_FILE_NAME = 'bc_san_xuat_sync_config.json';
var PRODUCTION_REPORT_NAME = 'Báo cáo sản xuất';

function getBaoCaoSanXuatFromGoogleSheets() {
  return getBaoCaoSanXuatFromJson('', '');
}

function getBaoCaoSanXuatFromJson(startDate, endDate) {
  try {
    var range = normalizeProductionReportRange_(startDate, endDate);
    var requestedMonths = range ? getProductionReportMonthKeys_(range.start, range.end) : null;
    var folder = DriveApp.getFolderById(PRODUCTION_REPORT_DRIVE_FOLDER_ID);
    var files = folder.getFiles();
    var rows = [];
    var columns = [];

    while (files.hasNext()) {
      var file = files.next();
      var match = file.getName().match(/^bc_san_xuat_(\d{4})_(\d{2})\.json$/);
      if (!match || requestedMonths && requestedMonths.indexOf(match[1] + '_' + match[2]) === -1) continue;

      var reportMonth = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
      var monthRows = Array.isArray(reportMonth) ? reportMonth : reportMonth.data;
      if (!Array.isArray(monthRows)) {
        throw new Error('Dữ liệu JSON không hợp lệ trong file ' + file.getName() + '.');
      }
      var monthColumns = Array.isArray(reportMonth.columns) ? reportMonth.columns : [];
      monthColumns.forEach(function(column) {
        var label = String(column == null ? '' : column).trim();
        if (label && columns.indexOf(label) === -1) columns.push(label);
      });
      monthRows.forEach(function(row) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return;
        if (range) {
          var rowDate = getProductionReportRowDate_(row, columns);
          if (!rowDate || rowDate < range.start || rowDate > range.end) return;
        }
        rows.push(row);
      });
    }

    return {
      success: true,
      data: rows,
      columns: columns,
      tableName: PRODUCTION_REPORT_NAME,
      source: 'Google Drive JSON'
    };
  } catch (error) {
    return {
      success: false,
      data: [],
      columns: [],
      message: 'Không đọc được dữ liệu JSON báo cáo sản xuất: ' + error.toString()
    };
  }
}

function normalizeProductionReportRange_(startDate, endDate) {
  var start = String(startDate || '').trim();
  var end = String(endDate || '').trim();
  if (!start && !end) return null;
  if (!isProductionReportDate_(start) || !isProductionReportDate_(end) || start > end) {
    throw new Error('Khoảng ngày xem báo cáo không hợp lệ.');
  }
  return { start: start, end: end };
}

function isProductionReportDate_(value) {
  var match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match || Number(match[1]) < 1900) return false;
  var date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd') === value;
}

function getProductionReportMonthKeys_(startDate, endDate) {
  var startYear = Number(startDate.slice(0, 4));
  var startMonth = Number(startDate.slice(5, 7)) - 1;
  var endYear = Number(endDate.slice(0, 4));
  var endMonth = Number(endDate.slice(5, 7)) - 1;
  var monthCount = (endYear - startYear) * 12 + endMonth - startMonth + 1;
  if (monthCount > 120) throw new Error('Khoảng thời gian báo cáo không được vượt quá 120 tháng.');
  var keys = [];
  var cursor = new Date(Date.UTC(startYear, startMonth, 1));
  var last = new Date(Date.UTC(endYear, endMonth, 1));
  while (cursor <= last) {
    keys.push(Utilities.formatDate(cursor, 'UTC', 'yyyy_MM'));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}

function normalizeProductionReportLabel_(value) {
  return String(value == null ? '' : value).normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getProductionReportRowDate_(row, columns) {
  var keys = Object.keys(row);
  var preferred = ['Từ giờ', 'Ngày SX', 'Ngày sản xuất', 'Ngày hoàn thành', 'Ngày bắt đầu', 'Ngày'];
  var preferredNormalized = preferred.map(normalizeProductionReportLabel_);
  var candidateKeys = [];

  preferredNormalized.forEach(function(label) {
    var match = keys.find(function(key) {
      return normalizeProductionReportLabel_(key) === label;
    });
    if (match && candidateKeys.indexOf(match) === -1) candidateKeys.push(match);
  });
  keys.forEach(function(key) {
    if (candidateKeys.indexOf(key) === -1) {
      var label = normalizeProductionReportLabel_(key);
      if (label.indexOf('ngay') !== -1 || label.indexOf('date') !== -1 || label.indexOf('thoigian') !== -1) {
        candidateKeys.push(key);
      }
    }
  });

  for (var index = 0; index < candidateKeys.length; index++) {
    var value = row[candidateKeys[index]];
    if (value instanceof Date && !isNaN(value.getTime())) {
      return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    if (typeof value === 'number' && isFinite(value) && value > 20000 && value < 80000) {
      return Utilities.formatDate(new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000), 'UTC', 'yyyy-MM-dd');
    }
    var text = String(value == null ? '' : value).trim();
    var iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
    var local = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
    if (local) return local[3] + '-' + String(local[2]).padStart(2, '0') + '-' + String(local[1]).padStart(2, '0');
  }
  return '';
}

function findProductionReportJsonFile_(folder, monthKey) {
  var files = folder.getFilesByName(PRODUCTION_REPORT_JSON_PREFIX + monthKey + '.json');
  return files.hasNext() ? files.next() : null;
}

function readProductionReportMonth_(folder, monthKey) {
  var file = findProductionReportJsonFile_(folder, monthKey);
  if (!file) return { columns: [], data: [] };
  var parsed = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  if (!parsed || !Array.isArray(parsed.data) || !Array.isArray(parsed.columns)) {
    throw new Error('Dữ liệu JSON không đúng cấu trúc trong file ' + file.getName() + '.');
  }
  return parsed;
}

function writeProductionReportMonth_(folder, monthKey, columns, data) {
  var fileName = PRODUCTION_REPORT_JSON_PREFIX + monthKey + '.json';
  var content = JSON.stringify({ columns: columns, data: data });
  var existing = findProductionReportJsonFile_(folder, monthKey);
  if (existing) {
    existing.setContent(content);
  } else {
    folder.createFile(fileName, content, MimeType.PLAIN_TEXT);
  }
}

function bumpProductionReportJsonRevision_() {
  PropertiesService.getScriptProperties().setProperty('PRODUCTION_REPORT_JSON_REVISION', String(new Date().getTime()));
}

function importBaoCaoSanXuatToJson(payload, currentUser) {
  try {
    if (!getAuthenticatedAdminForProductionReport_(currentUser)) {
      return { success: false, message: 'Chỉ Admin có phiên đăng nhập hợp lệ mới được Import báo cáo.' };
    }
    if (!payload || !Array.isArray(payload.columns) || !Array.isArray(payload.data) ||
        payload.columns.length < 1 || payload.columns.length > 200 || payload.data.length > 50000) {
      return { success: false, message: 'Tệp Import không có cấu trúc hợp lệ hoặc vượt quá giới hạn.' };
    }
    var range = normalizeProductionReportRange_(payload.startDate, payload.endDate);
    if (!range) return { success: false, message: 'Vui lòng chọn Từ ngày và Đến ngày trước khi Import.' };
    var columns = payload.columns.map(function(column) { return String(column == null ? '' : column).trim(); });
    if (columns.some(function(column) { return !column; })) {
      return { success: false, message: 'Tệp Import có tiêu đề cột trống.' };
    }
    var normalizedColumns = columns.map(normalizeProductionReportLabel_);
    if (new Set(normalizedColumns).size !== normalizedColumns.length) {
      return { success: false, message: 'Tệp Import có tiêu đề cột bị trùng.' };
    }
    var dataByMonth = {};
    payload.data.forEach(function(row) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Tệp Import chứa dòng không hợp lệ.');
      var rowDate = getProductionReportRowDate_(row, columns);
      if (!rowDate || rowDate < range.start || rowDate > range.end) {
        throw new Error('Mọi dòng Import phải có ngày nằm trong khoảng đang chọn.');
      }
      var monthKey = rowDate.slice(0, 7).replace('-', '_');
      if (!dataByMonth[monthKey]) dataByMonth[monthKey] = [];
      dataByMonth[monthKey].push(row);
    });

    var folder = DriveApp.getFolderById(PRODUCTION_REPORT_DRIVE_FOLDER_ID);
    getProductionReportMonthKeys_(range.start, range.end).forEach(function(monthKey) {
      var existingFile = findProductionReportJsonFile_(folder, monthKey);
      if (!existingFile && !dataByMonth[monthKey]) return;
      var existing = readProductionReportMonth_(folder, monthKey);
      if (existing.columns.length && JSON.stringify(existing.columns) !== JSON.stringify(columns)) {
        throw new Error('Tiêu đề cột không khớp với dữ liệu tháng ' + monthKey.replace('_', '-') + '.');
      }
      var retained = existing.data.filter(function(row) {
        var rowDate = getProductionReportRowDate_(row, existing.columns);
        return !rowDate || rowDate < range.start || rowDate > range.end;
      });
      writeProductionReportMonth_(folder, monthKey, columns, retained.concat(dataByMonth[monthKey] || []));
    });
    bumpProductionReportJsonRevision_();
    return { success: true, message: 'Đã Import ' + payload.data.length + ' dòng vào JSON báo cáo sản xuất.' };
  } catch (error) {
    return { success: false, message: 'Không thể Import báo cáo sản xuất: ' + error.message };
  }
}

function deleteBaoCaoSanXuatDateRange(startDate, endDate, currentUser) {
  try {
    if (!getAuthenticatedAdminForProductionReport_(currentUser)) {
      return { success: false, message: 'Chỉ Admin có phiên đăng nhập hợp lệ mới được xóa dữ liệu báo cáo.' };
    }
    var range = normalizeProductionReportRange_(startDate, endDate);
    if (!range) return { success: false, message: 'Vui lòng chọn Từ ngày và Đến ngày.' };
    var folder = DriveApp.getFolderById(PRODUCTION_REPORT_DRIVE_FOLDER_ID);
    var removed = 0;
    getProductionReportMonthKeys_(range.start, range.end).forEach(function(monthKey) {
      if (!findProductionReportJsonFile_(folder, monthKey)) return;
      var report = readProductionReportMonth_(folder, monthKey);
      var retained = report.data.filter(function(row) {
        var rowDate = getProductionReportRowDate_(row, report.columns);
        return !rowDate || rowDate < range.start || rowDate > range.end;
      });
      removed += report.data.length - retained.length;
      writeProductionReportMonth_(folder, monthKey, report.columns, retained);
    });
    if (removed) bumpProductionReportJsonRevision_();
    return { success: true, message: 'Đã xóa ' + removed + ' dòng trong khoảng ngày đã chọn.' };
  } catch (error) {
    return { success: false, message: 'Không thể xóa dữ liệu báo cáo: ' + error.message };
  }
}

function getProductionReportSyncSettings(currentUser) {
  if (!getAuthenticatedAdminForProductionReport_(currentUser)) {
    return { success: false, message: 'Chỉ Admin có phiên đăng nhập hợp lệ mới được xem cấu hình đồng bộ.' };
  }
  var properties = PropertiesService.getScriptProperties();
  var config = readProductionReportSyncConfig_();
  return {
    success: true,
    settings: {
      enabled: config ? config.enabled : properties.getProperty('PRODUCTION_REPORT_SYNC_ENABLED') !== 'false',
      time: config ? config.time : properties.getProperty('PRODUCTION_REPORT_SYNC_TIME') || '02:00',
      lastRunAt: config ? config.lastRunAt || '' : properties.getProperty('PRODUCTION_REPORT_SYNC_LAST_RUN_AT') || ''
    }
  };
}

function saveProductionReportSyncSettings(settings, currentUser) {
  if (!getAuthenticatedAdminForProductionReport_(currentUser)) {
    return { success: false, message: 'Chỉ Admin có phiên đăng nhập hợp lệ mới được lưu cấu hình đồng bộ.' };
  }
  var time = String(settings && settings.time || '').trim();
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return { success: false, message: 'Giờ đồng bộ phải theo định dạng HH:mm.' };
  }
  var properties = PropertiesService.getScriptProperties();
  var enabled = settings.enabled === true ? 'true' : 'false';
  var scheduleChanged = properties.getProperty('PRODUCTION_REPORT_SYNC_TIME') !== time ||
    properties.getProperty('PRODUCTION_REPORT_SYNC_ENABLED') !== enabled;
  try {
    var previousConfig = readProductionReportSyncConfig_() || {};
    var config = {
      enabled: settings.enabled === true,
      time: time,
      lastRunDate: scheduleChanged ? '' : String(previousConfig.lastRunDate || ''),
      lastRunAt: String(previousConfig.lastRunAt || properties.getProperty('PRODUCTION_REPORT_SYNC_LAST_RUN_AT') || ''),
      updatedAt: new Date().toISOString()
    };
    writeProductionReportSyncConfig_(config);
    properties.setProperties({
      PRODUCTION_REPORT_SYNC_ENABLED: enabled,
      PRODUCTION_REPORT_SYNC_TIME: time
    }, false);
    if (scheduleChanged) properties.deleteProperty('PRODUCTION_REPORT_SYNC_LAST_RUN_DATE');
    return { success: true, message: 'Đã lưu lịch đồng bộ Báo cáo sản xuất.' };
  } catch (error) {
    return { success: false, message: 'Không thể lưu lịch đồng bộ Báo cáo sản xuất: ' + error.message };
  }
}

function readProductionReportSyncConfig_() {
  var folder = DriveApp.getFolderById(PRODUCTION_REPORT_DRIVE_FOLDER_ID);
  var files = folder.getFilesByName(PRODUCTION_REPORT_SYNC_CONFIG_FILE_NAME);
  if (!files.hasNext()) return null;
  var file = files.next();
  if (files.hasNext()) throw new Error('Có nhiều hơn một file cấu hình đồng bộ Báo cáo sản xuất trong Drive.');
  var config = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  if (!config || typeof config.enabled !== 'boolean' ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(config.time || ''))) {
    throw new Error('File cấu hình đồng bộ Báo cáo sản xuất không hợp lệ.');
  }
  return config;
}

function writeProductionReportSyncConfig_(config) {
  var folder = DriveApp.getFolderById(PRODUCTION_REPORT_DRIVE_FOLDER_ID);
  var files = folder.getFilesByName(PRODUCTION_REPORT_SYNC_CONFIG_FILE_NAME);
  if (files.hasNext()) {
    var file = files.next();
    if (files.hasNext()) throw new Error('Có nhiều hơn một file cấu hình đồng bộ Báo cáo sản xuất trong Drive.');
    file.setContent(JSON.stringify(config));
    return;
  }
  folder.createFile(PRODUCTION_REPORT_SYNC_CONFIG_FILE_NAME, JSON.stringify(config), MimeType.JSON);
}

function getProductionReportSyncConfigRevision_() {
  var folder = DriveApp.getFolderById(PRODUCTION_REPORT_DRIVE_FOLDER_ID);
  var files = folder.getFilesByName(PRODUCTION_REPORT_SYNC_CONFIG_FILE_NAME);
  if (!files.hasNext()) return '0';
  var file = files.next();
  if (files.hasNext()) throw new Error('Có nhiều hơn một file cấu hình đồng bộ Báo cáo sản xuất trong Drive.');
  return String(file.getLastUpdated().getTime());
}

function fetchSharePointTableData(tableKey) {
  if (tableKey !== 'BAO_CAO_SX') {
    return { success: false, data: [], columns: [], message: 'Không tìm thấy cấu hình báo cáo cho bảng: ' + tableKey };
  }
  return getBaoCaoSanXuatFromGoogleSheets();
}

function getBaoCaoSanXuatFromSharePoint() {
  return getBaoCaoSanXuatFromGoogleSheets();
}

function testKetNoiBaoCaoSanXuat() {
  var result = getBaoCaoSanXuatFromGoogleSheets();
  Logger.log('Kết quả kiểm tra báo cáo sản xuất: ' + JSON.stringify(result));
  return result;
}

function clearYeuCauAttachments(requestId, currentUser) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    var id = String(requestId || '').trim();
    if (!id) return { success: false, message: 'Thiếu mã yêu cầu.' };

    var sheet = findDatabaseSheet('YEU_CAU');
    if (!sheet) throw new Error('Không tìm thấy sheet YEU_CAU.');
    var values = sheet.getDataRange().getValues();
    var headers = values[0] || [];
    var idIndex = inventoryColumnIndex(headers, ['ID YC', 'ID']);
    var imageIndex = inventoryColumnIndex(headers, ['Hình ảnh yêu cầu', 'Hình ảnh']);
    if (idIndex === -1) throw new Error('Sheet YEU_CAU thiếu cột ID YC.');
    if (imageIndex === -1) throw new Error('Sheet YEU_CAU thiếu cột Hình ảnh yêu cầu.');

    var request = sheetToObjects('YEU_CAU').find(function(item) {
      return String(item.ID || '').trim() === id;
    });
    if (!checkPermission(currentUser, 'YEU_CAU_EDIT', request)) {
      return { success: false, message: 'Bạn không có quyền chỉnh sửa yêu cầu này.' };
    }

    for (var rowIndex = 1; rowIndex < values.length; rowIndex++) {
      if (String(values[rowIndex][idIndex]).trim() === id) {
        sheet.getRange(rowIndex + 1, imageIndex + 1).setValue('');
        return { success: true };
      }
    }
    return { success: false, message: 'Không tìm thấy yêu cầu #' + id + '.' };
  } catch (error) {
    return { success: false, message: error.toString() };
  } finally {
    lock.releaseLock();
  }
}
