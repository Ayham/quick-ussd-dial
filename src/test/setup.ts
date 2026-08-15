import "@testing-library/jest-dom";
import { webcrypto } from "node:crypto";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// jsdom's Crypto (jsdom 20) exposes getRandomValues/randomUUID but not
// crypto.subtle. The signed license cache and the test helper need WebCrypto
// Ed25519, so install Node's full WebCrypto implementation in tests.
if (!globalThis.crypto?.subtle) {
  (globalThis as { crypto: Crypto }).crypto = webcrypto as unknown as Crypto;
}
