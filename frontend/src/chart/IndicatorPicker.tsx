import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { filterIndicators, indicatorById } from "./indicators";

export function IndicatorPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = indicatorById(value);
  const options = filterIndicators(query);
  const activeId = open && options[active] ? `${listId}-${options[active].id}` : undefined;

  function openWith(nextQuery: string) {
    const nextOptions = filterIndicators(nextQuery);
    const current = nextOptions.findIndex((item) => item.id === value);
    setQuery(nextQuery);
    setActive(current >= 0 ? current : 0);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setQuery("");
  }

  function commit(id: string) {
    onChange(id);
    close();
  }

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(activeId ?? "")?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeId]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
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
      if (choice) commit(choice.id);
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

  return (
    <div className="indicator-picker" ref={rootRef}>
      <input
        className="indicator-picker-input"
        role="combobox"
        aria-label="Indicator"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Filter indicators"
        readOnly={!open}
        value={open ? query : selected.label}
        onMouseDown={(event) => {
          event.stopPropagation();
          if (!open) openWith("");
        }}
        onClick={() => {
          if (!open) openWith("");
        }}
        onChange={(event) => {
          if (!open) return;
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />
      <span className="indicator-chevron" aria-hidden="true" />
      {open ? (
        <ul className="indicator-menu" id={listId} role="listbox" aria-label="Indicators">
          {options.length === 0 ? (
            <li className="indicator-empty" role="presentation">
              No matches
            </li>
          ) : (
            options.map((item, index) => (
              <li
                key={item.id}
                id={`${listId}-${item.id}`}
                role="option"
                aria-selected={item.id === value}
                className={index === active ? "indicator-option is-active" : "indicator-option"}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={() => commit(item.id)}
              >
                {item.label}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
