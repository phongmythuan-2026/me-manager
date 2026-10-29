/**
 * Báo cáo sản xuất lấy dữ liệu từ Google Sheets.
 */
var PRODUCTION_REPORT_SPREADSHEET_ID = '1zBsXA36h8tFpvRwg-xZt5dfrzDMHnxR4TnhYs054rI4';
var PRODUCTION_REPORT_SHEET_NAME = 'BCSX';
var PRODUCTION_REPORT_NAME = 'Báo cáo sản xuất';

function getBaoCaoSanXuatFromGoogleSheets() {
  try {
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

    var values = sheet.getDataRange().getValues();
    if (!values.length) {
      return { success: true, data: [], columns: [], tableName: PRODUCTION_REPORT_NAME, source: 'Google Sheets' };
    }

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

    return {
      success: true,
      data: data,
      columns: columns.filter(function(column) { return Boolean(column); }),
      tableName: PRODUCTION_REPORT_NAME,
      source: 'Google Sheets'
    };
  } catch (error) {
    return {
      success: false,
      data: [],
      columns: [],
      message: 'Không đọc được file Google Sheets báo cáo sản xuất: ' + error.toString()
    };
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
