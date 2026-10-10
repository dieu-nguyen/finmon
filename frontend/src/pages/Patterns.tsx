import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { Banner, Button, EmptyState, Input } from "../design-system";
import { readFavoriteIds, visiblePatterns, writeFavoriteIds, type PatternGuide } from "../patterns/catalog";
import { PatternSchematic } from "../patterns/schematic";

export function Patterns() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>(() => readFavoriteIds());
  const [scanning, setScanning] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const visible = visiblePatterns(query, favorites);

  function toggleFavorite(id: string) {
    setFavorites((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      writeFavoriteIds(next);
      return next;
    });
  }

  function scan(pattern: PatternGuide) {
    if (!pattern.scan || scanning) return;
    setScanning(pattern.id);
    setErr(null);
    // One call to the existing market scan. That API already sends the single Telegram message.
    api
      .runNamedScan({ patterns: [pattern.id], scope: "all", tickers: [] })
      .then(() => navigate("/scans"))
      .catch(() => {
        setErr("Scan failed");
        setScanning(null);
      });
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Patterns</h1>
      </div>
      <p className="filter-note">Well-known chart shapes. Teaching rank is how often the pattern is taught in standard technical-analysis references.</p>
      <div className="toolbar">
        <Input
          type="search"
          aria-label="Search patterns"
          className="search-input"
          placeholder="Search name or description"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {err ? <Banner kind="error">{err}</Banner> : null}
      {visible.length === 0 ? <EmptyState text="No patterns match" /> : null}
      <div className="pattern-grid">
        {visible.map((pattern) => {
          const favorite = favorites.includes(pattern.id);
          const unavailable = !pattern.scan;
          return (
            <article key={pattern.id} className="pattern-card" aria-label={pattern.name}>
              <div className="pattern-card-top">
                <PatternSchematic schematic={pattern.schematic} label={`${pattern.name} schematic`} />
                <div>
                  <h2>{pattern.name}</h2>
                  <p className="pattern-rank">
                    <span className="pattern-rank-kicker">Teaching rank</span>{" "}
                    <span className="pattern-rank-num">{pattern.rank}</span>
                  </p>
                  <p className="pattern-shape">{pattern.shape}</p>
                </div>
              </div>
              <p className="pattern-read">
                <span className="pattern-read-kicker">How to read. </span>
                {pattern.reading}
              </p>
              <div className="pattern-actions">
                <Button
                  type="button"
                  variant={favorite ? "primary" : "ghost"}
                  aria-pressed={favorite}
                  aria-label={favorite ? `Favorited ${pattern.name}` : `Favorite ${pattern.name}`}
                  onClick={() => toggleFavorite(pattern.id)}
                >
                  {favorite ? "Favorited" : "Favorite"}
                </Button>
                <div className="pattern-scan">
                  <Button
                    type="button"
                    variant={unavailable ? "ghost" : "primary"}
                    disabled={unavailable || scanning !== null}
                    aria-label={`Scan ${pattern.name}`}
                    aria-describedby={unavailable ? `${pattern.id}-scan-note` : undefined}
                    style={unavailable ? { color: "var(--text-muted)", background: "var(--bg)", borderColor: "var(--border)" } : undefined}
                    onClick={() => scan(pattern)}
                  >
                    {scanning === pattern.id ? "Scanning" : "Scan"}
                  </Button>
                  {unavailable ? (
                    <span className="pattern-scan-note" id={`${pattern.id}-scan-note`}>
                      Not available yet
                    </span>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
