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
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
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

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = (e && e.parameter && e.parameter.action) || 'status';
    
    if (action === 'status') {
      var devicesSheet = ss.getSheetByName('Devices');
      var eventsSheet = ss.getSheetByName('Events');
      
      var totalDevices = devicesSheet ? Math.max(0, devicesSheet.getLastRow() - 1) : 0;
      var totalEvents = eventsSheet ? Math.max(0, eventsSheet.getLastRow() - 1) : 0;
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        totalDevices: totalDevices,
        totalEvents: totalEvents,
        lastUpdated: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Sync endpoint active'
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
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
