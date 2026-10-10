import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { AsOf } from "../design-system";
import { NavIcon } from "../design-system/icons";
import { api, type Health } from "../api";

const NAV: { to: string; label: string; icon: "market" | "alerts" | "patterns" | "scans" }[] = [
  { to: "/market", label: "Market", icon: "market" },
  { to: "/alerts", label: "Alerts", icon: "alerts" },
  { to: "/patterns", label: "Patterns", icon: "patterns" },
  { to: "/scans", label: "Scans", icon: "scans" },
];

export function AppShell() {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);
  const status = health?.status ?? "error";
  const kind = status === "ok" ? "up" : status === "stale" || status === "unconfigured" ? "warn" : "down";
  const asOf = health?.as_of ? health.as_of.replace("T", " ").slice(0, 16) : null;
  const path = useLocation().pathname;
  return (
    <div className="app">
      <header className="app-header">
        <strong className="wordmark">finmon</strong>
        <div className="header-meta">
          <AsOf time={asOf} />
          <span className={`status-pill ${kind}`}>
            <span className="status-dot" />
            {status}
          </span>
        </div>
      </header>
      <div className="app-body">
        <nav className="nav">
          <div className="nav-kicker">Terminal</div>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive || (item.to === "/market" && path.startsWith("/symbol")) ? "nav-link active" : "nav-link")}
            >
              <NavIcon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <main className="shell-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
