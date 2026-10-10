export function NavIcon({ name }: { name: "market" | "alerts" | "patterns" | "scans" }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 18 18",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "market") {
    return (
      <svg {...common}>
        <path d="M2.5 14.5h13" />
        <path d="M4 14.5V8.5M8 14.5V4.5M12 14.5V7M15.5 14.5V6" />
      </svg>
    );
  }
  if (name === "alerts") {
    return (
      <svg {...common}>
        <path d="M4.5 7.5a4.5 4.5 0 0 1 9 0c0 3.2.8 4.2 1.2 4.7H3.3c.4-.5 1.2-1.5 1.2-4.7z" />
        <path d="M7.2 13.2a1.8 1.8 0 0 0 3.6 0" />
      </svg>
    );
  }
  if (name === "patterns") {
    return (
      <svg {...common}>
        <path d="M1.8 12.2 5 7.2 8.2 11 11.6 4.2 14.4 8.6 16.2 6.4" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="9" cy="9" r="6" />
      <circle cx="9" cy="9" r="2.2" />
      <path d="M9 1.5v2.2M9 14.3v2.2M1.5 9h2.2M14.3 9h2.2" />
    </svg>
  );
}

export function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 2.5h4l-.6 2.2H10L7.2 8.2 7 11.5 6.8 8.2 4 4.7h1.6L5 2.5z" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 4h9" />
      <path d="M5.2 4V2.8h3.6V4" />
      <path d="M3.6 4l.5 7.2h5.8L10.4 4" />
    </svg>
  );
}

export function ToolGlyph({ name }: { name: "pan" | "horizontal" | "trend" | "rectangle" | "fib" | "text" | "pin" | "delete" }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "pan") {
    return (
      <svg {...common}>
        <path d="M8 1.5v13M1.5 8h13" />
        <path d="M8 1.5 6 3.5M8 1.5 10 3.5M8 14.5 6 12.5M8 14.5 10 12.5M1.5 8 3.5 6M1.5 8 3.5 10M14.5 8 12.5 6M14.5 8 12.5 10" />
      </svg>
    );
  }
  if (name === "horizontal") return <svg {...common}><path d="M2 8h12" /></svg>;
  if (name === "trend") return <svg {...common}><path d="M3 13 13 3" /></svg>;
  if (name === "rectangle") return <svg {...common}><rect x="3" y="3.5" width="10" height="9" rx="1" /></svg>;
  if (name === "fib") return <svg {...common}><path d="M3 3.5h10M3 7h7M3 10.5h4" /></svg>;
  if (name === "text") return <svg {...common}><path d="M4 3.5h8M8 3.5v9" /></svg>;
  if (name === "pin") {
    return (
      <svg {...common}>
        <path d="M8 14.5V8" />
        <path d="M5.5 2.5h5L9.8 5.2H12L8.4 9.2 8 8" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M3 4.5h10" />
      <path d="M6 4.5V3h4v1.5" />
      <path d="M4.2 4.5 4.8 13h6.4l.6-8.5" />
    </svg>
  );
}
