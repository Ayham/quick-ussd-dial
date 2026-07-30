package com.BlueOrbitTechnologies.Raseed;

import android.app.Activity;
import android.content.ContentProviderOperation;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;
import android.provider.ContactsContract.CommonDataKinds.Phone;
import android.provider.ContactsContract.CommonDataKinds.StructuredName;
import android.provider.ContactsContract.Contacts;
import android.provider.ContactsContract.RawContacts;
import android.provider.ContactsContract.Data;
import android.util.Log;

import com.getcapacitor.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.util.ArrayList;

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
    public void getContactByPhone(PluginCall call) {
        String phone = call.getString("phone");
        if (phone == null || phone.trim().isEmpty()) {
            call.reject("Phone number is required");
            return;
        }
        try {
            String normalized = phone.trim();
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
                            cursor.getColumnIndexOrThrow(ContactsContract.PhoneLookup._ID)
                        );
                        String displayName = cursor.getString(
                            cursor.getColumnIndexOrThrow(ContactsContract.PhoneLookup.DISPLAY_NAME)
                        );
                        String foundPhone = cursor.getString(
                            cursor.getColumnIndexOrThrow(ContactsContract.PhoneLookup.NUMBER)
                        );
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
        int limit = call.getInt("limit", 50);

        if (query.trim().isEmpty()) {
            call.resolve(new JSObject().put("contacts", new JSArray()));
            return;
        }

        try {
            ContentResolver cr = getContext().getContentResolver();
            JSArray results = new JSArray();
            String searchPattern = "%" + query.trim() + "%";
            String sortOrder = Phone.DISPLAY_NAME + " ASC LIMIT " + limit;

            Uri phoneUri = Phone.CONTENT_URI;
            String[] phoneProjection = {
                Phone.CONTACT_ID,
                Phone.DISPLAY_NAME,
                Phone.NUMBER
            };
            String phoneSelection = Phone.NUMBER + " LIKE ? OR " + Phone.DISPLAY_NAME + " LIKE ?";
            String[] phoneSelectionArgs = { searchPattern, searchPattern };

            Cursor cursor = cr.query(phoneUri, phoneProjection, phoneSelection,
                phoneSelectionArgs, sortOrder);
            if (cursor != null) {
                try {
                    while (cursor.moveToNext()) {
                        String contactId = cursor.getString(
                            cursor.getColumnIndexOrThrow(Phone.CONTACT_ID));
                        String displayName = cursor.getString(
                            cursor.getColumnIndexOrThrow(Phone.DISPLAY_NAME));
                        String number = cursor.getString(
                            cursor.getColumnIndexOrThrow(Phone.NUMBER));

                        boolean alreadyAdded = false;
                        for (int i = 0; i < results.length(); i++) {
                            JSObject existing = results.getJSObject(i);
                            if (existing != null
                                && contactId.equals(existing.getString("contactId"))) {
                                JSArray phones = existing.getJSArray("phones");
                                if (phones != null) {
                                    phones.put(number);
                                }
                                alreadyAdded = true;
                                break;
                            }
                        }
                        if (!alreadyAdded) {
                            JSObject contact = new JSObject();
                            contact.put("contactId", contactId);
                            contact.put("displayName",
                                displayName != null ? displayName : "");
                            JSArray phonesArray = new JSArray();
                            phonesArray.put(number != null ? number : "");
                            contact.put("phones", phonesArray);
                            results.put(contact);
                        }
                    }
                } finally {
                    cursor.close();
                }
            }
            Log.d(TAG, "Search contacts '" + query + "' returned " + results.length() + " results");
            JSObject result = new JSObject();
            result.put("contacts", results);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error searching contacts: " + query, e);
            call.reject("Failed to search contacts: " + e.getMessage());
        }
    }

    @PluginMethod
    public void createContact(PluginCall call) {
        String phone = call.getString("phone");
        String name = call.getString("name", "");

        if (phone == null || phone.trim().isEmpty()) {
            call.reject("Phone number is required");
            return;
        }

        try {
            String normalizedPhone = phone.trim();
            String contactName = name != null ? name.trim() : "";

            String existingId = lookupContactIdByPhone(normalizedPhone);
            if (existingId != null) {
                if (!contactName.isEmpty()) {
                    String currentName = lookupDisplayNameById(existingId);
                    if (!contactName.equals(currentName)) {
                        updateContactNameById(existingId, contactName);
                        Log.d(TAG, "Updated name for existing contact: " + existingId);
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

            int rawContactIndex = ops.size();
            ops.add(ContentProviderOperation.newInsert(RawContacts.CONTENT_URI)
                .withValue(RawContacts.ACCOUNT_TYPE, null)
                .withValue(RawContacts.ACCOUNT_NAME, null)
                .build());

            if (!contactName.isEmpty()) {
                ops.add(ContentProviderOperation.newInsert(Data.CONTENT_URI)
                    .withValueBackReference(Data.RAW_CONTACT_ID, rawContactIndex)
                    .withValue(Data.MIMETYPE, StructuredName.CONTENT_ITEM_TYPE)
                    .withValue(StructuredName.DISPLAY_NAME, contactName)
                    .build());
            }

            ops.add(ContentProviderOperation.newInsert(Data.CONTENT_URI)
                .withValueBackReference(Data.RAW_CONTACT_ID, rawContactIndex)
                .withValue(Data.MIMETYPE, Phone.CONTENT_ITEM_TYPE)
                .withValue(Phone.NUMBER, normalizedPhone)
                .withValue(Phone.TYPE, Phone.TYPE_MOBILE)
                .build());

            cr.applyBatch(ContactsContract.AUTHORITY, ops);

            String newContactId = lookupContactIdByPhone(normalizedPhone);
            Log.d(TAG, "Created contact for phone: " + normalizedPhone
                + " with name: " + contactName);

            JSObject result = new JSObject();
            result.put("contactId", newContactId);
            result.put("created", true);
            result.put("updated", false);
            call.resolve(result);
        } catch (SecurityException e) {
            Log.e(TAG, "Permission denied creating contact", e);
            call.reject("Permission denied: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Error creating contact for phone: " + phone, e);
            call.reject("Failed to create contact: " + e.getMessage());
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
            String contactId = lookupContactIdByPhone(phone.trim());
            if (contactId == null) {
                call.reject("Contact not found for phone: " + phone);
                return;
            }

            String displayName = name != null ? name.trim() : "";
            updateContactNameById(contactId, displayName);
            Log.d(TAG, "Updated contact name for: " + phone + " -> " + displayName);

            call.resolve(new JSObject()
                .put("contactId", contactId)
                .put("updated", true));
        } catch (SecurityException e) {
            Log.e(TAG, "Permission denied updating contact", e);
            call.reject("Permission denied: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Error updating contact name for: " + phone, e);
            call.reject("Failed to update contact: " + e.getMessage());
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
            call.reject("Permission denied: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Error deleting contact: " + phone, e);
            call.reject("Failed to delete contact: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getAllContacts(PluginCall call) {
        int limit = call.getInt("limit", 200);
        int offset = call.getInt("offset", 0);

        try {
            ContentResolver cr = getContext().getContentResolver();
            JSArray results = new JSArray();
            String sortOrder = Contacts.DISPLAY_NAME + " ASC LIMIT " + limit
                + " OFFSET " + offset;

            Uri uri = Contacts.CONTENT_URI;
            String[] projection = {
                Contacts._ID,
                Contacts.DISPLAY_NAME,
                Contacts.HAS_PHONE_NUMBER
            };

            Cursor cursor = cr.query(uri, projection, null, null, sortOrder);
            if (cursor != null) {
                try {
                    while (cursor.moveToNext()) {
                        String contactId = cursor.getString(
                            cursor.getColumnIndexOrThrow(Contacts._ID));
                        String displayName = cursor.getString(
                            cursor.getColumnIndexOrThrow(Contacts.DISPLAY_NAME));
                        boolean hasPhone = cursor.getInt(
                            cursor.getColumnIndexOrThrow(Contacts.HAS_PHONE_NUMBER)) > 0;

                        if (!hasPhone) continue;

                        JSArray phones = new JSArray();
                        Cursor phoneCursor = cr.query(
                            Phone.CONTENT_URI,
                            new String[]{Phone.NUMBER},
                            Phone.CONTACT_ID + " = ?",
                            new String[]{contactId},
                            null
                        );
                        if (phoneCursor != null) {
                            try {
                                while (phoneCursor.moveToNext()) {
                                    phones.put(phoneCursor.getString(0));
                                }
                            } finally {
                                phoneCursor.close();
                            }
                        }

                        JSObject contact = new JSObject();
                        contact.put("contactId", contactId);
                        contact.put("displayName",
                            displayName != null ? displayName : "");
                        contact.put("phones", phones);
                        results.put(contact);
                    }
                } finally {
                    cursor.close();
                }
            }

            Log.d(TAG, "getAllContacts offset=" + offset + " returned "
                + results.length() + " contacts");
            JSObject result = new JSObject();
            result.put("contacts", results);
            call.resolve(result);
        } catch (SecurityException e) {
            Log.e(TAG, "Permission denied reading contacts", e);
            call.reject("Permission denied: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Error reading all contacts", e);
            call.reject("Failed to read contacts: " + e.getMessage());
        }
    }

    private String lookupContactIdByPhone(String phone) {
        ContentResolver cr = getContext().getContentResolver();
        Uri uri = Uri.withAppendedPath(
            ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
            Uri.encode(phone)
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

    private void updateContactNameById(String contactId, String name) {
        Context context = getContext();
        ContentResolver cr = context.getContentResolver();
        ArrayList<ContentProviderOperation> ops = new ArrayList<>();

        String selection = Data.CONTACT_ID + " = ? AND " + Data.MIMETYPE + " = ?";
        String[] selectionArgs = { contactId, StructuredName.CONTENT_ITEM_TYPE };

        Cursor cursor = cr.query(Data.CONTENT_URI,
            new String[]{Data._ID, Data.RAW_CONTACT_ID},
            selection, selectionArgs, null);
        if (cursor != null) {
            try {
                if (cursor.moveToFirst()) {
                    long dataId = cursor.getLong(
                        cursor.getColumnIndexOrThrow(Data._ID));
                    ops.add(ContentProviderOperation.newUpdate(Data.CONTENT_URI)
                        .withSelection(Data._ID + " = ?",
                            new String[]{String.valueOf(dataId)})
                        .withValue(StructuredName.DISPLAY_NAME, name)
                        .build());
                }
            } finally {
                cursor.close();
            }
        }

        if (ops.isEmpty()) {
            ops.add(ContentProviderOperation.newInsert(Data.CONTENT_URI)
                .withValue(Data.CONTACT_ID, contactId)
                .withValue(Data.MIMETYPE, StructuredName.CONTENT_ITEM_TYPE)
                .withValue(StructuredName.DISPLAY_NAME, name)
                .build());
        }

        if (!ops.isEmpty()) {
            try {
                cr.applyBatch(ContactsContract.AUTHORITY, ops);
            } catch (Exception e) {
                Log.e(TAG, "Error updating name for contact: " + contactId, e);
            }
        }
    }
}
