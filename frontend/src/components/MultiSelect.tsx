import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

export type MultiOption = { id: string; label: string; disabled?: boolean; reason?: string };

export function MultiSelect({
  label,
  placeholder,
  options,
  value,
  onChange,
  onQuery,
}: {
  label: string;
  placeholder: string;
  options: MultiOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  onQuery?: (query: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const needle = query.trim().toLowerCase();
  const shown = onQuery
    ? options
    : options.filter((item) => item.label.toLowerCase().includes(needle) || item.id.toLowerCase().includes(needle));
  const activeId = open && shown[active] ? `${listId}-${shown[active].id}` : undefined;
  const labels = new Map(options.map((item) => [item.id, item.label]));

  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    const menu = menuRef.current;
    if (!root || !menu) return;
    // Stay inside the nearest clipping ancestor so the menu scrollbar can reach the last row.
    const fit = () => {
      let limit = window.innerHeight;
      let node = root.parentElement;
      while (node) {
        const overflow = getComputedStyle(node).overflowY;
        if (overflow === "auto" || overflow === "hidden" || overflow === "clip" || overflow === "scroll") {
          limit = Math.min(limit, node.getBoundingClientRect().bottom);
        }
        node = node.parentElement;
      }
      const space = Math.floor(limit - root.getBoundingClientRect().bottom - 8);
      menu.style.maxHeight = `${Math.max(96, Math.min(320, space))}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [open, shown.length]);

  useEffect(() => {
    if (!open || !activeId) return;
    document.getElementById(activeId)?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeId]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  function toggle(id: string) {
    const option = options.find((item) => item.id === id);
    if (option?.disabled && !value.includes(id)) return;
    onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
  }

  function openWith(next: string) {
    setQuery(next);
    setActive(0);
    setOpen(true);
    onQuery?.(next);
  }

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: globalThis.MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLDivElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        openWith("");
        return;
      }
      setActive((index) => Math.min(index + 1, Math.max(shown.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return;
      setActive((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (!open) {
        openWith("");
        return;
      }
      const choice = shown[active];
      if (choice) toggle(choice.id);
      return;
    }
    if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault();
      close();
    }
  }

  function stop(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  function openFromControl(event: MouseEvent<HTMLDivElement>) {
    if (open || (event.target as HTMLElement).closest("button")) return;
    event.stopPropagation();
    openWith("");
  }

  const empty = onQuery && !needle ? "Type to search" : "No matches";

  return (
    <div className="indicator-picker" ref={rootRef}>
      <div
        className={open ? "indicator-picker-control is-open" : "indicator-picker-control"}
        onMouseDown={openFromControl}
        onClick={openFromControl}
      >
        {open ? (
          <input
            ref={inputRef}
            className="indicator-picker-input"
            role="combobox"
            aria-label={label}
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={placeholder}
            value={query}
            onChange={(event) => {
              const next = event.target.value;
              setQuery(next);
              setActive(0);
              onQuery?.(next);
            }}
            onKeyDown={onKeyDown}
          />
        ) : (
          <div
            className="indicator-picker-value"
            role="combobox"
            tabIndex={0}
            aria-label={label}
            aria-expanded={false}
            aria-controls={listId}
            aria-autocomplete="list"
            onKeyDown={onKeyDown}
          >
            {value.length === 0 ? (
              <span className="indicator-placeholder">{placeholder}</span>
            ) : (
              value.map((id) => (
                <span className="indicator-chip" key={id}>
                  <span>{labels.get(id) ?? id}</span>
                  <button
                    type="button"
                    className="indicator-chip-x"
                    aria-label={`Remove ${labels.get(id) ?? id}`}
                    onMouseDown={stop}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggle(id);
                    }}
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>
        )}
        <span className="indicator-chevron" aria-hidden="true" />
      </div>
      {open ? (
        <ul className="indicator-menu" id={listId} role="listbox" aria-label={label} aria-multiselectable="true" ref={menuRef}>
          {shown.length === 0 ? (
            <li className="indicator-empty" role="presentation">
              {empty}
            </li>
          ) : (
            shown.map((item, index) => {
              const checked = value.includes(item.id);
              const blocked = Boolean(item.disabled) && !checked;
              return (
                <li
                  key={item.id}
                  id={`${listId}-${item.id}`}
                  role="option"
                  aria-selected={checked}
                  aria-disabled={blocked || undefined}
                  className={["indicator-option", index === active ? "is-active" : "", blocked ? "is-disabled" : ""].filter(Boolean).join(" ")}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={stop}
                  onClick={() => toggle(item.id)}
                >
                  <span className="indicator-check" aria-hidden="true" />
                  <span className="indicator-option-label">{item.label}</span>
                  {blocked && item.reason ? <span className="indicator-option-note">{item.reason}</span> : null}
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
