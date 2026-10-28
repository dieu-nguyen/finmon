import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

export type MultiOption = { id: string; label: string; disabled?: boolean; reason?: string };

const ALL_ID = "__all__";

/** `select` checks every enabled option. `exclusive` is a separate whole-set mode, such as the market. */
export type MultiSelectAll =
  | { mode: "select"; label?: string }
  | { mode: "exclusive"; label?: string; active: boolean; onActiveChange: (active: boolean) => void };

export function MultiSelect({
  label,
  placeholder,
  options,
  value,
  onChange,
  onQuery,
  all,
}: {
  label: string;
  placeholder: string;
  options: MultiOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  onQuery?: (query: string) => void;
  all?: MultiSelectAll;
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
  const allLabel = all?.label ?? "All";
  const enabledIds = options.filter((item) => !item.disabled).map((item) => item.id);
  const selectAllOn = all?.mode === "select" && enabledIds.length > 0 && enabledIds.every((id) => value.includes(id));
  const exclusiveOn = all?.mode === "exclusive" && all.active;
  const showAllValue = selectAllOn || exclusiveOn;
  const allVisible = Boolean(all) && (needle === "" || allLabel.toLowerCase().includes(needle));
  const menu = allVisible ? [{ id: ALL_ID, label: allLabel, disabled: false }, ...shown] : shown;
  const activeId = open && menu[active] ? `${listId}-${menu[active].id}` : undefined;
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
  }, [open, menu.length]);

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

  function pickAll() {
    if (!all) return;
    if (all.mode === "exclusive") {
      all.onActiveChange(!all.active);
      return;
    }
    onChange(selectAllOn ? value.filter((id) => !enabledIds.includes(id)) : enabledIds);
  }

  function clearAll() {
    if (!all) return;
    if (all.mode === "exclusive") {
      all.onActiveChange(false);
      return;
    }
    onChange(value.filter((id) => !enabledIds.includes(id)));
  }

  function choose(id: string) {
    if (id === ALL_ID) {
      pickAll();
      return;
    }
    toggle(id);
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
      setActive((index) => Math.min(index + 1, Math.max(menu.length - 1, 0)));
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
      const choice = menu[active];
      if (choice) choose(choice.id);
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
            {showAllValue ? (
              <span className="indicator-chip">
                <span>{allLabel}</span>
                <button
                  type="button"
                  className="indicator-chip-x"
                  aria-label={`Remove ${allLabel}`}
                  onMouseDown={stop}
                  onClick={(event) => {
                    event.stopPropagation();
                    clearAll();
                  }}
                >
                  ×
                </button>
              </span>
            ) : value.length === 0 ? (
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
          {menu.length === 0 ? (
            <li className="indicator-empty" role="presentation">
              {empty}
            </li>
          ) : (
            menu.map((item, index) => {
              const checked = item.id === ALL_ID ? showAllValue : value.includes(item.id);
              const blocked = item.id !== ALL_ID && Boolean(item.disabled) && !checked;
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
                  onClick={() => choose(item.id)}
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
