import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { filterIndicators, findIndicator, MAX_INDICATORS, MAX_INDICATORS_REASON, toggleIndicator } from "./indicators";

export function IndicatorPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const options = filterIndicators(query);
  const atCap = value.length >= MAX_INDICATORS;
  const activeId = open && options[active] ? `${listId}-${options[active].id}` : undefined;
  const selected = value.map((id) => findIndicator(id)).filter((item) => item != null);

  function openWith(nextQuery: string) {
    const nextOptions = filterIndicators(nextQuery);
    const current = nextOptions.findIndex((item) => value.includes(item.id));
    setQuery(nextQuery);
    setActive(current >= 0 ? current : 0);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setQuery("");
  }

  function toggle(id: string) {
    const next = toggleIndicator(value, id);
    if (next === value) return;
    onChange(next);
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

  useEffect(() => {
    if (!open) return;
    document.getElementById(activeId ?? "")?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeId]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLDivElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        openWith("");
        return;
      }
      setActive((index) => Math.min(index + 1, Math.max(options.length - 1, 0)));
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
      const choice = options[active];
      if (choice) toggle(choice.id);
      return;
    }
    if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault();
      close();
      return;
    }
    if (!open && event.key === " ") {
      event.preventDefault();
      openWith("");
      return;
    }
    if (!open && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      openWith(event.key);
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
            aria-label="Indicator"
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Filter indicators"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
        ) : (
          <div
            className="indicator-picker-value"
            role="combobox"
            tabIndex={0}
            aria-label="Indicator"
            aria-expanded={false}
            aria-controls={listId}
            aria-autocomplete="list"
            title={selected.map((item) => item.label).join(", ")}
            onKeyDown={onKeyDown}
          >
            {selected.length === 0 ? (
              <span className="indicator-placeholder">Indicators</span>
            ) : (
              selected.map((item) => (
                <span className="indicator-chip" key={item.id}>
                  <span>{item.label}</span>
                  <button
                    type="button"
                    className="indicator-chip-x"
                    aria-label={`Remove ${item.label}`}
                    onMouseDown={stop}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggle(item.id);
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
        <ul className="indicator-menu" id={listId} role="listbox" aria-label="Indicators" aria-multiselectable="true">
          {options.length === 0 ? (
            <li className="indicator-empty" role="presentation">
              No matches
            </li>
          ) : (
            options.map((item, index) => {
              const checked = value.includes(item.id);
              const blocked = atCap && !checked;
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
                  {blocked ? <span className="indicator-option-note">{MAX_INDICATORS_REASON}</span> : null}
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
