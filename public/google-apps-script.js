/**
 * Google Apps Script — Copy this code to Google Apps Script
 *
 * Setup:
 * 1. Open a new Google Sheets
 * 2. Go to Extensions > Apps Script
 * 3. Delete existing code and paste this
 * 4. Deploy > Manage deployments > Edit > New version > Deploy
 * 5. Choose "Anyone" for Who has access
 * 6. Copy the URL and set it in the app settings
 *
 * Auto-created sheets:
 * - Devices: Connected device info
 * - Events: Event log
 * - Summary: Daily summary
 * - Releases: App version management
 * - Licenses: License management
 */

// ============================================================
// POST — Receive events + license/release actions
// ============================================================

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    if (data.action) {
      if (data.action === 'addRelease' || data.action === 'deleteRelease') {
        return handleReleasePost(data);
      }
      return handleLicensePost(data);
    }

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
        dateStr, timeStr, evt.deviceId,
        getEventName(evt.event),
        getEventDescription(evt.event, evt.data || {}),
        getExtraDetails(evt.event, evt.data || {})
      ]);

      updateDevice(devicesSheet, evt);
      updateSummary(summarySheet, evt, dateStr);
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: true, received: events.length
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false, error: error.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// GET — Status, releases, license verification
// ============================================================

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = (e && e.parameter && e.parameter.action) || 'status';

    if (action === 'status') {
      var devicesSheet = ss.getSheetByName('Devices');
      var eventsSheet = ss.getSheetByName('Events');
      var licensesSheet = ss.getSheetByName('Licenses');

      return jsonOut({
        success: true,
        totalDevices: devicesSheet ? Math.max(0, devicesSheet.getLastRow() - 1) : 0,
        totalEvents: eventsSheet ? Math.max(0, eventsSheet.getLastRow() - 1) : 0,
        totalLicenses: licensesSheet ? Math.max(0, licensesSheet.getLastRow() - 1) : 0,
        lastUpdated: new Date().toISOString()
      });
    }

    if (action === 'getLatestRelease') {
      return handleGetLatestRelease(ss);
    }

    if (action === 'listReleases') {
      return handleListReleases(ss);
    }

    if (action === 'verify') {
      return handleLicenseVerify(e.parameter.deviceId);
    }

    if (action === 'list') {
      return handleLicenseList();
    }

    return jsonOut({ success: true, message: 'Sync endpoint active' });

  } catch (error) {
    return jsonOut({ success: false, error: error.message });
  }
}

// ============================================================
// Releases
// ============================================================

function getReleasesSheet(ss) {
  var sheet = ss.getSheetByName('Releases');
  if (!sheet) {
    sheet = ss.insertSheet('Releases');
    sheet.appendRow(['Version', 'Download URL', 'Changelog', 'Release Date', 'Force Update']);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function handleGetLatestRelease(ss) {
  var sheet = getReleasesSheet(ss);
  var lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return jsonOut({ success: true, version: '', message: 'No releases yet' });
  }

  var row = sheet.getRange(lastRow, 1, 1, 5).getValues()[0];
  return jsonOut({
    success: true,
    version: row[0] || '',
    downloadUrl: row[1] || '',
    changelog: row[2] || '',
    releaseDate: row[3] || '',
    forceUpdate: row[4] === true || row[4] === 'TRUE' || row[4] === 'true'
  });
}

function handleListReleases(ss) {
  var sheet = getReleasesSheet(ss);
  var lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return jsonOut({ success: true, releases: [] });
  }

  var data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  var releases = [];

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    releases.push({
      id: 'r-' + (i + 2),
      version: row[0] || '',
      downloadUrl: row[1] || '',
      changelog: row[2] || '',
      releaseDate: row[3] instanceof Date
        ? Utilities.formatDate(row[3], Session.getScriptTimeZone(), 'yyyy-MM-dd')
        : String(row[3] || ''),
      isLatest: i === data.length - 1
    });
  }

  releases.reverse();
  return jsonOut({ success: true, releases: releases });
}

function handleReleasePost(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getReleasesSheet(ss);

  if (body.action === 'addRelease') {
    if (!body.version || !body.downloadUrl) {
      return jsonOut({ success: false, message: 'Missing version or downloadUrl' });
    }
    sheet.appendRow([
      body.version,
      body.downloadUrl,
      body.changelog || '',
      body.releaseDate || getTodayStr(),
      body.forceUpdate === true ? true : false
    ]);
    return jsonOut({ success: true, message: 'Release ' + body.version + ' added' });
  }

  if (body.action === 'deleteRelease') {
    if (!body.version) {
      return jsonOut({ success: false, message: 'Missing version' });
    }
    var data = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) === String(body.version)) {
        sheet.deleteRow(i + 1);
        return jsonOut({ success: true, message: 'Release ' + body.version + ' deleted' });
      }
    }
    return jsonOut({ success: false, message: 'Release not found' });
  }

  return jsonOut({ success: false, message: 'Unknown release action' });
}

// ============================================================
// Licenses
// ============================================================

function getLicensesSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Licenses');
  if (!sheet) {
    sheet = ss.insertSheet('Licenses');
    sheet.appendRow(['Device ID', 'License Key', 'Expiry Date', 'Status', 'Customer Name', 'Created At', 'Last Check']);
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
    sheet.setFrozenRows(1);
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

function handleLicenseVerify(deviceId) {
  if (!deviceId) return jsonOut({ status: 'error', message: 'Missing deviceId' });

  var sheet = getLicensesSheet();
  var found = findLicenseByDeviceId(sheet, deviceId);

  if (!found) {
    return jsonOut({ status: 'not_found', message: 'Device not registered' });
  }

  var expiryDate = found.data[2];
  var status = found.data[3];
  var customerName = found.data[4];

  sheet.getRange(found.row, 7).setValue(getTodayStr());

  if (status === 'revoked') {
    return jsonOut({ status: 'revoked', message: 'License revoked' });
  }

  if (expiryDate !== 'permanent') {
    var today = getTodayStr();
    if (today > String(expiryDate)) {
      sheet.getRange(found.row, 4).setValue('expired');
      return jsonOut({ status: 'expired', message: 'License expired', expiryDate: expiryDate });
    }
  }

  return jsonOut({
    status: 'active',
    expiryDate: expiryDate,
    customerName: customerName || '',
    message: 'License active'
  });
}

function handleLicensePost(body) {
  var action = body.action;

  if (action === 'register') return handleLicenseRegister(body);
  if (action === 'revoke') return handleLicenseRevoke(body.deviceId);
  if (action === 'reactivate') return handleLicenseReactivate(body.deviceId);
  if (action === 'extend') return handleLicenseExtend(body.deviceId, body.expiryDate);

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
    return jsonOut({ success: true, message: 'License updated' });
  }

  sheet.appendRow([
    deviceId, licenseKey, expiryDate, 'active', customerName, getTodayStr(), getTodayStr()
  ]);
  return jsonOut({ success: true, message: 'License registered' });
}

function handleLicenseRevoke(deviceId) {
  if (!deviceId) return jsonOut({ success: false, message: 'Missing deviceId' });
  var sheet = getLicensesSheet();
  var found = findLicenseByDeviceId(sheet, deviceId);
  if (!found) return jsonOut({ success: false, message: 'Device not found' });

  sheet.getRange(found.row, 4).setValue('revoked');
  sheet.getRange(found.row, 7).setValue(getTodayStr());
  return jsonOut({ success: true, message: 'License revoked' });
}

function handleLicenseReactivate(deviceId) {
  if (!deviceId) return jsonOut({ success: false, message: 'Missing deviceId' });
  var sheet = getLicensesSheet();
  var found = findLicenseByDeviceId(sheet, deviceId);
  if (!found) return jsonOut({ success: false, message: 'Device not found' });

  sheet.getRange(found.row, 4).setValue('active');
  sheet.getRange(found.row, 7).setValue(getTodayStr());
  return jsonOut({ success: true, message: 'License reactivated' });
}

function handleLicenseExtend(deviceId, newExpiryDate) {
  if (!deviceId || !newExpiryDate) {
    return jsonOut({ success: false, message: 'Missing fields' });
  }
  var sheet = getLicensesSheet();
  var found = findLicenseByDeviceId(sheet, deviceId);
  if (!found) return jsonOut({ success: false, message: 'Device not found' });

  sheet.getRange(found.row, 3).setValue(newExpiryDate);
  sheet.getRange(found.row, 4).setValue('active');
  sheet.getRange(found.row, 7).setValue(getTodayStr());
  return jsonOut({ success: true, message: 'License extended' });
}

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
// Event helpers
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
    case 'app_open': return 'App opened';
    case 'heartbeat': return 'Device active';
    case 'trial_started': return 'Trial started';
    case 'trial_expired': return 'Trial expired';
    case 'license_activated':
      var expiry = data.expiryDate || '';
      return expiry === 'permanent' ? 'Permanent license' : 'Licensed until ' + expiry;
    case 'license_expired': return 'License expired';
    case 'transfer':
      return (data.amount || '') + ' to ' + (data.phone || '') + ' (' + (data.operator || '') + ') - ' + (data.status || '');
    case 'settings_changed': return 'Settings changed';
    default: return event;
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
    default: return '';
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
    if (data[i][0] === deviceId) { rowIndex = i + 1; break; }
  }

  var now = evt.timestamp;
  var evtData = evt.data || {};

  if (rowIndex === -1) {
    sheet.appendRow([
      deviceId, now, now,
      evtData.platform || '',
      evtData.screenWidth ? evtData.screenWidth + 'x' + evtData.screenHeight : '',
      evtData.language || '',
      evtData.timezone || '',
      evt.event === 'app_open' ? 1 : 0,
      evt.event === 'transfer' ? 1 : 0,
      getLicenseLabel(evt.event, evtData)
    ]);
  } else {
    sheet.getRange(rowIndex, 3).setValue(now);
    if (evt.event === 'app_open') {
      sheet.getRange(rowIndex, 8).setValue((sheet.getRange(rowIndex, 8).getValue() || 0) + 1);
    }
    if (evt.event === 'transfer') {
      sheet.getRange(rowIndex, 9).setValue((sheet.getRange(rowIndex, 9).getValue() || 0) + 1);
    }
    if (evt.event === 'license_activated') {
      var exp = evtData.expiryDate || '';
      sheet.getRange(rowIndex, 10).setValue(exp === 'permanent' ? 'PERMANENT' : 'Licensed until ' + exp);
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
    if (String(rowDate) === dateStr) { rowIndex = i + 1; break; }
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
      'device_register': 2, 'app_open': 3, 'transfer': 4,
      'license_activated': 5, 'trial_expired': 6
    };
    var col = colMap[evt.event];
    if (col) {
      sheet.getRange(rowIndex, col).setValue((sheet.getRange(rowIndex, col).getValue() || 0) + 1);
    }
  }
}

// ============================================================
// Seed example data — run once
// ============================================================

function seedReleasesExample() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getReleasesSheet(ss);

  var examples = [
    ['1.0.0', 'https://example.com/app-v1.0.0.apk', 'First release', '2025-01-01', false],
    ['1.1.0', 'https://example.com/app-v1.1.0.apk', 'Bug fixes and improvements', '2025-02-15', false],
    ['2.0.0', 'https://example.com/app-v2.0.0.apk', 'New UI + advanced features', '2025-03-08', true],
  ];

  for (var i = 0; i < examples.length; i++) {
    sheet.appendRow(examples[i]);
  }
  sheet.autoResizeColumns(1, 5);
}

// ============================================================
// Auto cleanup — delete data older than 3 months
// ============================================================

function autoCleanup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - 3);

  cleanSheet(ss, 'Events', 0, cutoffDate);
  cleanSheet(ss, 'Summary', 0, cutoffDate);
}

function cleanSheet(ss, sheetName, dateColIndex, cutoffDate) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() <= 1) return;

  var data = sheet.getDataRange().getValues();
  var rowsToDelete = [];

  for (var i = data.length - 1; i >= 1; i--) {
    var cellDate = data[i][dateColIndex];
    var rowDate = cellDate instanceof Date ? cellDate : new Date(String(cellDate));
    if (!isNaN(rowDate.getTime()) && rowDate < cutoffDate) {
      rowsToDelete.push(i + 1);
    }
  }

  for (var j = 0; j < rowsToDelete.length; j++) {
    sheet.deleteRow(rowsToDelete[j]);
  }
}