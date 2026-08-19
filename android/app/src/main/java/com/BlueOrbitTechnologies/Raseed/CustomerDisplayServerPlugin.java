package com.BlueOrbitTechnologies.Raseed;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;

import android.util.Log;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

import org.json.JSONObject;
import org.json.JSONArray;

/**
 * Local WebSocket-like server for Customer Display pairing.
 * Uses plain HTTP upgrade + raw socket for simplicity (no external deps).
 *
 * Protocol: Simple JSON messages over TCP, newline-delimited.
 */
@CapacitorPlugin(name = "CustomerDisplayServer")
public class CustomerDisplayServerPlugin extends Plugin {

    private static final String TAG = "CDServer";
    private ServerSocket serverSocket;
    private ExecutorService executor;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private Socket clientSocket;
    private final Object clientLock = new Object();
    private String sessionToken;
    private String sessionId;

    @PluginMethod
    public void startServer(PluginCall call) {
        if (running.get()) {
            call.reject("Server already running");
            return;
        }

        int port = call.getInt("port", 8765);
        sessionId = call.getString("sessionId", "");
        sessionToken = call.getString("token", "");

        executor = Executors.newCachedThreadPool();

        new Thread(() -> {
            try {
                serverSocket = new ServerSocket(port, 0, InetAddress.getByName("0.0.0.0"));
                running.set(true);

                String ip = getLocalIpAddress();
                int actualPort = serverSocket.getLocalPort();

                JSObject result = new JSObject();
                result.put("ip", ip);
                result.put("port", actualPort);
                result.put("started", true);

                notifyListeners("serverStarted", result);
                call.resolve(result);

                while (running.get()) {
                    try {
                        Socket socket = serverSocket.accept();
                        synchronized (clientLock) {
                            if (clientSocket != null && !clientSocket.isClosed()) {
                                // Only allow one client
                                try { socket.close(); } catch (Exception ignored) {}
                                continue;
                            }
                            clientSocket = socket;
                        }
                        handleClient(socket);
                    } catch (Exception e) {
                        if (running.get()) {
                            Log.e(TAG, "Accept error", e);
                        }
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "Server start failed", e);
                JSObject err = new JSObject();
                err.put("message", e.getMessage());
                call.reject("Failed to start server", e);
            }
        }).start();
    }

    private void handleClient(Socket socket) {
        executor.execute(() -> {
            try {
                BufferedReader reader = new BufferedReader(
                    new InputStreamReader(socket.getInputStream()));
                OutputStream output = socket.getOutputStream();

                // Read HTTP upgrade request
                String line;
                boolean upgraded = false;
                while ((line = reader.readLine()) != null && !line.isEmpty()) {
                    if (line.toUpperCase().startsWith("GET")) {
                        upgraded = true;
                    }
                }

                if (!upgraded) {
                    socket.close();
                    return;
                }

                // Send HTTP 101 Switching Protocols (minimal WebSocket-like handshake)
                String response = "HTTP/1.1 101 Switching Protocols\r\n"
                    + "Upgrade: websocket\r\n"
                    + "Connection: Upgrade\r\n"
                    + "\r\n";
                output.write(response.getBytes());
                output.flush();

                // Notify JS of new connection
                JSObject connectEvent = new JSObject();
                connectEvent.put("clientIp", socket.getInetAddress().getHostAddress());
                notifyListeners("clientConnected", connectEvent);

                // Read messages (newline-delimited JSON)
                StringBuilder messageBuffer = new StringBuilder();
                int ch;
                while ((ch = reader.read()) != -1) {
                    if (ch == '\n') {
                        String msg = messageBuffer.toString().trim();
                        messageBuffer.setLength(0);
                        if (!msg.isEmpty()) {
                            try {
                                JSObject msgEvent = new JSObject();
                                msgEvent.put("message", msg);
                                notifyListeners("messageReceived", msgEvent);
                            } catch (Exception e) {
                                Log.e(TAG, "Message parse error", e);
                            }
                        }
                    } else if (ch != '\r') {
                        messageBuffer.append((char) ch);
                    }
                }

                // Client disconnected
                notifyListeners("clientDisconnected", new JSObject());
            } catch (Exception e) {
                Log.e(TAG, "Client handler error", e);
                notifyListeners("clientDisconnected", new JSObject());
            } finally {
                try { socket.close(); } catch (Exception ignored) {}
                synchronized (clientLock) {
                    if (clientSocket == socket) {
                        clientSocket = null;
                    }
                }
            }
        });
    }

    @PluginMethod
    public void sendMessage(PluginCall call) {
        String message = call.getString("message", "");
        synchronized (clientLock) {
            if (clientSocket == null || clientSocket.isClosed()) {
                call.reject("No client connected");
                return;
            }
            try {
                OutputStream output = clientSocket.getOutputStream();
                output.write((message + "\n").getBytes());
                output.flush();
                call.resolve();
            } catch (Exception e) {
                call.reject("Failed to send message", e);
            }
        }
    }

    @PluginMethod
    public void stopServer(PluginCall call) {
        running.set(false);
        try {
            synchronized (clientLock) {
                if (clientSocket != null && !clientSocket.isClosed()) {
                    clientSocket.close();
                }
                clientSocket = null;
            }
            if (serverSocket != null && !serverSocket.isClosed()) {
                serverSocket.close();
            }
            if (executor != null) {
                executor.shutdownNow();
            }
        } catch (Exception e) {
            Log.e(TAG, "Stop error", e);
        }
        call.resolve();
    }

    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject result = new JSObject();
        result.put("running", running.get());
        result.put("ip", getLocalIpAddress());
        synchronized (clientLock) {
            result.put("clientConnected", clientSocket != null && !clientSocket.isClosed());
        }
        call.resolve(result);
    }

    private String getLocalIpAddress() {
        try {
            for (NetworkInterface intf : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                for (InetAddress addr : Collections.list(intf.getInetAddresses())) {
                    if (!addr.isLoopbackAddress() && addr instanceof java.net.Inet4Address) {
                        return addr.getHostAddress();
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "getLocalIpAddress", e);
        }
        return "0.0.0.0";
    }
}
