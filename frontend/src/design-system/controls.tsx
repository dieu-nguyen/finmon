import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TableHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "danger";

export function Button({ variant = "primary", children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, CSSProperties> = {
    primary: { background: "var(--accent)", color: "var(--bg)", border: "1px solid var(--accent)" },
    ghost: { background: "transparent", color: "var(--text)", border: "1px solid var(--border)" },
    danger: { background: "transparent", color: "var(--down)", border: "1px solid var(--down)" },
  };
  return (
    <button
      {...rest}
      style={{
        height: "var(--control-h)",
        padding: "0 var(--space-3)",
        borderRadius: "var(--radius)",
        cursor: rest.disabled ? "not-allowed" : "pointer",
        opacity: rest.disabled ? 0.4 : 1,
        ...styles[variant],
        ...rest.style,
      }}
    >
      {children}
    </button>
  );
}

export function IconButton({ label, children, active, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      {...rest}
      style={{
        width: 32,
        height: 32,
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        background: active ? "var(--accent)" : "transparent",
        color: active ? "var(--bg)" : "var(--text)",
        cursor: "pointer",
        ...rest.style,
      }}
    >
      {children}
    </button>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        height: "var(--control-h)",
        background: "var(--bg-elev)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "0 var(--space-2)",
        outline: "none",
        ...props.style,
      }}
      onFocus={(e) => {
        e.currentTarget.style.boxShadow = "0 0 0 2px var(--accent)";
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = "none";
        props.onBlur?.(e);
      }}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      style={{
        height: "var(--control-h)",
        background: "var(--bg-elev)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "0 var(--space-2)",
        ...props.style,
      }}
    />
  );
}

export function Checkbox(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="checkbox" {...props} style={{ width: 16, height: 16, accentColor: "var(--accent)", ...props.style }} />;
}

export function Tabs({ tabs, value, onChange }: { tabs: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", gap: "var(--space-4)", borderBottom: "1px solid var(--border)" }}>
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          style={{
            background: "none",
            border: "none",
            borderBottom: value === t ? "2px solid var(--accent)" : "2px solid transparent",
            color: value === t ? "var(--accent)" : "var(--text-muted)",
            height: 32,
            cursor: "pointer",
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

export function Badge({ kind, children }: { kind: "up" | "down" | "muted" | "warn"; children: ReactNode }) {
  const color = { up: "var(--up)", down: "var(--down)", muted: "var(--text-muted)", warn: "var(--warn)" }[kind];
  return (
    <span style={{ color, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "0 6px", fontSize: "var(--fs-xs)", fontFamily: "var(--font-num)" }}>
      {children}
    </span>
  );
}

export function Table({ children, ...rest }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table {...rest} style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-sm)", ...rest.style }}>
      {children}
    </table>
  );
}

export function Panel({ children }: { children: ReactNode }) {
  return <div style={{ background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "var(--space-4)" }}>{children}</div>;
}

export function EmptyState({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div style={{ color: "var(--text-muted)", padding: "var(--space-6)" }}>
      <div>{text}</div>
      {action}
    </div>
  );
}

export function Banner({ kind, children, onDismiss }: { kind: "error" | "warn" | "info"; children: ReactNode; onDismiss?: () => void }) {
  const color = kind === "error" ? "var(--down)" : kind === "warn" ? "var(--warn)" : "var(--accent)";
  return (
    <div style={{ border: `1px solid ${color}`, color, padding: "var(--space-2) var(--space-3)", borderRadius: "var(--radius)", display: "flex", justifyContent: "space-between" }}>
      <span>{children}</span>
      {onDismiss ? (
        <button onClick={onDismiss} style={{ background: "none", border: "none", color, cursor: "pointer" }}>
          ×
        </button>
      ) : null}
    </div>
  );
}

export function Toast({ text }: { text: string }) {
  return (
    <div style={{ position: "fixed", right: 16, bottom: 16, background: "var(--bg-elev)", border: "1px solid var(--border)", padding: "var(--space-3)", borderRadius: "var(--radius)" }}>
      {text}
    </div>
  );
}

export function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--overlay)", display: "grid", placeItems: "center" }} onClick={onClose}>
      <div style={{ background: "var(--bg-elev)", maxWidth: 480, width: "90%", padding: "var(--space-4)", borderRadius: "var(--radius)" }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function Spinner() {
  return <div className="finmon-spinner" style={{ width: 16, height: 16, border: "2px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%" }} />;
}

export function AsOf({ time }: { time?: string | null }) {
  return <span style={{ color: "var(--text-muted)", fontSize: "var(--fs-sm)" }}>as of {time ? `${time} ICT` : "—"}</span>;
}

export function formatDong(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("vi-VN").format(Math.round(n));
}

export function ChangeCell({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="change-cell muted">—</span>;
  const cls = value > 0 ? "up" : value < 0 ? "down" : "muted";
  const sign = value > 0 ? "+" : "";
  return (
    <span className={`change-cell ${cls}`} style={{ color: value > 0 ? "var(--up)" : value < 0 ? "var(--down)" : "var(--text-muted)", fontFamily: "var(--font-num)" }}>
      {sign}
      {value.toFixed(2)}%
    </span>
  );
}

export function PriceCell({ value }: { value: number | null | undefined }) {
  return <span className="price-cell" style={{ fontFamily: "var(--font-num)" }}>{formatDong(value)}</span>;
}
