/**
 * ============================================================
 * Google Apps Script — انسخ هذا الكود إلى Google Apps Script
 * ============================================================
 * 
 * الخطوات:
 * 1. افتح Google Sheets جديد
 * 2. اذهب إلى Extensions > Apps Script
 * 3. احذف الكود الموجود والصق هذا الكود
 * 4. اضغط Deploy > Manage deployments > Edit > New version > Deploy
 * 5. اختر "Anyone" في Who has access
 * 6. انسخ الرابط وضعه في إعدادات التطبيق
 * 
 * الأوراق التي يتم إنشاؤها تلقائياً:
 * - Devices: معلومات الأجهزة المتصلة
 * - Events: سجل الأحداث
 * - Summary: ملخص يومي
 * - Releases: إدارة النسخ والتحديثات
 * - Licenses: إدارة التراخيص والتفعيلات
 */

// ============================================================
// POST — استقبال الأحداث + عمليات التراخيص
// ============================================================

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    
    // ── License actions ──
    if (data.action) {
      return handleLicensePost(data);
    }
    
    // ── Sync events ──
    var events = data.events || [];
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    var devicesSheet = getOrCreateSheet(ss, 'Devices', [
      'Device ID', 'First Seen', 'Last Seen', 'Platform', 'Screen', 'Language', 'Timezone', 'App Opens', 'Transfers', 'License Status'
    ]);
    
    var eventsSheet = getOrCreateSheet(ss, 'Events', [
      'Date', 'Time', 'Device ID', 'Event Type', 'Description', 'Details'
    ]);
    
    var summarySheet = getOrCreateSheet(ss, 'Summary', [
      'Date', 'New Devices', 'Active Devices', 'Transfers', 'Activations', 'Trial Expired'
    ]);
    
    for (var i = 0; i < events.length; i++) {
      var evt = events[i];
      
      var dateTime = new Date(evt.timestamp);
      var dateStr = Utilities.formatDate(dateTime, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      var timeStr = Utilities.formatDate(dateTime, Session.getScriptTimeZone(), 'HH:mm:ss');
      
      eventsSheet.appendRow([
        dateStr,
        timeStr,
        evt.deviceId,
        getEventName(evt.event),
        getEventDescription(evt.event, evt.data || {}),
        getExtraDetails(evt.event, evt.data || {})
      ]);
      
      updateDevice(devicesSheet, evt);
      updateSummary(summarySheet, evt, dateStr);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      received: events.length
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// GET — الحالة + النسخ + التحقق من التراخيص
// ============================================================

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = (e && e.parameter && e.parameter.action) || 'status';
    
    // ── Status ──
    if (action === 'status') {
      var devicesSheet = ss.getSheetByName('Devices');
      var eventsSheet = ss.getSheetByName('Events');
      var licensesSheet = ss.getSheetByName('Licenses');
      
      var totalDevices = devicesSheet ? Math.max(0, devicesSheet.getLastRow() - 1) : 0;
      var totalEvents = eventsSheet ? Math.max(0, eventsSheet.getLastRow() - 1) : 0;
      var totalLicenses = licensesSheet ? Math.max(0, licensesSheet.getLastRow() - 1) : 0;
      
      return jsonOut({
        success: true,
        totalDevices: totalDevices,
        totalEvents: totalEvents,
        totalLicenses: totalLicenses,
        lastUpdated: new Date().toISOString()
      });
    }
    
    // ── Latest Release ──
    if (action === 'getLatestRelease') {
      return handleGetLatestRelease(ss);
    }
    
    // ── License: verify ──
    if (action === 'verify') {
      return handleLicenseVerify(e.parameter.deviceId);
    }
    
    // ── License: list all ──
    if (action === 'list') {
      return handleLicenseList();
    }
    
    return jsonOut({ success: true, message: 'Sync endpoint active' });
    
  } catch (error) {
    return jsonOut({ success: false, error: error.message });
  }
}

// ============================================================
// Releases — إدارة النسخ والتحديثات
// ============================================================

function handleGetLatestRelease(ss) {
  var releasesSheet = ss.getSheetByName('Releases');
  if (!releasesSheet) {
    releasesSheet = ss.insertSheet('Releases');
    releasesSheet.appendRow(['Version', 'Download URL', 'Changelog', 'Release Date', 'Force Update']);
    releasesSheet.getRange(1, 1, 1, 5).setFontWeight('bold');
    releasesSheet.setFrozenRows(1);
    return jsonOut({ success: true, version: '', message: 'No releases yet' });
  }
  
  var lastRow = releasesSheet.getLastRow();
  if (lastRow <= 1) {
    return jsonOut({ success: true, version: '', message: 'No releases yet' });
  }
  
  var row = releasesSheet.getRange(lastRow, 1, 1, 5).getValues()[0];
  return jsonOut({
    success: true,
    version: row[0] || '',
    downloadUrl: row[1] || '',
    changelog: row[2] || '',
    releaseDate: row[3] || '',
    forceUpdate: row[4] === true || row[4] === 'TRUE' || row[4] === 'true'
  });
}

// ============================================================
// Licenses — إدارة التراخيص والتفعيلات
// ============================================================

function getLicensesSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Licenses');
  if (!sheet) {
    sheet = ss.insertSheet('Licenses');
    sheet.appendRow(['Device ID', 'License Key', 'Expiry Date', 'Status', 'Customer Name', 'Created At', 'Last Check']);
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
    sheet.setFrozenRows(1);
    // تنسيق الأعمدة
    sheet.setColumnWidth(1, 280);
    sheet.setColumnWidth(2, 200);
    sheet.setColumnWidth(3, 120);
    sheet.setColumnWidth(4, 80);
    sheet.setColumnWidth(5, 150);
    sheet.setColumnWidth(6, 120);
    sheet.setColumnWidth(7, 120);
  }
  return sheet;
}

function findLicenseByDeviceId(sheet, deviceId) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === deviceId) return { row: i + 1, data: data[i] };
  }
  return null;
}

function getTodayStr() {
  return Utilities.formatDate(new Date(), 'Asia/Damascus', 'yyyy-MM-dd');
}

// ── Verify license ──
function handleLicenseVerify(deviceId) {
  if (!deviceId) return jsonOut({ status: 'error', message: 'Missing deviceId' });
  
  var sheet = getLicensesSheet();
  var found = findLicenseByDeviceId(sheet, deviceId);
  
  if (!found) {
    return jsonOut({ status: 'not_found', message: 'الجهاز غير مسجل' });
  }
  
  var expiryDate = found.data[2];
  var status = found.data[3];
  var customerName = found.data[4];
  
  // Update lastCheck
  sheet.getRange(found.row, 7).setValue(getTodayStr());
  
  if (status === 'revoked') {
    return jsonOut({ status: 'revoked', message: 'تم إلغاء الترخيص' });
  }
  
  if (expiryDate !== 'permanent') {
    var today = getTodayStr();
    if (today > String(expiryDate)) {
      sheet.getRange(found.row, 4).setValue('expired');
      return jsonOut({ status: 'expired', message: 'انتهت صلاحية الترخيص', expiryDate: expiryDate });
    }
  }
  
  return jsonOut({ 
    status: 'active', 
    expiryDate: expiryDate,
    customerName: customerName || '',
    message: 'الترخيص فعّال'
  });
}

// ── License POST actions (register, revoke, reactivate, extend) ──
function handleLicensePost(body) {
  var action = body.action;
  
  if (action === 'register') {
    return handleLicenseRegister(body);
  }
  if (action === 'revoke') {
    return handleLicenseRevoke(body.deviceId);
  }
  if (action === 'reactivate') {
    return handleLicenseReactivate(body.deviceId);
  }
  if (action === 'extend') {
    return handleLicenseExtend(body.deviceId, body.expiryDate);
  }
  
  return jsonOut({ success: false, message: 'Unknown license action: ' + action });
}

function handleLicenseRegister(body) {
  var deviceId = body.deviceId;
  var licenseKey = body.licenseKey || '';
  var expiryDate = body.expiryDate;
  var customerName = body.customerName || '';
  
  if (!deviceId || !expiryDate) {
    return jsonOut({ success: false, message: 'Missing required fields' });
  }
  
  var sheet = getLicensesSheet();
  var existing = findLicenseByDeviceId(sheet, deviceId);
  
  if (existing) {
    sheet.getRange(existing.row, 2).setValue(licenseKey);
    sheet.getRange(existing.row, 3).setValue(expiryDate);
    sheet.getRange(existing.row, 4).setValue('active');
    sheet.getRange(existing.row, 5).setValue(customerName);
    sheet.getRange(existing.row, 7).setValue(getTodayStr());
    return jsonOut({ success: true, message: 'تم تحديث الترخيص' });
  }
  
  sheet.appendRow([
    deviceId,
    licenseKey,
    expiryDate,
    'active',
    customerName,
    getTodayStr(),
    getTodayStr()
  ]);
  
  return jsonOut({ success: true, message: 'تم تسجيل الترخيص بنجاح' });
}

function handleLicenseRevoke(deviceId) {
  if (!deviceId) return jsonOut({ success: false, message: 'Missing deviceId' });
  
  var sheet = getLicensesSheet();
  var found = findLicenseByDeviceId(sheet, deviceId);
  if (!found) return jsonOut({ success: false, message: 'الجهاز غير موجود' });
  
  sheet.getRange(found.row, 4).setValue('revoked');
  sheet.getRange(found.row, 7).setValue(getTodayStr());
  return jsonOut({ success: true, message: 'تم إلغاء الترخيص' });
}

function handleLicenseReactivate(deviceId) {
  if (!deviceId) return jsonOut({ success: false, message: 'Missing deviceId' });
  
  var sheet = getLicensesSheet();
  var found = findLicenseByDeviceId(sheet, deviceId);
  if (!found) return jsonOut({ success: false, message: 'الجهاز غير موجود' });
  
  sheet.getRange(found.row, 4).setValue('active');
  sheet.getRange(found.row, 7).setValue(getTodayStr());
  return jsonOut({ success: true, message: 'تم إعادة تفعيل الترخيص' });
}

function handleLicenseExtend(deviceId, newExpiryDate) {
  if (!deviceId || !newExpiryDate) {
    return jsonOut({ success: false, message: 'Missing fields' });
  }
  
  var sheet = getLicensesSheet();
  var found = findLicenseByDeviceId(sheet, deviceId);
  if (!found) return jsonOut({ success: false, message: 'الجهاز غير موجود' });
  
  sheet.getRange(found.row, 3).setValue(newExpiryDate);
  sheet.getRange(found.row, 4).setValue('active');
  sheet.getRange(found.row, 7).setValue(getTodayStr());
  return jsonOut({ success: true, message: 'تم تمديد الترخيص' });
}

// ── List all licenses ──
function handleLicenseList() {
  var sheet = getLicensesSheet();
  var data = sheet.getDataRange().getValues();
  var licenses = [];
  
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    licenses.push({
      deviceId: data[i][0],
      licenseKey: data[i][1],
      expiryDate: data[i][2],
      status: data[i][3],
      customerName: data[i][4],
      createdAt: data[i][5],
      lastCheck: data[i][6]
    });
  }
  
  return jsonOut({ success: true, licenses: licenses });
}

// ============================================================
// Events helpers
// ============================================================

function getEventName(event) {
  var names = {
    'device_register': 'Device Register',
    'app_open': 'App Open',
    'heartbeat': 'Heartbeat',
    'trial_started': 'Trial Started',
    'trial_expired': 'Trial Expired',
    'license_activated': 'License Activated',
    'license_expired': 'License Expired',
    'transfer': 'Transfer',
    'settings_changed': 'Settings Changed'
  };
  return names[event] || event;
}

function getEventDescription(event, data) {
  switch (event) {
    case 'device_register':
      return (data.platform || 'Unknown') + ' - ' + (data.language || '');
    case 'app_open':
      return 'App opened';
    case 'heartbeat':
      return 'Device active';
    case 'trial_started':
      return 'Trial started';
    case 'trial_expired':
      return 'Trial expired';
    case 'license_activated':
      var expiry = data.expiryDate || '';
      return expiry === 'permanent' ? 'Permanent license' : 'Licensed until ' + expiry;
    case 'license_expired':
      return 'License expired';
    case 'transfer':
      return (data.amount || '') + ' to ' + (data.phone || '') + ' (' + (data.operator || '') + ') - ' + (data.status || '');
    case 'settings_changed':
      return 'Settings changed';
    default:
      return event;
  }
}

function getExtraDetails(event, data) {
  switch (event) {
    case 'device_register':
      return 'Screen: ' + (data.screenWidth || '?') + 'x' + (data.screenHeight || '?') + ' | TZ: ' + (data.timezone || '');
    case 'transfer':
      return 'Operator: ' + (data.operator || '') + ' | Status: ' + (data.status || '');
    case 'heartbeat':
      return 'Version: ' + (data.appVersion || '') + ' | Online: ' + (data.online ? 'Yes' : 'No');
    default:
      return '';
  }
}

// ============================================================
// Shared helpers
// ============================================================

function jsonOut(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function updateDevice(sheet, evt) {
  var deviceId = evt.deviceId;
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === deviceId) {
      rowIndex = i + 1;
      break;
    }
  }
  
  var now = evt.timestamp;
  var evtData = evt.data || {};
  
  if (rowIndex === -1) {
    var platform = evtData.platform || '';
    var screen = evtData.screenWidth ? evtData.screenWidth + 'x' + evtData.screenHeight : '';
    var lang = evtData.language || '';
    var tz = evtData.timezone || '';
    
    sheet.appendRow([
      deviceId, now, now, platform, screen, lang, tz,
      evt.event === 'app_open' ? 1 : 0,
      evt.event === 'transfer' ? 1 : 0,
      getLicenseLabel(evt.event, evtData)
    ]);
  } else {
    sheet.getRange(rowIndex, 3).setValue(now);
    
    if (evt.event === 'app_open') {
      var opens = sheet.getRange(rowIndex, 8).getValue() || 0;
      sheet.getRange(rowIndex, 8).setValue(opens + 1);
    }
    
    if (evt.event === 'transfer') {
      var transfers = sheet.getRange(rowIndex, 9).getValue() || 0;
      sheet.getRange(rowIndex, 9).setValue(transfers + 1);
    }
    
    if (evt.event === 'license_activated') {
      var expiry = evtData.expiryDate || '';
      sheet.getRange(rowIndex, 10).setValue(expiry === 'permanent' ? 'PERMANENT' : 'Licensed until ' + expiry);
    } else if (evt.event === 'trial_expired' || evt.event === 'license_expired') {
      sheet.getRange(rowIndex, 10).setValue('EXPIRED');
    }
  }
}

function getLicenseLabel(event, data) {
  if (event === 'license_activated') {
    var expiry = data.expiryDate || '';
    return expiry === 'permanent' ? 'PERMANENT' : 'Licensed until ' + expiry;
  }
  return 'Trial';
}

function updateSummary(sheet, evt, dateStr) {
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  
  for (var i = 1; i < data.length; i++) {
    var rowDate = data[i][0];
    if (rowDate instanceof Date) {
      rowDate = Utilities.formatDate(rowDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    if (String(rowDate) === dateStr) {
      rowIndex = i + 1;
      break;
    }
  }
  
  if (rowIndex === -1) {
    sheet.appendRow([dateStr, 
      evt.event === 'device_register' ? 1 : 0,
      evt.event === 'app_open' ? 1 : 0,
      evt.event === 'transfer' ? 1 : 0,
      evt.event === 'license_activated' ? 1 : 0,
      evt.event === 'trial_expired' ? 1 : 0
    ]);
  } else {
    var colMap = {
      'device_register': 2,
      'app_open': 3,
      'transfer': 4,
      'license_activated': 5,
      'trial_expired': 6
    };
    
    var col = colMap[evt.event];
    if (col) {
      var val = sheet.getRange(rowIndex, col).getValue() || 0;
      sheet.getRange(rowIndex, col).setValue(val + 1);
    }
  }
}

// ============================================================
// بيانات تجريبية — شغّل هذه الدالة مرة واحدة
// ============================================================

function seedReleasesExample() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Releases');
  
  if (!sheet) {
    sheet = ss.insertSheet('Releases');
    sheet.appendRow(['Version', 'Download URL', 'Changelog', 'Release Date', 'Force Update']);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  
  var examples = [
    ['1.0.0', 'https://example.com/app-v1.0.0.apk', 'الإصدار الأول', '2025-01-01', false],
    ['1.1.0', 'https://example.com/app-v1.1.0.apk', 'إصلاح أخطاء وتحسين الأداء', '2025-02-15', false],
    ['2.0.0', 'https://example.com/app-v2.0.0.apk', 'واجهة جديدة بالكامل + ميزات متقدمة', '2025-03-08', true],
  ];
  
  for (var i = 0; i < examples.length; i++) {
    sheet.appendRow(examples[i]);
  }
  
  sheet.autoResizeColumns(1, 5);
  Logger.log('تم إضافة ' + examples.length + ' إصدارات تجريبية في ورقة Releases');
}

// ============================================================
// التنظيف التلقائي — حذف البيانات الأقدم من 3 أشهر
// ============================================================

function autoCleanup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - 3);
  
  cleanSheet(ss, 'Events', 0, cutoffDate);
  cleanSheet(ss, 'Summary', 0, cutoffDate);
  
  Logger.log('Cleanup completed. Cutoff: ' + cutoffDate.toISOString());
}

function cleanSheet(ss, sheetName, dateColIndex, cutoffDate) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() <= 1) return;
  
  var data = sheet.getDataRange().getValues();
  var rowsToDelete = [];
  
  for (var i = data.length - 1; i >= 1; i--) {
    var cellDate = data[i][dateColIndex];
    var rowDate;
    
    if (cellDate instanceof Date) {
      rowDate = cellDate;
    } else {
      rowDate = new Date(String(cellDate));
    }
    
    if (!isNaN(rowDate.getTime()) && rowDate < cutoffDate) {
      rowsToDelete.push(i + 1);
    }
  }
  
  for (var j = 0; j < rowsToDelete.length; j++) {
    sheet.deleteRow(rowsToDelete[j]);
  }
  
  Logger.log('Cleaned ' + sheetName + ': deleted ' + rowsToDelete.length + ' rows');
}