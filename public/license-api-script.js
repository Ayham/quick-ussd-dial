/**
 * ============================================================
 * Google Apps Script — نظام التراخيص المركزي
 * ============================================================
 * 
 * الإعداد:
 * 1. أنشئ جدول Google Sheets جديد
 * 2. أضف ورقة باسم "licenses" مع الأعمدة التالية في الصف الأول:
 *    deviceId | licenseKey | expiryDate | status | customerName | createdAt | lastCheck
 * 3. من القائمة: Extensions → Apps Script
 * 4. الصق هذا الكود بالكامل
 * 5. انشر: Deploy → New Deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6. انسخ رابط الـ URL والصقه في إعدادات لوحة الأدمن
 * 
 * ============================================================
 */

const SHEET_NAME = 'licenses';

function getSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

function findRowByDeviceId(sheet, deviceId) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) { // skip header
    if (data[i][0] === deviceId) return { row: i + 1, data: data[i] };
  }
  return null;
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getToday() {
  return Utilities.formatDate(new Date(), 'Asia/Damascus', 'yyyy-MM-dd');
}

// ============ GET Requests ============

function doGet(e) {
  const action = e.parameter.action;
  
  if (action === 'verify') {
    return handleVerify(e.parameter.deviceId);
  }
  
  if (action === 'list') {
    return handleList();
  }
  
  return jsonResponse({ error: 'Unknown action' });
}

// ============ POST Requests ============

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ success: false, message: 'Invalid JSON' });
  }
  
  const action = body.action;
  
  if (action === 'register') {
    return handleRegister(body);
  }
  
  if (action === 'revoke') {
    return handleRevoke(body.deviceId);
  }
  
  if (action === 'reactivate') {
    return handleReactivate(body.deviceId);
  }
  
  if (action === 'extend') {
    return handleExtend(body.deviceId, body.expiryDate);
  }
  
  return jsonResponse({ success: false, message: 'Unknown action' });
}

// ============ Handlers ============

function handleVerify(deviceId) {
  if (!deviceId) return jsonResponse({ status: 'error', message: 'Missing deviceId' });
  
  const sheet = getSheet();
  const found = findRowByDeviceId(sheet, deviceId);
  
  if (!found) {
    return jsonResponse({ status: 'not_found', message: 'الجهاز غير مسجل' });
  }
  
  const [, , expiryDate, status, customerName] = found.data;
  
  // Update lastCheck
  sheet.getRange(found.row, 7).setValue(getToday());
  
  // Check if revoked
  if (status === 'revoked') {
    return jsonResponse({ status: 'revoked', message: 'تم إلغاء الترخيص' });
  }
  
  // Check if expired (skip for permanent)
  if (expiryDate !== 'permanent') {
    const today = getToday();
    if (today > expiryDate) {
      // Auto-update status to expired
      sheet.getRange(found.row, 4).setValue('expired');
      return jsonResponse({ status: 'expired', message: 'انتهت صلاحية الترخيص', expiryDate: expiryDate });
    }
  }
  
  return jsonResponse({ 
    status: 'active', 
    expiryDate: expiryDate,
    customerName: customerName || '',
    message: 'الترخيص فعّال'
  });
}

function handleRegister(body) {
  const { deviceId, licenseKey, expiryDate, customerName } = body;
  
  if (!deviceId || !expiryDate) {
    return jsonResponse({ success: false, message: 'Missing required fields' });
  }
  
  const sheet = getSheet();
  const existing = findRowByDeviceId(sheet, deviceId);
  
  if (existing) {
    // Update existing row
    sheet.getRange(existing.row, 2).setValue(licenseKey || '');
    sheet.getRange(existing.row, 3).setValue(expiryDate);
    sheet.getRange(existing.row, 4).setValue('active');
    sheet.getRange(existing.row, 5).setValue(customerName || '');
    sheet.getRange(existing.row, 7).setValue(getToday());
    return jsonResponse({ success: true, message: 'تم تحديث الترخيص' });
  }
  
  // Add new row
  sheet.appendRow([
    deviceId,
    licenseKey || '',
    expiryDate,
    'active',
    customerName || '',
    getToday(),
    getToday()
  ]);
  
  return jsonResponse({ success: true, message: 'تم تسجيل الترخيص بنجاح' });
}

function handleRevoke(deviceId) {
  if (!deviceId) return jsonResponse({ success: false, message: 'Missing deviceId' });
  
  const sheet = getSheet();
  const found = findRowByDeviceId(sheet, deviceId);
  
  if (!found) return jsonResponse({ success: false, message: 'الجهاز غير موجود' });
  
  sheet.getRange(found.row, 4).setValue('revoked');
  sheet.getRange(found.row, 7).setValue(getToday());
  
  return jsonResponse({ success: true, message: 'تم إلغاء الترخيص' });
}

function handleReactivate(deviceId) {
  if (!deviceId) return jsonResponse({ success: false, message: 'Missing deviceId' });
  
  const sheet = getSheet();
  const found = findRowByDeviceId(sheet, deviceId);
  
  if (!found) return jsonResponse({ success: false, message: 'الجهاز غير موجود' });
  
  sheet.getRange(found.row, 4).setValue('active');
  sheet.getRange(found.row, 7).setValue(getToday());
  
  return jsonResponse({ success: true, message: 'تم إعادة تفعيل الترخيص' });
}

function handleExtend(deviceId, newExpiryDate) {
  if (!deviceId || !newExpiryDate) {
    return jsonResponse({ success: false, message: 'Missing fields' });
  }
  
  const sheet = getSheet();
  const found = findRowByDeviceId(sheet, deviceId);
  
  if (!found) return jsonResponse({ success: false, message: 'الجهاز غير موجود' });
  
  sheet.getRange(found.row, 3).setValue(newExpiryDate);
  sheet.getRange(found.row, 4).setValue('active');
  sheet.getRange(found.row, 7).setValue(getToday());
  
  return jsonResponse({ success: true, message: 'تم تمديد الترخيص' });
}

function handleList() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const licenses = [];
  
  for (let i = 1; i < data.length; i++) {
    const [deviceId, licenseKey, expiryDate, status, customerName, createdAt, lastCheck] = data[i];
    if (!deviceId) continue;
    licenses.push({ deviceId, licenseKey, expiryDate, status, customerName, createdAt, lastCheck });
  }
  
  return jsonResponse({ success: true, licenses: licenses });
}
