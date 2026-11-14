import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type PaperAccount, type SymbolRow } from "../api";
import { Banner, Button, EmptyState, Input, Segmented, Table, formatDong } from "../design-system";

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

  const load = () =>
    api
      .paper()
      .then((next) => {
        setBook(next);
        setErr(null);
      })
      .catch(() => setErr("Failed to load paper book"));

  useEffect(() => {
    load();
  }, []);

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
      setBook(next);
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
      {book && book.fills.length > 0 ? (
        <div className="trade-block">
          <h2 className="trade-heading">Fills</h2>
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
                {book.fills.map((fill) => (
                  <tr key={fill.id}>
                    <td className="ticker-cell">{formatFillTime(fill.created_at)}</td>
                    <td className={fill.side === "buy" ? "pnl-up" : "pnl-down"}>{fill.side}</td>
                    <td className="ticker-cell">
                      <Link to={`/symbol/${fill.ticker}`}>{fill.ticker}</Link>
                    </td>
                    <td className="num">{formatDong(fill.quantity)}</td>
                    <td className="num">{formatDong(fill.price)}</td>
                    <td className={`num ${pnlClass(fill.realized_pnl)}`}>{formatPnl(fill.realized_pnl)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
