package com.BlueOrbitTechnologies.Raseed;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.util.Log;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.Socket;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Local WebSocket-like client for Customer Display.
 * Connects to the seller's CustomerDisplayServer.
 * Protocol: Simple JSON messages over TCP, newline-delimited.
 */
@CapacitorPlugin(name = "CustomerDisplayClient")
public class CustomerDisplayClientPlugin extends Plugin {

    private static final String TAG = "CDClient";
    private Socket socket;
    private ExecutorService executor;
    private final AtomicBoolean connected = new AtomicBoolean(false);
    private final Object socketLock = new Object();

    @PluginMethod
    public void connect(PluginCall call) {
        if (connected.get()) {
            call.reject("Already connected");
            return;
        }

        String host = call.getString("host", "");
        int port = call.getInt("port", 8765);
        String token = call.getString("token", "");
        String sessionId = call.getString("sessionId", "");

        if (host.isEmpty()) {
            call.reject("Host is required");
            return;
        }

        executor = Executors.newCachedThreadPool();

        new Thread(() -> {
            try {
                socket = new Socket(host, port);
                connected.set(true);

                // Send HTTP upgrade request
                OutputStream output = socket.getOutputStream();
                String upgradeRequest = "GET / HTTP/1.1\r\n"
                    + "Host: " + host + ":" + port + "\r\n"
                    + "Upgrade: websocket\r\n"
                    + "Connection: Upgrade\r\n"
                    + "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
                    + "Sec-WebSocket-Version: 13\r\n"
                    + "\r\n";
                output.write(upgradeRequest.getBytes());
                output.flush();

                // Read HTTP response (101 Switching Protocols)
                BufferedReader reader = new BufferedReader(
                    new InputStreamReader(socket.getInputStream()));
                String responseLine;
                boolean upgraded = false;
                while ((responseLine = reader.readLine()) != null && !responseLine.isEmpty()) {
                    if (responseLine.contains("101")) {
                        upgraded = true;
                    }
                }

                if (!upgraded) {
                    connected.set(false);
                    socket.close();
                    JSObject err = new JSObject();
                    err.put("message", "Server did not upgrade connection");
                    call.reject("Connection rejected by server", err);
                    return;
                }

                JSObject result = new JSObject();
                result.put("connected", true);
                call.resolve(result);

                // Start reading messages
                readMessages(reader);

            } catch (Exception e) {
                Log.e(TAG, "Connection failed", e);
                connected.set(false);
                JSObject err = new JSObject();
                err.put("message", e.getMessage());
                call.reject("Connection failed", e);
            }
        }).start();
    }

    private void readMessages(BufferedReader reader) {
        executor.execute(() -> {
            try {
                StringBuilder messageBuffer = new StringBuilder();
                int ch;
                while (connected.get() && (ch = reader.read()) != -1) {
                    if (ch == '\n') {
                        String msg = messageBuffer.toString().trim();
                        messageBuffer.setLength(0);
                        if (!msg.isEmpty()) {
                            JSObject msgEvent = new JSObject();
                            msgEvent.put("message", msg);
                            notifyListeners("messageReceived", msgEvent);
                        }
                    } else if (ch != '\r') {
                        messageBuffer.append((char) ch);
                    }
                }
            } catch (Exception e) {
                if (connected.get()) {
                    Log.e(TAG, "Read error", e);
                }
            } finally {
                disconnectInternal();
                notifyListeners("disconnected", new JSObject());
            }
        });
    }

    @PluginMethod
    public void sendMessage(PluginCall call) {
        String message = call.getString("message", "");
        synchronized (socketLock) {
            if (socket == null || socket.isClosed()) {
                call.reject("Not connected");
                return;
            }
            try {
                OutputStream output = socket.getOutputStream();
                output.write((message + "\n").getBytes());
                output.flush();
                call.resolve();
            } catch (Exception e) {
                call.reject("Failed to send", e);
            }
        }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        disconnectInternal();
        call.resolve();
    }

    @PluginMethod
    public void isConnected(PluginCall call) {
        JSObject result = new JSObject();
        result.put("connected", connected.get());
        call.resolve(result);
    }

    private void disconnectInternal() {
        connected.set(false);
        synchronized (socketLock) {
            try {
                if (socket != null && !socket.isClosed()) {
                    socket.close();
                }
            } catch (Exception ignored) {}
            socket = null;
        }
        if (executor != null) {
            executor.shutdownNow();
        }
    }
}
