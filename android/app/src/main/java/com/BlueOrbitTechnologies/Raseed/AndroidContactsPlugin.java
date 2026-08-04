package com.BlueOrbitTechnologies.Raseed;

import android.accounts.Account;
import android.accounts.AccountManager;
import android.app.Activity;
import android.content.ContentProviderOperation;
import android.content.ContentProviderResult;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;
import android.provider.ContactsContract.CommonDataKinds.Phone;
import android.provider.ContactsContract.CommonDataKinds.StructuredName;
import android.provider.ContactsContract.Contacts;
import android.provider.ContactsContract.RawContacts;
import android.provider.ContactsContract.Data;
import android.provider.Settings;
import android.util.Log;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@CapacitorPlugin(
    name = "AndroidContacts",
    permissions = {
        @Permission(
            alias = "contacts",
            strings = {
                android.Manifest.permission.READ_CONTACTS,
                android.Manifest.permission.WRITE_CONTACTS
            }
        )
    }
)
public class AndroidContactsPlugin extends Plugin {

    private static final String TAG = "AndroidContacts";

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        super.checkPermissions(call);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        super.requestPermissions(call);
    }

    @PluginMethod
    public void pickContact(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_PICK, Phone.CONTENT_URI);
        startActivityForResult(call, intent, "pickContactResult");
    }

    @ActivityCallback
    public void pickContactResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() == Activity.RESULT_OK) {
            Intent data = result.getData();
            if (data != null && data.getData() != null) {
                Uri contactUri = data.getData();
                ContentResolver cr = getContext().getContentResolver();
                String[] projection = {
                    Phone.DISPLAY_NAME,
                    Phone.NUMBER
                };
                Cursor cursor = cr.query(contactUri, projection, null, null, null);
                if (cursor != null) {
                    try {
                        if (cursor.moveToFirst()) {
                            String displayName = cursor.getString(
                                cursor.getColumnIndexOrThrow(Phone.DISPLAY_NAME));
                            String phoneNumber = cursor.getString(
                                cursor.getColumnIndexOrThrow(Phone.NUMBER));
                            JSObject ret = new JSObject();
                            ret.put("displayName", displayName != null ? displayName : "");
                            ret.put("phone", phoneNumber != null ? phoneNumber : "");
                            Log.d(TAG, "Picked contact: " + displayName + " " + phoneNumber);
                            call.resolve(ret);
                            return;
                        }
                    } finally {
                        cursor.close();
                    }
                }
                call.reject("Could not retrieve contact data from picked contact");
            } else {
                call.reject("No contact data returned");
            }
        } else {
            call.reject("Contact picker cancelled");
        }
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", getContext().getPackageName(), null));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Error opening app settings", e);
            call.reject("Failed to open app settings: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getContactByPhone(PluginCall call) {
        String phone = call.getString("phone");
        if (phone == null || phone.trim().isEmpty()) {
            call.reject("Phone number is required");
            return;
        }
        try {
            String normalized = normalizeNumber(phone);

            ContentResolver cr = getContext().getContentResolver();
            Uri uri = Uri.withAppendedPath(
                ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                Uri.encode(normalized)
            );
            String[] projection = {
                ContactsContract.PhoneLookup._ID,
                ContactsContract.PhoneLookup.DISPLAY_NAME,
                ContactsContract.PhoneLookup.NUMBER
            };
            Cursor cursor = cr.query(uri, projection, null, null, null);
            if (cursor != null) {
                try {
                    if (cursor.moveToFirst()) {
                        String contactId = cursor.getString(
                            cursor.getColumnIndexOrThrow(ContactsContract.PhoneLookup._ID));
                        String displayName = cursor.getString(
                            cursor.getColumnIndexOrThrow(ContactsContract.PhoneLookup.DISPLAY_NAME));
                        String foundPhone = cursor.getString(
                            cursor.getColumnIndexOrThrow(ContactsContract.PhoneLookup.NUMBER));
                        JSObject result = new JSObject();
                        result.put("contactId", contactId);
                        result.put("displayName", displayName != null ? displayName : "");
                        result.put("phone", foundPhone != null ? foundPhone : normalized);
                        Log.d(TAG, "Found contact by phone: " + normalized + " -> " + displayName);
                        call.resolve(result);
                        return;
                    }
                } finally {
                    cursor.close();
                }
            }

            String foundId = scanContactIdByPhone(normalized);
            if (foundId != null) {
                JSObject result = new JSObject();
                result.put("contactId", foundId);
                result.put("displayName", lookupDisplayNameById(foundId));
                result.put("phone", normalized);
                Log.d(TAG, "Found contact via normalized scan: " + normalized + " -> " + foundId);
                call.resolve(result);
                return;
            }

            JSObject result = new JSObject();
            result.put("contactId", JSObject.NULL);
            result.put("displayName", "");
            result.put("phone", normalized);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error finding contact by phone: " + phone, e);
            call.reject("Failed to find contact: " + e.getMessage());
        }
    }

    @PluginMethod
    public void searchContacts(PluginCall call) {
        String query = call.getString("query", "");
        int limit = call.getInt("limit", 100);

        if (query == null || query.trim().isEmpty()) {
            call.resolve(new JSObject().put("contacts", new JSArray()));
            return;
        }

        try {
            ContentResolver cr = getContext().getContentResolver();
            String trimmed = query.trim();
            String normalizedQuery = normalizeNumber(trimmed);
            String queryLower = trimmed.toLowerCase(Locale.ROOT);

            Map<String, ContactAggregate> contactMap = new LinkedHashMap<>();

            String[] projection = {
                Phone.CONTACT_ID,
                Phone.DISPLAY_NAME,
                Phone.NUMBER
            };
            String sortOrder = Phone.DISPLAY_NAME + " COLLATE NOCASE ASC";

            Cursor cursor = cr.query(Phone.CONTENT_URI, projection, null, null, sortOrder);
            if (cursor != null) {
                try {
                    while (cursor.moveToNext()) {
                        String contactId = cursor.getString(
                            cursor.getColumnIndexOrThrow(Phone.CONTACT_ID));
                        String displayName = cursor.getString(
                            cursor.getColumnIndexOrThrow(Phone.DISPLAY_NAME));
                        String number = cursor.getString(
                            cursor.getColumnIndexOrThrow(Phone.NUMBER));

                        boolean nameMatch = displayName != null
                            && displayName.toLowerCase(Locale.ROOT).contains(queryLower);

                        String normNumber = number != null ? normalizeNumber(number) : "";
                        boolean numberMatch = !normalizedQuery.isEmpty()
                            && !normNumber.isEmpty()
                            && normNumber.contains(normalizedQuery);

                        if (!nameMatch && !numberMatch) continue;

                        ContactAggregate agg = contactMap.get(contactId);
                        if (agg == null) {
                            agg = new ContactAggregate(contactId,
                                displayName != null ? displayName : "");
                            contactMap.put(contactId, agg);
                        }
                        if (number != null && !number.isEmpty()) {
                            if (numberMatch) {
                                agg.phones.add(0, number);
                            } else {
                                agg.phones.add(number);
                            }
                        }
                    }
                } finally {
                    cursor.close();
                }
            }

            JSArray results = new JSArray();
            for (ContactAggregate agg : contactMap.values()) {
                if (limit > 0 && results.length() >= limit) break;
                JSObject contact = new JSObject();
                contact.put("contactId", agg.contactId);
                contact.put("displayName", agg.displayName);
                JSArray phones = new JSArray();
                for (String p : agg.phones) {
                    phones.put(p);
                }
                contact.put("phones", phones);
                results.put(contact);
            }

            Log.d(TAG, "searchContacts '" + query + "' returned " + results.length()
                + " results");
            call.resolve(new JSObject().put("contacts", results));
        } catch (SecurityException e) {
            Log.e(TAG, "Permission denied searching contacts", e);
            call.reject("Permission denied: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Error searching contacts: " + query, e);
            call.reject("Failed to search contacts: " + e.getMessage());
        }
    }

    @PluginMethod
    public void createContact(PluginCall call) {
        String phone = call.getString("phone");
        String name = call.getString("name", "");
        Log.i(TAG, "[createContact] STEP 1: JS call received. phone='" + phone + "' name='" + name + "'");

        if (phone == null || phone.trim().isEmpty()) {
            Log.e(TAG, "[createContact] STEP 2: REJECT phone number is empty");
            call.reject("Phone number is required", "BAD_REQUEST");
            return;
        }

        try {
            Log.i(TAG, "[createContact] STEP 3: checking runtime permissions");
            boolean readGranted = ContextCompat.checkSelfPermission(getContext(),
                android.Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED;
            boolean writeGranted = ContextCompat.checkSelfPermission(getContext(),
                android.Manifest.permission.WRITE_CONTACTS) == PackageManager.PERMISSION_GRANTED;
            Log.i(TAG, "[createContact] STEP 3.1: READ_CONTACTS granted=" + readGranted
                + " WRITE_CONTACTS granted=" + writeGranted);
            if (!hasContactsPermissions()) {
                Log.e(TAG, "[createContact] STEP 3.2: REJECT permissions not granted");
                call.reject("Permission denied: READ_CONTACTS / WRITE_CONTACTS not granted", "PERMISSION_DENIED");
                return;
            }

            String normalizedPhone = normalizeNumber(phone);
            Log.i(TAG, "[createContact] STEP 4: normalizedPhone='" + normalizedPhone + "'");
            if (normalizedPhone.isEmpty()) {
                Log.e(TAG, "[createContact] STEP 4.1: REJECT invalid phone number");
                call.reject("Invalid phone number: " + phone, "BAD_REQUEST");
                return;
            }
            String contactName = name != null ? name.trim() : "";
            Log.i(TAG, "[createContact] STEP 5: contactName='" + contactName + "'");

            String existingId = lookupContactIdByPhone(normalizedPhone);
            Log.i(TAG, "[createContact] STEP 6: existing contact lookup -> contactId=" + existingId);
            if (existingId != null) {
                if (!contactName.isEmpty()) {
                    String currentName = lookupDisplayNameById(existingId);
                    Log.i(TAG, "[createContact] STEP 6.1: existing name='" + currentName
                        + "' new name='" + contactName + "'");
                    if (!contactName.equals(currentName)) {
                        try {
                            updateContactNameById(existingId, contactName);
                            Log.i(TAG, "[createContact] STEP 6.2: name updated for existing contact "
                                + existingId);
                        } catch (Exception e) {
                            Log.e(TAG, "[createContact] STEP 6.3: UPDATE NAME THREW "
                                + e.getClass().getName() + ": " + e.getMessage()
                                + "\n" + Log.getStackTraceString(e));
                            call.reject(e.getClass().getName() + ": " + e.getMessage(),
                                "UPDATE_FAILED");
                            return;
                        }
                    }
                }
                JSObject result = new JSObject();
                result.put("contactId", existingId);
                result.put("created", false);
                result.put("updated", !contactName.isEmpty());
                call.resolve(result);
                return;
            }

            Context context = getContext();
            ContentResolver cr = context.getContentResolver();
            ArrayList<ContentProviderOperation> ops = new ArrayList<>();

            String[] writeAccount = resolveWriteAccount();
            String accountType = writeAccount[0];
            String accountName = writeAccount[1];
            Log.i(TAG, "[createContact] STEP 6.4: resolved write account type='" + accountType
                + "' name='" + accountName + "'");

            int rawContactIndex = ops.size();
            ops.add(ContentProviderOperation.newInsert(RawContacts.CONTENT_URI)
                .withValue(RawContacts.ACCOUNT_TYPE, accountType)
                .withValue(RawContacts.ACCOUNT_NAME, accountName)
                .build());
            Log.i(TAG, "[createContact] STEP 7: added RawContacts insert at op index " + rawContactIndex
                + " accountType=" + accountType + " accountName=" + accountName);

            if (!contactName.isEmpty()) {
                ops.add(ContentProviderOperation.newInsert(Data.CONTENT_URI)
                    .withValueBackReference(Data.RAW_CONTACT_ID, rawContactIndex)
                    .withValue(Data.MIMETYPE, StructuredName.CONTENT_ITEM_TYPE)
                    .withValue(StructuredName.DISPLAY_NAME, contactName)
                    .build());
                Log.i(TAG, "[createContact] STEP 8: added StructuredName insert (backref=" + rawContactIndex
                    + ") mime=" + StructuredName.CONTENT_ITEM_TYPE);
            }

            ops.add(ContentProviderOperation.newInsert(Data.CONTENT_URI)
                .withValueBackReference(Data.RAW_CONTACT_ID, rawContactIndex)
                .withValue(Data.MIMETYPE, Phone.CONTENT_ITEM_TYPE)
                .withValue(Phone.NUMBER, normalizedPhone)
                .withValue(Phone.TYPE, Phone.TYPE_MOBILE)
                .build());
            Log.i(TAG, "[createContact] STEP 9: added Phone insert (backref=" + rawContactIndex
                + ") mime=" + Phone.CONTENT_ITEM_TYPE + " number=" + normalizedPhone
                + " type=" + Phone.TYPE_MOBILE + " totalOps=" + ops.size());

            ContentProviderResult[] batchResults;
            try {
                batchResults = cr.applyBatch(ContactsContract.AUTHORITY, ops);
            } catch (Exception e) {
                String msg = e.getMessage() == null ? "" : e.getMessage();
                boolean cloudDefaultRejection = (e instanceof IllegalArgumentException)
                    && msg.contains("local or SIM accounts");
                if (cloudDefaultRejection && accountType == null) {
                    Log.w(TAG, "[createContact] STEP 10.1: device rejects local/SIM inserts, "
                        + "retrying with a real account");
                    String[] retryAccount = resolveWriteAccount();
                    if (retryAccount[0] != null) {
                        ArrayList<ContentProviderOperation> retryOps = new ArrayList<>();
                        int retryRawIndex = retryOps.size();
                        retryOps.add(ContentProviderOperation.newInsert(RawContacts.CONTENT_URI)
                            .withValue(RawContacts.ACCOUNT_TYPE, retryAccount[0])
                            .withValue(RawContacts.ACCOUNT_NAME, retryAccount[1])
                            .build());
                        if (!contactName.isEmpty()) {
                            retryOps.add(ContentProviderOperation.newInsert(Data.CONTENT_URI)
                                .withValueBackReference(Data.RAW_CONTACT_ID, retryRawIndex)
                                .withValue(Data.MIMETYPE, StructuredName.CONTENT_ITEM_TYPE)
                                .withValue(StructuredName.DISPLAY_NAME, contactName)
                                .build());
                        }
                        retryOps.add(ContentProviderOperation.newInsert(Data.CONTENT_URI)
                            .withValueBackReference(Data.RAW_CONTACT_ID, retryRawIndex)
                            .withValue(Data.MIMETYPE, Phone.CONTENT_ITEM_TYPE)
                            .withValue(Phone.NUMBER, normalizedPhone)
                            .withValue(Phone.TYPE, Phone.TYPE_MOBILE)
                            .build());
                        Log.i(TAG, "[createContact] STEP 10.2: retrying applyBatch with account "
                            + retryAccount[0] + " / " + retryAccount[1]);
                        batchResults = cr.applyBatch(ContactsContract.AUTHORITY, retryOps);
                        accountType = retryAccount[0];
                        accountName = retryAccount[1];
                        Log.i(TAG, "[createContact] STEP 10.3: retry applyBatch succeeded");
                    } else {
                        Log.e(TAG, "[createContact] STEP 10.4: no real account available for retry");
                        throw e;
                    }
                } else {
                    Log.e(TAG, "[createContact] STEP 10: applyBatch THREW "
                        + e.getClass().getName() + ": " + msg
                        + "\n" + Log.getStackTraceString(e));
                    JSObject data = new JSObject();
                    data.put("step", "applyBatch");
                    data.put("exception", e.getClass().getName());
                    data.put("stack", Log.getStackTraceString(e));
                    call.reject(e.getClass().getName() + ": " + msg, "APPLY_BATCH_FAILED", data);
                    return;
                }
            }
            Log.i(TAG, "[createContact] STEP 11: applyBatch returned "
                + (batchResults == null ? "null" : batchResults.length + " results"));
            if (batchResults != null) {
                for (int i = 0; i < batchResults.length; i++) {
                    ContentProviderResult r = batchResults[i];
                    Log.i(TAG, "[createContact] STEP 11." + i + ": result uri="
                        + (r == null || r.uri == null ? "null" : r.uri.toString())
                        + " count=" + (r == null ? "null" : r.count));
                }
            }

            String rawContactId = null;
            if (batchResults != null && batchResults.length > 0
                && batchResults[0] != null && batchResults[0].uri != null) {
                rawContactId = batchResults[0].uri.getLastPathSegment();
            }
            Log.i(TAG, "[createContact] STEP 12: rawContactId='" + rawContactId + "'");

            String newContactId = null;
            if (rawContactId != null) {
                newContactId = lookupContactIdByRawId(rawContactId);
                Log.i(TAG, "[createContact] STEP 13: lookupContactIdByRawId(" + rawContactId + ")="
                    + newContactId);
            }
            if (newContactId == null) {
                newContactId = lookupContactIdByPhone(normalizedPhone);
                Log.i(TAG, "[createContact] STEP 14: fallback lookupContactIdByPhone(" + normalizedPhone
                    + ")=" + newContactId);
            }

            if (newContactId == null) {
                Log.e(TAG, "[createContact] STEP 15: VERIFICATION FAILED after successful insert. "
                    + "rawContactId=" + rawContactId);
                call.reject("Contact was created but could not be verified. Please try again.",
                    "VERIFY_FAILED");
                return;
            }

            Log.i(TAG, "[createContact] STEP 16: SUCCESS. contactId=" + newContactId
                + " created=true phone=" + normalizedPhone + " name='" + contactName + "'");
            JSObject result = new JSObject();
            result.put("contactId", newContactId);
            result.put("created", true);
            result.put("updated", false);
            call.resolve(result);
        } catch (SecurityException e) {
            Log.e(TAG, "[createContact] SECURITY EXCEPTION (full stack):\n"
                + Log.getStackTraceString(e));
            call.reject("SecurityException: " + e.getMessage(), "PERMISSION_DENIED");
        } catch (Exception e) {
            Log.e(TAG, "[createContact] UNEXPECTED EXCEPTION (full stack):\n"
                + Log.getStackTraceString(e));
            JSObject data = new JSObject();
            data.put("exception", e.getClass().getName());
            data.put("stack", Log.getStackTraceString(e));
            call.reject(e.getClass().getName() + ": " + e.getMessage(), "CREATE_FAILED", data);
        }
    }

    @PluginMethod
    public void updateContactName(PluginCall call) {
        String phone = call.getString("phone");
        String name = call.getString("name", "");

        if (phone == null || phone.trim().isEmpty()) {
            call.reject("Phone number is required");
            return;
        }

        try {
            if (!hasContactsPermissions()) {
                call.reject("Permission denied: READ_CONTACTS / WRITE_CONTACTS not granted", "PERMISSION_DENIED");
                return;
            }

            String contactId = lookupContactIdByPhone(phone.trim());
            if (contactId == null) {
                call.reject("Contact not found for phone: " + phone, "NOT_FOUND");
                return;
            }

            String displayName = name != null ? name.trim() : "";
            updateContactNameById(contactId, displayName);
            Log.i(TAG, "Updated contact name for: " + phone + " -> " + displayName);

            call.resolve(new JSObject()
                .put("contactId", contactId)
                .put("updated", true));
        } catch (SecurityException e) {
            Log.e(TAG, "Permission denied updating contact (full stack):\n"
                + Log.getStackTraceString(e));
            call.reject("SecurityException: " + e.getMessage(), "PERMISSION_DENIED");
        } catch (Exception e) {
            Log.e(TAG, "Error updating contact name for: " + phone + " (full stack):\n"
                + Log.getStackTraceString(e));
            JSObject data = new JSObject();
            data.put("exception", e.getClass().getName());
            data.put("stack", Log.getStackTraceString(e));
            call.reject(e.getClass().getName() + ": " + e.getMessage(), "UPDATE_FAILED", data);
        }
    }

    @PluginMethod
    public void deleteContact(PluginCall call) {
        String phone = call.getString("phone");
        if (phone == null || phone.trim().isEmpty()) {
            call.reject("Phone number is required");
            return;
        }

        try {
            if (!hasContactsPermissions()) {
                call.reject("Permission denied: READ_CONTACTS / WRITE_CONTACTS not granted", "PERMISSION_DENIED");
                return;
            }

            String contactId = lookupContactIdByPhone(phone.trim());
            if (contactId == null) {
                call.resolve(new JSObject().put("deleted", false));
                return;
            }

            ContentResolver cr = getContext().getContentResolver();
            cr.delete(RawContacts.CONTENT_URI,
                RawContacts.CONTACT_ID + " = ?",
                new String[]{contactId});
            Log.d(TAG, "Deleted contact: " + phone);
            call.resolve(new JSObject().put("deleted", true));
        } catch (SecurityException e) {
            Log.e(TAG, "Permission denied deleting contact", e);
            call.reject("Permission denied: " + e.getMessage(), "PERMISSION_DENIED");
        } catch (Exception e) {
            Log.e(TAG, "Error deleting contact: " + phone, e);
            call.reject("Failed to delete contact: " + e.getMessage(), "DELETE_FAILED");
        }
    }

    @PluginMethod
    public void getAllContacts(PluginCall call) {
        int limit = call.getInt("limit", 0);
        int offset = call.getInt("offset", 0);

        try {
            if (!hasContactsPermissions()) {
                call.reject("Permission denied: READ_CONTACTS / WRITE_CONTACTS not granted", "PERMISSION_DENIED");
                return;
            }

            ContentResolver cr = getContext().getContentResolver();
            List<ContactAggregate> contacts = loadAllContacts(cr);
            contacts.sort(Comparator.comparing(
                (ContactAggregate c) -> c.displayName.toLowerCase(Locale.ROOT)));

            JSArray results = new JSArray();
            for (int i = offset; i < contacts.size(); i++) {
                if (limit > 0 && results.length() >= limit) break;
                ContactAggregate agg = contacts.get(i);
                JSObject contact = new JSObject();
                contact.put("contactId", agg.contactId);
                contact.put("displayName", agg.displayName);
                JSArray phones = new JSArray();
                for (String p : agg.phones) {
                    phones.put(p);
                }
                contact.put("phones", phones);
                results.put(contact);
            }

            Log.d(TAG, "getAllContacts offset=" + offset + " returned "
                + results.length() + " contacts");
            call.resolve(new JSObject().put("contacts", results));
        } catch (SecurityException e) {
            Log.e(TAG, "Permission denied reading contacts", e);
            call.reject("Permission denied: " + e.getMessage(), "PERMISSION_DENIED");
        } catch (Exception e) {
            Log.e(TAG, "Error reading all contacts", e);
            call.reject("Failed to read contacts: " + e.getMessage(), "READ_FAILED");
        }
    }

    private String lookupContactIdByPhone(String phone) {
        String normalized = normalizeNumber(phone);
        if (normalized.isEmpty()) return null;

        try {
            ContentResolver cr = getContext().getContentResolver();
            Uri uri = Uri.withAppendedPath(
                ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                Uri.encode(normalized)
            );
            String[] projection = { ContactsContract.PhoneLookup._ID };
            Cursor cursor = cr.query(uri, projection, null, null, null);
            if (cursor != null) {
                try {
                    if (cursor.moveToFirst()) {
                        return cursor.getString(
                            cursor.getColumnIndexOrThrow(ContactsContract.PhoneLookup._ID));
                    }
                } finally {
                    cursor.close();
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "PhoneLookup failed for phone: " + phone, e);
        }

        return scanContactIdByPhone(normalized);
    }

    private String scanContactIdByPhone(String normalizedPhone) {
        if (normalizedPhone == null || normalizedPhone.isEmpty()) return null;
        ContentResolver cr = getContext().getContentResolver();
        for (ContactAggregate agg : loadAllContacts(cr)) {
            for (String p : agg.phones) {
                if (normalizedPhone.equals(normalizeNumber(p))) {
                    return agg.contactId;
                }
            }
        }
        return null;
    }

    private String lookupContactIdByRawId(String rawContactId) {
        ContentResolver cr = getContext().getContentResolver();
        Cursor cursor = cr.query(RawContacts.CONTENT_URI,
            new String[]{RawContacts.CONTACT_ID},
            RawContacts._ID + " = ?",
            new String[]{rawContactId}, null);
        if (cursor != null) {
            try {
                if (cursor.moveToFirst()) {
                    return cursor.getString(
                        cursor.getColumnIndexOrThrow(RawContacts.CONTACT_ID));
                }
            } finally {
                cursor.close();
            }
        }
        return null;
    }

    private String lookupDisplayNameById(String contactId) {
        ContentResolver cr = getContext().getContentResolver();
        Uri uri = Contacts.CONTENT_URI;
        String[] projection = { Contacts.DISPLAY_NAME };
        String selection = Contacts._ID + " = ?";
        String[] selectionArgs = { contactId };
        Cursor cursor = cr.query(uri, projection, selection, selectionArgs, null);
        if (cursor != null) {
            try {
                if (cursor.moveToFirst()) {
                    return cursor.getString(
                        cursor.getColumnIndexOrThrow(Contacts.DISPLAY_NAME));
                }
            } finally {
                cursor.close();
            }
        }
        return "";
    }

    private void updateContactNameById(String contactId, String name) throws Exception {
        ContentResolver cr = getContext().getContentResolver();

        String selection = Data.CONTACT_ID + " = ? AND " + Data.MIMETYPE + " = ?";
        String[] selectionArgs = { contactId, StructuredName.CONTENT_ITEM_TYPE };
        long dataId = -1;
        Cursor cursor = cr.query(Data.CONTENT_URI,
            new String[]{Data._ID}, selection, selectionArgs, null);
        if (cursor != null) {
            try {
                if (cursor.moveToFirst()) {
                    dataId = cursor.getLong(cursor.getColumnIndexOrThrow(Data._ID));
                }
            } finally {
                cursor.close();
            }
        }
        Log.i(TAG, "[updateContactNameById] contactId=" + contactId + " existingStructuredNameDataId="
            + dataId + " newName='" + name + "'");

        if (dataId >= 0) {
            ArrayList<ContentProviderOperation> ops = new ArrayList<>();
            ops.add(ContentProviderOperation.newUpdate(Data.CONTENT_URI)
                .withSelection(Data._ID + " = ?",
                    new String[]{String.valueOf(dataId)})
                .withValue(StructuredName.DISPLAY_NAME, name)
                .build());
            cr.applyBatch(ContactsContract.AUTHORITY, ops);
            return;
        }

        String rawContactId = lookupRawContactIdByContactId(contactId);
        Log.i(TAG, "[updateContactNameById] rawContactId=" + rawContactId);
        if (rawContactId == null) {
            throw new IllegalStateException(
                "No raw contact found for contactId=" + contactId);
        }

        ArrayList<ContentProviderOperation> ops = new ArrayList<>();
        ops.add(ContentProviderOperation.newInsert(Data.CONTENT_URI)
            .withValue(Data.RAW_CONTACT_ID, rawContactId)
            .withValue(Data.MIMETYPE, StructuredName.CONTENT_ITEM_TYPE)
            .withValue(StructuredName.DISPLAY_NAME, name)
            .build());
        cr.applyBatch(ContactsContract.AUTHORITY, ops);
    }

    private String lookupRawContactIdByContactId(String contactId) {
        ContentResolver cr = getContext().getContentResolver();
        Cursor cursor = cr.query(RawContacts.CONTENT_URI,
            new String[]{RawContacts._ID},
            RawContacts.CONTACT_ID + " = ? AND " + RawContacts.DELETED + " = 0",
            new String[]{contactId}, null);
        if (cursor != null) {
            try {
                if (cursor.moveToFirst()) {
                    return cursor.getString(cursor.getColumnIndexOrThrow(RawContacts._ID));
                }
            } finally {
                cursor.close();
            }
        }
        return null;
    }

    private boolean hasContactsPermissions() {
        Context context = getContext();
        return ContextCompat.checkSelfPermission(context,
                android.Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED
            && ContextCompat.checkSelfPermission(context,
                android.Manifest.permission.WRITE_CONTACTS) == PackageManager.PERMISSION_GRANTED;
    }

    private static List<ContactAggregate> loadAllContacts(ContentResolver cr) {
        Map<String, ContactAggregate> map = new LinkedHashMap<>();
        String[] projection = {
            Phone.CONTACT_ID,
            Phone.DISPLAY_NAME,
            Phone.NUMBER
        };
        Cursor cursor = cr.query(Phone.CONTENT_URI, projection, null, null, null);
        if (cursor != null) {
            try {
                while (cursor.moveToNext()) {
                    String contactId = cursor.getString(
                        cursor.getColumnIndexOrThrow(Phone.CONTACT_ID));
                    String displayName = cursor.getString(
                        cursor.getColumnIndexOrThrow(Phone.DISPLAY_NAME));
                    String number = cursor.getString(
                        cursor.getColumnIndexOrThrow(Phone.NUMBER));

                    ContactAggregate agg = map.get(contactId);
                    if (agg == null) {
                        agg = new ContactAggregate(contactId,
                            displayName != null ? displayName : "");
                        map.put(contactId, agg);
                    }
                    if (number != null && !number.isEmpty()) {
                        agg.phones.add(number);
                    }
                }
            } finally {
                cursor.close();
            }
        }
        return new ArrayList<>(map.values());
    }

    private static String normalizeNumber(String raw) {
        if (raw == null) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (Character.isDigit(c)) {
                sb.append(c);
            } else if (c == '+' && sb.length() == 0) {
                sb.append(c);
            }
        }
        String digits = sb.toString();
        if (digits.isEmpty()) return "";
        if (digits.charAt(0) == '+') digits = digits.substring(1);
        if (digits.startsWith("00963") && digits.length() >= 14) {
            digits = "0" + digits.substring(5);
        } else if (digits.startsWith("963") && digits.length() >= 12) {
            digits = "0" + digits.substring(3);
        } else if (digits.length() == 9 && digits.charAt(0) != '0') {
            digits = "0" + digits;
        }
        return digits;
    }

    private String[] resolveWriteAccount() {
        try {
            ContentResolver cr = getContext().getContentResolver();

            Cursor settingsCursor = cr.query(ContactsContract.Settings.CONTENT_URI,
                new String[]{ContactsContract.Settings.ACCOUNT_TYPE,
                    ContactsContract.Settings.ACCOUNT_NAME},
                null, null, null);
            if (settingsCursor != null) {
                try {
                    while (settingsCursor.moveToNext()) {
                        String type = settingsCursor.getString(0);
                        String name = settingsCursor.getString(1);
                        Log.d(TAG, "resolveWriteAccount: Settings account type=" + type + " name=" + name);
                        if (isUsableAccount(type, name)) return new String[]{type, name};
                    }
                } finally {
                    settingsCursor.close();
                }
            }

            try {
                AccountManager am = AccountManager.get(getContext());
                Account[] accounts = am.getAccounts();
                if (accounts != null) {
                    for (Account acc : accounts) {
                        Log.d(TAG, "resolveWriteAccount: AccountManager account type=" + acc.type
                            + " name=" + acc.name);
                        if (isUsableAccount(acc.type, acc.name)) {
                            return new String[]{acc.type, acc.name};
                        }
                    }
                }
            } catch (Exception amErr) {
                Log.w(TAG, "resolveWriteAccount: AccountManager unavailable", amErr);
            }

            Cursor rawCursor = cr.query(RawContacts.CONTENT_URI,
                new String[]{RawContacts.ACCOUNT_TYPE, RawContacts.ACCOUNT_NAME},
                RawContacts.ACCOUNT_TYPE + " IS NOT NULL AND " + RawContacts.ACCOUNT_NAME + " IS NOT NULL",
                null, RawContacts._ID + " LIMIT 50");
            if (rawCursor != null) {
                try {
                    while (rawCursor.moveToNext()) {
                        String type = rawCursor.getString(0);
                        String name = rawCursor.getString(1);
                        Log.d(TAG, "resolveWriteAccount: RawContacts account type=" + type + " name=" + name);
                        if (isUsableAccount(type, name)) return new String[]{type, name};
                    }
                } finally {
                    rawCursor.close();
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "resolveWriteAccount failed", e);
        }
        return new String[]{null, null};
    }

    private static boolean isUsableAccount(String type, String name) {
        if (type == null || type.isEmpty()) return false;
        String t = type.toLowerCase(Locale.ROOT);
        if (t.contains("sim") || t.contains("phone") || t.contains("local")) return false;
        return true;
    }

    private static class ContactAggregate {
        final String contactId;
        final String displayName;
        final List<String> phones = new ArrayList<>();

        ContactAggregate(String contactId, String displayName) {
            this.contactId = contactId;
            this.displayName = displayName;
        }
    }
}
