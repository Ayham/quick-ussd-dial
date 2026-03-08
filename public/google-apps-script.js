/**
 * ============================================================
 * Google Apps Script — انسخ هذا الكود إلى Google Apps Script
 * ============================================================
 * 
 * الخطوات:
 * 1. افتح Google Sheets جديد
 * 2. اذهب إلى Extensions > Apps Script
 * 3. احذف الكود الموجود والصق هذا الكود
 * 4. اضغط Deploy > New deployment > Web app
 * 5. اختر "Anyone" في Who has access
 * 6. انسخ الرابط وضعه في إعدادات التطبيق
 * 
 * سيتم إنشاء 3 أوراق تلقائياً:
 * - الأجهزة: معلومات الأجهزة المسجلة
 * - السجل: كل الأحداث والعمليات (مفصّل وواضح)
 * - ملخص يومي: ملخص يومي
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var events = data.events || [];
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // إنشاء الأوراق إذا لم تكن موجودة
    var devicesSheet = getOrCreateSheet(ss, 'الأجهزة', [
      'معرف الجهاز', 'أول ظهور', 'آخر ظهور', 'المنصة', 'الشاشة', 'اللغة', 'المنطقة الزمنية', 'عدد الفتحات', 'عدد التحويلات', 'حالة الترخيص'
    ]);
    
    var eventsSheet = getOrCreateSheet(ss, 'السجل', [
      'التاريخ', 'الوقت', 'معرف الجهاز', 'نوع الحدث', 'الوصف', 'تفاصيل إضافية'
    ]);
    
    var summarySheet = getOrCreateSheet(ss, 'ملخص يومي', [
      'التاريخ', 'أجهزة جديدة', 'أجهزة نشطة', 'تحويلات', 'تفعيلات', 'انتهاء تجريبي'
    ]);
    
    for (var i = 0; i < events.length; i++) {
      var evt = events[i];
      
      // تسجيل الحدث بشكل مقروء
      var dateTime = new Date(evt.timestamp);
      var dateStr = Utilities.formatDate(dateTime, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      var timeStr = Utilities.formatDate(dateTime, Session.getScriptTimeZone(), 'HH:mm:ss');
      
      var eventDesc = getEventDescription(evt.event, evt.data);
      var extraDetails = getExtraDetails(evt.event, evt.data);
      
      eventsSheet.appendRow([
        dateStr,
        timeStr,
        evt.deviceId,
        getEventArabicName(evt.event),
        eventDesc,
        extraDetails
      ]);
      
      // تحديث بيانات الجهاز
      updateDevice(devicesSheet, evt);
      
      // تحديث الملخص اليومي
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

// ترجمة اسم الحدث للعربية
function getEventArabicName(event) {
  var names = {
    'device_register': 'تسجيل جهاز',
    'app_open': 'فتح التطبيق',
    'heartbeat': 'نبض',
    'trial_started': 'بدء تجريبي',
    'trial_expired': 'انتهاء تجريبي',
    'license_activated': 'تفعيل ترخيص',
    'license_expired': 'انتهاء ترخيص',
    'transfer': 'تحويل رصيد',
    'settings_changed': 'تغيير إعدادات'
  };
  return names[event] || event;
}

// وصف مقروء للحدث
function getEventDescription(event, data) {
  switch (event) {
    case 'device_register':
      return 'جهاز جديد — ' + (data.platform || 'غير معروف') + ' — ' + (data.language || '');
    case 'app_open':
      return 'تم فتح التطبيق';
    case 'heartbeat':
      return 'الجهاز متصل ونشط';
    case 'trial_started':
      return 'بدأت الفترة التجريبية';
    case 'trial_expired':
      return 'انتهت الفترة التجريبية';
    case 'license_activated':
      var expiry = data.expiryDate || '';
      return expiry === 'permanent' ? 'تم التفعيل — ترخيص دائم ✨' : 'تم التفعيل حتى ' + expiry;
    case 'license_expired':
      return 'انتهت صلاحية الترخيص';
    case 'transfer':
      return 'تحويل ' + (data.amount || '') + ' إلى ' + (data.phone || '') + ' (' + (data.operator || '') + ') — ' + (data.status || '');
    case 'settings_changed':
      return 'تم تغيير الإعدادات';
    default:
      return event;
  }
}

// تفاصيل إضافية
function getExtraDetails(event, data) {
  switch (event) {
    case 'device_register':
      return 'شاشة: ' + (data.screenWidth || '?') + 'x' + (data.screenHeight || '?') + ' | منطقة: ' + (data.timezone || '');
    case 'transfer':
      return 'مشغل: ' + (data.operator || '') + ' | حالة: ' + (data.status || '');
    case 'heartbeat':
      return 'إصدار: ' + (data.appVersion || '') + ' | متصل: ' + (data.online ? 'نعم' : 'لا');
    default:
      return '';
  }
}

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var action = (e.parameter && e.parameter.action) || 'status';
  
  if (action === 'status') {
    var devicesSheet = ss.getSheetByName('الأجهزة');
    var eventsSheet = ss.getSheetByName('السجل');
    
    var totalDevices = devicesSheet ? Math.max(0, devicesSheet.getLastRow() - 1) : 0;
    var totalEvents = eventsSheet ? Math.max(0, eventsSheet.getLastRow() - 1) : 0;
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      totalDevices: totalDevices,
      totalEvents: totalEvents,
      lastUpdated: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === 'devices') {
    var devicesSheet = ss.getSheetByName('الأجهزة');
    if (!devicesSheet) {
      return ContentService.createTextOutput(JSON.stringify({ success: true, devices: [] }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var data = devicesSheet.getDataRange().getValues();
    var headers = data[0];
    var devices = [];
    
    for (var i = 1; i < data.length; i++) {
      var device = {};
      for (var j = 0; j < headers.length; j++) {
        device[headers[j]] = data[i][j];
      }
      devices.push(device);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      devices: devices
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    success: false,
    error: 'Unknown action'
  })).setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.getRange(1, 1, 1, headers.length).setBackground('#4285f4');
    sheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    // Auto-resize columns
    for (var i = 1; i <= headers.length; i++) {
      sheet.setColumnWidth(i, 150);
    }
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
  
  if (rowIndex === -1) {
    // جهاز جديد
    var platform = (evt.data && evt.data.platform) || '';
    var screen = (evt.data && evt.data.screenWidth) ? evt.data.screenWidth + 'x' + evt.data.screenHeight : '';
    var lang = (evt.data && evt.data.language) || '';
    var tz = (evt.data && evt.data.timezone) || '';
    
    sheet.appendRow([
      deviceId, now, now, platform, screen, lang, tz,
      evt.event === 'app_open' ? 1 : 0,
      evt.event === 'transfer' ? 1 : 0,
      getLicenseStatus(evt.event, evt.data)
    ]);
  } else {
    // تحديث جهاز موجود
    sheet.getRange(rowIndex, 3).setValue(now); // آخر ظهور
    
    if (evt.event === 'app_open') {
      var opens = sheet.getRange(rowIndex, 8).getValue() || 0;
      sheet.getRange(rowIndex, 8).setValue(opens + 1);
    }
    
    if (evt.event === 'transfer') {
      var transfers = sheet.getRange(rowIndex, 9).getValue() || 0;
      sheet.getRange(rowIndex, 9).setValue(transfers + 1);
    }
    
    if (evt.event === 'license_activated') {
      var expiry = (evt.data && evt.data.expiryDate) || '';
      sheet.getRange(rowIndex, 10).setValue(expiry === 'permanent' ? 'مفعّل دائم ✨' : 'مفعّل حتى ' + expiry);
    } else if (evt.event === 'trial_expired' || evt.event === 'license_expired') {
      sheet.getRange(rowIndex, 10).setValue('منتهي ❌');
    }
  }
}

function getLicenseStatus(event, data) {
  if (event === 'license_activated') {
    var expiry = (data && data.expiryDate) || '';
    return expiry === 'permanent' ? 'مفعّل دائم ✨' : 'مفعّل حتى ' + expiry;
  }
  return 'تجريبي';
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
