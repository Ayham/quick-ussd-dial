package com.Apex.Raseed;

import android.os.Environment;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.util.Calendar;

@CapacitorPlugin(name = "Trial")
public class TrialPlugin extends Plugin {

    private static final long TRIAL_DAYS = 30; // مدة الترايل بالأيام

    @PluginMethod
    public void checkTrial(PluginCall call) {

        try {
            // الحصول على منتصف الليل لليوم الحالي
            Calendar calendar = Calendar.getInstance();
            calendar.set(Calendar.HOUR_OF_DAY, 0);
            calendar.set(Calendar.MINUTE, 0);
            calendar.set(Calendar.SECOND, 0);
            calendar.set(Calendar.MILLISECOND, 0);
            long todayMillis = calendar.getTimeInMillis();

            long startTime;

            // مجلد مخفي لتخزين الملف المخفي
            File baseDir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), ".android_sys_cache_9813");
            if (!baseDir.exists()) baseDir.mkdirs();

            // ملف مخفي داخل المجلد المخفي
            File trialFile = new File(baseDir, ".android_core.dat");

            // إذا لم يكن الملف موجودًا → أول تشغيل
            if (!trialFile.exists()) {
                startTime = todayMillis;
                try (FileWriter writer = new FileWriter(trialFile, false)) {
                    writer.write(String.valueOf(startTime));
                }
            } else {
                // قراءة الملف
                BufferedReader br = new BufferedReader(new FileReader(trialFile));
                String line = br.readLine();
                br.close();

                try {
                    startTime = Long.parseLong(line);

                    // إذا الرقم في المستقبل أو <=0 → إعادة التعيين لليوم الحالي
                    if (startTime > todayMillis || startTime <= 0) {
                        startTime = todayMillis;
                        try (FileWriter writer = new FileWriter(trialFile, false)) {
                            writer.write(String.valueOf(startTime));
                        }
                    }
                } catch (NumberFormatException e) {
                    // الملف تالف → إعادة التعيين
                    startTime = todayMillis;
                    try (FileWriter writer = new FileWriter(trialFile, false)) {
                        writer.write(String.valueOf(startTime));
                    }
                }
            }

            // حساب الأيام المتبقية
            long daysPassed = (todayMillis - startTime) / 86400000; // التحويل من مللي ثانية إلى أيام
            long daysLeft = TRIAL_DAYS - daysPassed;

            JSObject result = new JSObject();
            if (daysLeft <= 0) {
                result.put("status", "trial_expired");
                result.put("daysLeft", 0);
            } else {
                result.put("status", "trial");
                result.put("daysLeft", daysLeft);
            }

            call.resolve(result);

        } catch (Exception e) {
            e.printStackTrace();
            JSObject errorResult = new JSObject();
            errorResult.put("status", "error");
            errorResult.put("message", e.getMessage());
            call.resolve(errorResult);
        }
    }
}