import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

function json(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: async () => body,
  } as Response);
}

function health(status: string, asOf: string | null = "2026-09-08T15:00:00") {
  return {
    status,
    as_of: asOf,
    watermarks: [],
    dnse_configured: status !== "unconfigured",
    telegram_configured: false,
  };
}

function renderShell(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/market" element={<div>Market page</div>} />
          <Route path="/alerts" element={<div>Alerts page</div>} />
          <Route path="/patterns" element={<div>Patterns page</div>} />
          <Route path="/scans" element={<div>Scans page</div>} />
          <Route path="/symbol/:ticker" element={<div>Symbol page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("App shell", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the as-of time and an ok chip", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json(health("ok"))));
    renderShell("/market");
    expect(await screen.findByText("as of 2026-09-08 15:00 ICT")).toBeInTheDocument();
    const chip = screen.getByText("ok");
    expect(chip).toHaveClass("status-pill", "up");
    expect(screen.getByRole("link", { name: /Market/ })).toHaveClass("active");
  });

  it("warns when health is stale or unconfigured", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json(health("stale"))));
    const first = renderShell("/alerts");
    expect(await screen.findByText("stale")).toHaveClass("status-pill", "warn");
    first.unmount();

    vi.stubGlobal("fetch", vi.fn(() => json(health("unconfigured", null))));
    renderShell("/alerts");
    expect(await screen.findByText("unconfigured")).toHaveClass("status-pill", "warn");
    expect(screen.getByText("as of —")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Alerts/ })).toHaveClass("active");
  });

  it("marks Market active on a symbol page and shows error when health fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({}, false)));
    renderShell("/symbol/VCB");
    expect(await screen.findByText("error")).toHaveClass("status-pill", "down");
    expect(screen.getByRole("link", { name: /Market/ })).toHaveClass("active");
    expect(screen.getByRole("link", { name: /Alerts/ })).not.toHaveClass("active");
    expect(screen.getByText("Symbol page")).toBeInTheDocument();
  });
});
