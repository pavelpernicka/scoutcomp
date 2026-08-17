import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";

import App from "./App";
import { AuthProvider } from "./providers/AuthProvider";
import { ConfigProvider } from "./providers/ConfigProvider";
import i18n from "./i18n";
import "bootstrap/dist/css/bootstrap.min.css";
import "./styles.css";

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js")
      .then(async (registration) => {
        const worker = (await navigator.serviceWorker.ready).active || registration.active;
        const assetUrls = performance.getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((url) => url.startsWith(window.location.origin) && /\/assets\/.+\.(?:js|css|svg|woff2?)$/i.test(url));
        worker?.postMessage({ type: "CACHE_ASSETS", urls: assetUrls });
      })
      .catch(() => {
        // Installation is progressive enhancement; authentication must work without it.
      });
  });
}

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            <ConfigProvider>
              <App />
            </ConfigProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </I18nextProvider>
  </React.StrictMode>
);
