package com.BlueOrbitTechnologies.Raseed;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Trial")
public class TrialPlugin extends Plugin {

    @PluginMethod
    public void checkTrial(PluginCall call) {
        JSObject result = new JSObject();
        result.put("status", "trial_managed_by_server");
        result.put("daysLeft", -1);
        call.resolve(result);
    }
}