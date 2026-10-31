/**
 * Báo cáo sản xuất lấy dữ liệu từ Google Sheets.
 */
var PRODUCTION_REPORT_SPREADSHEET_ID = '1zBsXA36h8tFpvRwg-xZt5dfrzDMHnxR4TnhYs054rI4';
var PRODUCTION_REPORT_SHEET_NAME = 'BCSX';
var PRODUCTION_REPORT_NAME = 'Báo cáo sản xuất';
var PRODUCTION_REPORT_CACHE_KEY = 'production-report-v1';
var PRODUCTION_REPORT_CACHE_TTL_SECONDS = 60;
var PRODUCTION_REPORT_CACHE_CHUNK_SIZE = 80000;

function getBaoCaoSanXuatFromGoogleSheets() {
  try {
    var cachedReport = getCachedProductionReport();
    if (cachedReport) return cachedReport;

    var spreadsheet = SpreadsheetApp.openById(PRODUCTION_REPORT_SPREADSHEET_ID);
    var sheet = spreadsheet.getSheetByName(PRODUCTION_REPORT_SHEET_NAME);
    if (!sheet) {
      return {
        success: false,
        data: [],
        columns: [],
        message: 'Không tìm thấy trang tính "' + PRODUCTION_REPORT_SHEET_NAME + '" trong file báo cáo sản xuất.'
      };
    }

    var lastRow = sheet.getLastRow();
    var lastColumn = sheet.getLastColumn();
    if (!lastRow || !lastColumn) {
      var emptyReport = { success: true, data: [], columns: [], tableName: PRODUCTION_REPORT_NAME, source: 'Google Sheets' };
      cacheProductionReport(emptyReport);
      return emptyReport;
    }

    var values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
    var columns = values[0].map(function(header) {
      return String(header == null ? '' : header).trim();
    });
    var data = [];
    for (var rowIndex = 1; rowIndex < values.length; rowIndex++) {
      var sourceRow = values[rowIndex];
      var row = {};
      var hasValue = false;
      columns.forEach(function(column, columnIndex) {
        if (!column) return;
        var value = sourceRow[columnIndex];
        if (value !== '' && value !== null && value !== undefined) hasValue = true;
        if (value instanceof Date && !isNaN(value.getTime())) {
          value = Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
        }
        row[column] = value == null ? '' : value;
      });
      if (hasValue) data.push(row);
    }

    var report = {
      success: true,
      data: data,
      columns: columns.filter(function(column) { return Boolean(column); }),
      tableName: PRODUCTION_REPORT_NAME,
      source: 'Google Sheets'
    };
    cacheProductionReport(report);
    return report;
  } catch (error) {
    return {
      success: false,
      data: [],
      columns: [],
      message: 'Không đọc được file Google Sheets báo cáo sản xuất: ' + error.toString()
    };
  }
}

function getCachedProductionReport() {
  try {
    var cache = CacheService.getScriptCache();
    var manifestValue = cache.get(PRODUCTION_REPORT_CACHE_KEY);
    if (!manifestValue) return null;

    var manifest = JSON.parse(manifestValue);
    if (!manifest.generation || !manifest.chunkCount || manifest.chunkCount < 1) return null;
    var keys = [];
    for (var index = 0; index < manifest.chunkCount; index++) {
      keys.push(PRODUCTION_REPORT_CACHE_KEY + ':' + manifest.generation + ':' + index);
    }

    var chunks = cache.getAll(keys);
    var encoded = keys.map(function(key) { return chunks[key] || ''; }).join('');
    if (keys.some(function(key) { return !chunks[key]; })) return null;
    var compressed = Utilities.base64Decode(encoded);
    var json = Utilities.ungzip(Utilities.newBlob(compressed)).getDataAsString('UTF-8');
    var report = JSON.parse(json);
    return report && report.success && Array.isArray(report.data) ? report : null;
  } catch (error) {
    Logger.log('Không đọc được cache báo cáo sản xuất: ' + error.toString());
    return null;
  }
}

function cacheProductionReport(report) {
  try {
    var cache = CacheService.getScriptCache();
    var compressed = Utilities.gzip(Utilities.newBlob(JSON.stringify(report), 'application/json'));
    var encoded = Utilities.base64Encode(compressed.getBytes());
    var generation = Utilities.getUuid().replace(/-/g, '');
    var chunkCount = Math.ceil(encoded.length / PRODUCTION_REPORT_CACHE_CHUNK_SIZE);
    var chunks = {};
    for (var index = 0; index < chunkCount; index++) {
      var key = PRODUCTION_REPORT_CACHE_KEY + ':' + generation + ':' + index;
      chunks[key] = encoded.substring(index * PRODUCTION_REPORT_CACHE_CHUNK_SIZE, (index + 1) * PRODUCTION_REPORT_CACHE_CHUNK_SIZE);
    }

    cache.putAll(chunks, PRODUCTION_REPORT_CACHE_TTL_SECONDS);
    cache.put(PRODUCTION_REPORT_CACHE_KEY, JSON.stringify({
      generation: generation,
      chunkCount: chunkCount
    }), PRODUCTION_REPORT_CACHE_TTL_SECONDS);
  } catch (error) {
    Logger.log('Không thể lưu cache báo cáo sản xuất: ' + error.toString());
  }
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
