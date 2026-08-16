import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";

const appShellApiOrigin = process.env.DOCKER_ENV ? "http://backend:8000" : "http://localhost:8001";

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#x27;");

// Vite is the development HTTP server. Render its document shell here too, so
// the favicon and title arrive with the first response in development as well.
const serverAppShell = () => ({
  name: "scoutcomp-server-app-shell",
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const pathname = new URL(req.url || "/", "http://vite.local").pathname;
      if (req.method !== "GET" || pathname.includes(".") || !req.headers.accept?.includes("text/html")) {
        next();
        return;
      }
      try {
        const config = await fetch(`${appShellApiOrigin}/config`).then((response) => response.ok ? response.json() : {});
        const template = await readFile("index.html", "utf8");
        const html = await server.transformIndexHtml(pathname, template
          .replace("__SCOUTCOMP_APP_TITLE__", escapeHtml(config.app_name || "ScoutComp"))
          .replace("__SCOUTCOMP_APP_ICON__", escapeHtml(config.app_icon || "/favicon.svg")));
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html");
        res.end(html);
      } catch {
        next();
      }
    });
  },
});

export default defineConfig({
  plugins: [react(), serverAppShell()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.DOCKER_ENV ? "http://backend:8000" : "http://localhost:8001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  build: {
    outDir: "dist",
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
    globals: true,
    exclude: ["**/node_modules/**", ".node_modules-docker-orphaned/**", "**/dist/**"],
  },
});
