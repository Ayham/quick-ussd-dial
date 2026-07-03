package com.5Giga.Raseed;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TrialPlugin.class);
        super.onCreate(savedInstanceState);
    }

}