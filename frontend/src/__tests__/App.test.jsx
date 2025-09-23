import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";

import App from "../App";
import { AuthProvider } from "../providers/AuthProvider";
import { ConfigProvider } from "../providers/ConfigProvider";
import i18n from "../i18n";

describe("App shell", () => {
  it("renders login link when logged out", () => {
    const queryClient = new QueryClient();

    const { getByText } = render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <ConfigProvider>
                <App />
              </ConfigProvider>
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </I18nextProvider>
    );

    expect(getByText(/login/i)).toBeInTheDocument();
  });
});
