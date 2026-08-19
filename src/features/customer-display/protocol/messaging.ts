import type { ProtocolMessage } from '../types';
import { CustomerDisplayServer } from './server-plugin';
import { CustomerDisplayClient } from './client-plugin';

type MessageHandler = (msg: ProtocolMessage) => void;

export function serializeMessage(msg: ProtocolMessage): string {
  return JSON.stringify(msg);
}

export function deserializeMessage(raw: string): ProtocolMessage | null {
  try {
    return JSON.parse(raw) as ProtocolMessage;
  } catch {
    return null;
  }
}

export function setupServerListeners(
  onMessage: MessageHandler,
  onClientConnected: () => void,
  onClientDisconnected: () => void
): () => void {
  const msgListener = CustomerDisplayServer.addListener('messageReceived', (event: { message: string }) => {
    const msg = deserializeMessage(event.message);
    if (msg) onMessage(msg);
  });

  const connectListener = CustomerDisplayServer.addListener('clientConnected', () => {
    onClientConnected();
  });

  const disconnectListener = CustomerDisplayServer.addListener('clientDisconnected', () => {
    onClientDisconnected();
  });

  return () => {
    msgListener.remove();
    connectListener.remove();
    disconnectListener.remove();
  };
}

export function setupClientListeners(
  onMessage: MessageHandler,
  onDisconnected: () => void
): () => void {
  const msgListener = CustomerDisplayClient.addListener('messageReceived', (event: { message: string }) => {
    const msg = deserializeMessage(event.message);
    if (msg) onMessage(msg);
  });

  const disconnectListener = CustomerDisplayClient.addListener('disconnected', () => {
    onDisconnected();
  });

  return () => {
    msgListener.remove();
    disconnectListener.remove();
  };
}

export async function sendServerMessage(msg: ProtocolMessage): Promise<void> {
  await CustomerDisplayServer.sendMessage({ message: serializeMessage(msg) });
}

export async function sendClientMessage(msg: ProtocolMessage): Promise<void> {
  await CustomerDisplayClient.sendMessage({ message: serializeMessage(msg) });
}
