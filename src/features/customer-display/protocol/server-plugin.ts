import { registerPlugin } from '@capacitor/core';

export interface CustomerDisplayServerPluginDef {
  startServer(options: { port: number; sessionId: string; token: string }): Promise<{ ip: string; port: number; started: boolean }>;
  sendMessage(options: { message: string }): Promise<void>;
  stopServer(): Promise<void>;
  getInfo(): Promise<{ running: boolean; ip: string; clientConnected: boolean }>;
}

export const CustomerDisplayServer = registerPlugin<CustomerDisplayServerPluginDef>(
  'CustomerDisplayServer',
  {
    web: () => ({
      async startServer() {
        return { ip: '0.0.0.0', port: 0, started: false };
      },
      async sendMessage() {},
      async stopServer() {},
      async getInfo() {
        return { running: false, ip: '', clientConnected: false };
      },
    }),
  }
);
