package com.BlueOrbitTechnologies.Raseed;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TrialPlugin.class);
        registerPlugin(AndroidContactsPlugin.class);
        registerPlugin(SystemClockPlugin.class);
        super.onCreate(savedInstanceState);
    }

}