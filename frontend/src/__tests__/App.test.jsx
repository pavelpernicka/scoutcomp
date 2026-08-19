import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";

import App from "../App";
import { AuthProvider } from "../providers/AuthProvider";
import { ConfigProvider } from "../providers/ConfigProvider";
import i18n from "../i18n";
import api from "../services/api";

describe("App shell", () => {
  it("redirects logged-out visitors to the standalone login route", async () => {
    window.history.replaceState({}, "", "/");
    const get = vi.spyOn(api, "get").mockImplementation(async (url) => ({
      data: url === "/config"
        ? { app_name: "ScoutComp" }
        : url === "/auth/options"
          ? { allow_member_registration: false, allow_admin_bootstrap: false }
          : [],
    }));
    const queryClient = new QueryClient();

    const { container } = render(
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
    );

    await waitFor(() => {
      expect(container.querySelector(".auth-page")).toBeInTheDocument();
    }, { timeout: 5000 });
    expect(container.querySelector(".app-navbar")).not.toBeInTheDocument();
    expect(container.querySelector(".app-content")).not.toBeInTheDocument();
    get.mockRestore();
  });
});
