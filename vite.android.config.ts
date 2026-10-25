// Android/Capacitor build: same app, but no Electron plugin, and "electron" is replaced by a tiny stub.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import pkg from "./package.json" with { type: "json" };
import { contentSecurityPolicyPlugin } from "./vite.csp";

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), tailwindcss(), contentSecurityPolicyPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      electron: path.resolve(import.meta.dirname, "./src/android/electron-stub.ts"),
      "next/navigation": path.resolve(import.meta.dirname, "./src/lib/navigation.tsx"),
      "next/link": path.resolve(import.meta.dirname, "./src/lib/navigation.tsx"),
      "next/image": path.resolve(import.meta.dirname, "./src/components/ui/AppImage.tsx"),
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
