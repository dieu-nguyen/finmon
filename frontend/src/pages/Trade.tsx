import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type PaperAccount, type SymbolRow } from "../api";
import { Banner, Button, EmptyState, Input, Segmented, Table, formatDong } from "../design-system";
import { addCivilDays, ictYmd } from "../time";

type FillRange = "all" | "today" | "7d" | "30d";
type FillResult = "all" | "win" | "lose";

function paperFillQuery(range: FillRange, ticker: string, result: FillResult): string {
  const params = new URLSearchParams();
  const code = ticker.trim().toUpperCase();
  if (code) params.set("ticker", code);
  if (result !== "all") params.set("result", result);
  if (range !== "all") {
    const to = ictYmd();
    const from = range === "today" ? to : addCivilDays(to, range === "7d" ? -6 : -29);
    params.set("from", from);
    params.set("to", to);
  }
  const q = params.toString();
  return q ? `?${q}` : "";
}

function formatPnl(n: number): string {
  if (n === 0) return formatDong(0);
  return `${n > 0 ? "+" : ""}${formatDong(n)}`;
}

function pnlClass(n: number): string {
  if (n > 0) return "pnl-up";
  if (n < 0) return "pnl-down";
  return "";
}

function formatFillTime(value: string): string {
  return value.replace("T", " ").slice(0, 16);
}

export function Trade() {
  const [book, setBook] = useState<PaperAccount | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [ticker, setTicker] = useState("");
  const [quantity, setQuantity] = useState("");
  const [quote, setQuote] = useState<SymbolRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState<FillRange>("all");
  const [symbol, setSymbol] = useState("");
  const [debouncedSymbol, setDebouncedSymbol] = useState("");
  const [result, setResult] = useState<FillResult>("all");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSymbol(symbol.trim().toUpperCase()), 200);
    return () => window.clearTimeout(timer);
  }, [symbol]);

  const fillQuery = paperFillQuery(range, debouncedSymbol, result);

  useEffect(() => {
    const ctrl = new AbortController();
    api
      .paper(fillQuery, { signal: ctrl.signal })
      .then((next) => {
        setBook(next);
        setErr(null);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setErr("Failed to load paper book");
      });
    return () => ctrl.abort();
  }, [fillQuery]);

  useEffect(() => {
    const code = ticker.trim().toUpperCase();
    if (!code) {
      setQuote(null);
      return;
    }
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      api
        .symbol(code, { signal: ctrl.signal })
        .then((row) => {
          if (!ctrl.signal.aborted) setQuote(row);
        })
        .catch(() => {
          if (!ctrl.signal.aborted) setQuote(null);
        });
    }, 200);
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [ticker]);

  const fill = async () => {
    const code = ticker.trim().toUpperCase();
    const qty = Number(quantity);
    if (!code || !Number.isInteger(qty) || qty < 1) {
      setErr("Enter a ticker and a whole-share quantity");
      return;
    }
    setBusy(true);
    try {
      const next = await api.paperOrder({ side, ticker: code, quantity: qty });
      setBook(fillQuery ? await api.paper(fillQuery) : next);
      setErr(null);
      setQuantity("");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Fill failed");
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      const next = await api.paperReset();
      setBook(next);
      setErr(null);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  const last = quote?.last ?? null;
  const stats = book
    ? [
        { label: "Cash", value: formatDong(book.cash) },
        { label: "Equity", value: formatDong(book.equity) },
        { label: "Unrealized", value: formatPnl(book.unrealized_pnl), tone: pnlClass(book.unrealized_pnl) },
        { label: "Realized", value: formatPnl(book.realized_pnl), tone: pnlClass(book.realized_pnl) },
        { label: "Total P&L", value: formatPnl(book.total_pnl), tone: pnlClass(book.total_pnl) },
      ]
    : [];

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">
          Trade
          <span className="page-sub">mock · fill at last</span>
        </h1>
        <Button type="button" variant="ghost" onClick={reset} disabled={busy || !book}>
          Reset
        </Button>
      </div>
      {err ? <Banner kind="error">{err}</Banner> : null}
      {book ? (
        <div className="stat-strip">
          {stats.map((stat) => (
            <div className="stat-card" key={stat.label}>
              <div className="stat-label">{stat.label}</div>
              <div className={`stat-value ${stat.tone ?? ""}`}>{stat.value}</div>
            </div>
          ))}
        </div>
      ) : null}
      <form
        className="form-panel"
        onSubmit={(e) => {
          e.preventDefault();
          fill();
        }}
      >
        <div className="form-row">
          <label className="field">
            Side
            <Segmented
              label="Side"
              options={[
                { value: "buy", label: "Buy" },
                { value: "sell", label: "Sell" },
              ]}
              value={side}
              onChange={(value) => setSide(value === "sell" ? "sell" : "buy")}
            />
          </label>
          <label className="field">
            Ticker
            <Input
              placeholder="Ticker"
              aria-label="Ticker"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              style={{ background: "var(--bg)", width: 120, fontFamily: "var(--font-num)", textTransform: "uppercase" }}
            />
          </label>
          <label className="field">
            Quantity
            <Input
              placeholder="Shares"
              aria-label="Quantity"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              style={{ background: "var(--bg)", width: 120, fontFamily: "var(--font-num)", textAlign: "right" }}
            />
          </label>
          <div className="fill-last">{last != null ? <>Last {formatDong(last)}</> : <span>Last —</span>}</div>
          <div className="form-actions">
            <Button type="submit" disabled={busy}>
              Fill
            </Button>
          </div>
        </div>
      </form>
      {book && book.positions.length === 0 ? <EmptyState text="No positions. Fill a buy at last price." /> : null}
      {book && book.positions.length > 0 ? (
        <div className="table-panel">
          <Table className="heads-up sticky-head">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Name</th>
                <th className="num">Qty</th>
                <th className="num">Avg</th>
                <th className="num">Last</th>
                <th className="num">Value</th>
                <th className="num">P&L</th>
              </tr>
            </thead>
            <tbody>
              {book.positions.map((pos) => (
                <tr key={pos.ticker}>
                  <td className="ticker-cell">
                    <Link to={`/symbol/${pos.ticker}`}>{pos.ticker}</Link>
                  </td>
                  <td>{pos.name}</td>
                  <td className="num">{formatDong(pos.quantity)}</td>
                  <td className="num">{formatDong(pos.avg_cost)}</td>
                  <td className="num">{formatDong(pos.last)}</td>
                  <td className="num">{formatDong(pos.market_value)}</td>
                  <td className={`num ${pnlClass(pos.unrealized_pnl)}`}>{formatPnl(pos.unrealized_pnl)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : null}
      {book ? (
        <div className="trade-block">
          <h2 className="trade-heading">Fills</h2>
          <div className="toolbar">
            <Segmented
              label="Range"
              options={[
                { value: "all", label: "All" },
                { value: "today", label: "Today" },
                { value: "7d", label: "7d" },
                { value: "30d", label: "30d" },
              ]}
              value={range}
              onChange={(value) => setRange(value === "today" || value === "7d" || value === "30d" ? value : "all")}
            />
            <Input
              placeholder="Symbol"
              aria-label="Symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              style={{ background: "var(--bg)", width: 120, fontFamily: "var(--font-num)", textTransform: "uppercase" }}
            />
            <Segmented
              label="Result"
              options={[
                { value: "all", label: "All" },
                { value: "win", label: "Win" },
                { value: "lose", label: "Lose" },
              ]}
              value={result}
              onChange={(value) => setResult(value === "win" || value === "lose" ? value : "all")}
            />
          </div>
          {book.fills.length === 0 ? <EmptyState text="No fills in this range." /> : null}
          {book.fills.length > 0 ? (
            <div className="table-panel">
              <Table className="heads-up sticky-head">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Side</th>
                    <th>Ticker</th>
                    <th className="num">Qty</th>
                    <th className="num">Price</th>
                    <th className="num">Realized</th>
                  </tr>
                </thead>
                <tbody>
                  {book.fills.map((row) => (
                    <tr key={row.id}>
                      <td className="ticker-cell">{formatFillTime(row.created_at)}</td>
                      <td className={row.side === "buy" ? "pnl-up" : "pnl-down"}>{row.side}</td>
                      <td className="ticker-cell">
                        <Link to={`/symbol/${row.ticker}`}>{row.ticker}</Link>
                      </td>
                      <td className="num">{formatDong(row.quantity)}</td>
                      <td className="num">{formatDong(row.price)}</td>
                      <td className={`num ${pnlClass(row.realized_pnl)}`}>{formatPnl(row.realized_pnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
