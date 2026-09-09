import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { AsOf, Badge } from "../design-system";
import { api, type Health } from "../api";

export function AppShell() {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);
  const status = health?.status ?? "error";
  const kind = status === "ok" ? "up" : status === "stale" || status === "unconfigured" ? "warn" : "down";
  const asOf = health?.as_of ? health.as_of.replace("T", " ").slice(0, 16) : null;
  return (
    <div style={{ display: "grid", gridTemplateRows: "48px 1fr", minHeight: "100%" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 var(--space-4)", borderBottom: "1px solid var(--border)", background: "var(--bg-elev)", height: 48 }}>
        <strong style={{ fontSize: "var(--fs-lg)", fontWeight: 500 }}>finmon</strong>
        <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
          <AsOf time={asOf} />
          <Badge kind={kind}>{status}</Badge>
        </div>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", minHeight: 0 }}>
        <nav style={{ borderRight: "1px solid var(--border)", padding: "var(--space-3)" }}>
          {["/market", "/alerts"].map((to) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                display: "block",
                height: 32,
                lineHeight: "32px",
                paddingLeft: "var(--space-3)",
                textDecoration: "none",
                color: "var(--text)",
                background: isActive ? "var(--bg-selected)" : "transparent",
                borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
              })}
            >
              {to === "/market" ? "Market" : "Alerts"}
            </NavLink>
          ))}
        </nav>
        <main style={{ padding: "var(--space-4)", minWidth: 0 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
