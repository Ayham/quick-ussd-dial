package com.BlueOrbitTechnologies.Raseed;

import android.os.SystemClock;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Monotonic elapsed-time source for the trusted clock (SB1).
 *
 * SystemClock.elapsedRealtime() is elapsed time since the last boot and is
 * independent of the user's wall-clock settings. It advances even while the
 * app is suspended, and only resets on a device reboot — which is exactly the
 * "reinstall / change clock / reboot" attack surface the trusted clock closes.
 */
@CapacitorPlugin(name = "SystemClock")
public class SystemClockPlugin extends Plugin {

    @PluginMethod
    public void elapsedRealtimeMillis(PluginCall call) {
        JSObject result = new JSObject();
        result.put("milliseconds", SystemClock.elapsedRealtime());
        call.resolve(result);
    }
}
