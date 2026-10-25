// Must be the FIRST import in src/main.tsx. Installs a replacement for the Electron preload
// bridge (window.linerElectron) so the existing React app runs unchanged inside Android.
import { Capacitor } from "@capacitor/core";
import { installNativeFetch } from "./net";
import * as signer from "./signer";

declare const __APP_VERSION__: string;

function install(): void {
  installNativeFetch();

  const emptyCacheStats = {
    cacheSize: 0, httpCacheSize: 0, codeCacheSize: 0, serviceWorkerSize: 0,
    indexedDbSize: 0, localStorageSize: 0, blobStorageSize: 0, cachePath: "",
  };

  const explicit: Record<string, unknown> = {
    platform: "android",
    isHyprland: false,
    getAppVersion: async () => __APP_VERSION__,

    // request signing (same WASM as desktop)
    signRequest: signer.signRequest,
    signMonitorRequest: signer.signMonitorRequest,
    signCoverUrl: signer.signCoverUrl,
    signRawPayload: signer.signRawPayload,
    syncServerTime: signer.syncServerTime,
    getServerTimeOffset: signer.getServerTimeOffset,

    // YouTube helpers: the desktop worker code, loaded on demand and run in the WebView
    mintPoToken: async (identifier: string) =>
      (await import("../../electron/youtube/web-minter")).mintWebPoToken(identifier),
    youtubeTvSession: async () => (await import("../../electron/youtube/tv-session")).getTvSession(),
    youtubeSolveN: async (playerId: string, values: string[]) =>
      (await import("../../electron/youtube/n-solver")).solveN(playerId, values),

    // undefined on purpose: the app then keeps its login session in localStorage
    authSession: undefined,

    // desktop-only features reported as "nothing to do"
    isMaximized: async () => false,
    isFullScreen: async () => false,
    getCacheStats: async () => emptyCacheStats,
    checkForUpdates: async () => ({ available: false }),
    downloadUpdate: async () => ({ success: false }),
  };

  // any other desktop-only member becomes a harmless no-op
  const bridge = new Proxy(explicit, {
    get(target, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      if (prop in target) return target[prop];
      if (/^on[A-Z]/.test(prop)) return () => () => {};
      return async () => undefined;
    },
  });

  (window as unknown as { linerElectron: unknown }).linerElectron = bridge;
}

if (Capacitor.isNativePlatform()) install();
