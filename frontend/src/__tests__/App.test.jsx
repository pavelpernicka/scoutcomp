import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";

import App from "../App";
import { AuthProvider } from "../providers/AuthProvider";

describe("App shell", () => {
  it("renders login link when logged out", () => {
    const { getByText } = render(
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    );

    expect(getByText(/login/i)).toBeInTheDocument();
  });
});
