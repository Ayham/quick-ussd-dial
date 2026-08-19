import { registerPlugin } from '@capacitor/core';

export interface CustomerDisplayClientPluginDef {
  connect(options: { host: string; port: number; token: string; sessionId: string }): Promise<{ connected: boolean }>;
  sendMessage(options: { message: string }): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): Promise<{ connected: boolean }>;
}

export const CustomerDisplayClient = registerPlugin<CustomerDisplayClientPluginDef>(
  'CustomerDisplayClient',
  {
    web: () => ({
      async connect() {
        return { connected: false };
      },
      async sendMessage() {},
      async disconnect() {},
      async isConnected() {
        return { connected: false };
      },
    }),
  }
);
