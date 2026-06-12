"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Multi-select assignee picker: a checklist dropdown with chips, type-to-filter,
// and the ability to add a brand-new name (which persists to the People table).
// Value in/out is the comma-separated string the initiative model already uses.
export default function AssigneePicker({
  value,
  onChange,
  options,
  onAddPerson,
  placeholder = "Select people…",
}: {
  value: string;
  onChange: (next: string) => void;
  options: string[];           // known display names
  onAddPerson: (name: string) => Promise<void> | void; // persist a new name
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => value.split(",").map((s) => s.trim()).filter(Boolean),
    [value]
  );

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = options.filter((o) => !q || o.toLowerCase().includes(q));
  // An exact (case-insensitive) match already exists?
  const exactExists =
    options.some((o) => o.toLowerCase() === q) || selected.some((s) => s.toLowerCase() === q);
  const canAdd = q.length > 0 && !exactExists;

  function setSelected(next: string[]) {
    // De-dupe case-insensitively, preserve order.
    const seen = new Set<string>();
    const out: string[] = [];
    for (const n of next) {
      const k = n.toLowerCase();
      if (!seen.has(k)) { seen.add(k); out.push(n); }
    }
    onChange(out.join(", "));
  }

  function toggle(name: string) {
    if (selected.some((s) => s.toLowerCase() === name.toLowerCase())) {
      setSelected(selected.filter((s) => s.toLowerCase() !== name.toLowerCase()));
    } else {
      setSelected([...selected, name]);
    }
  }

  function remove(name: string) {
    setSelected(selected.filter((s) => s.toLowerCase() !== name.toLowerCase()));
  }

  async function addNew() {
    const name = query.trim();
    if (!name || adding) return;
    setAdding(true);
    try {
      await onAddPerson(name); // persists + refreshes options upstream
      setSelected([...selected, name]);
      setQuery("");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="ap" ref={ref}>
      {/* Control: chips + toggle */}
      <div className="ap-control" onClick={() => setOpen((v) => !v)}>
        <div className="ap-chips">
          {selected.length === 0 && <span className="ap-placeholder">{placeholder}</span>}
          {selected.map((name) => (
            <span key={name} className="ap-chip">
              {name}
              <button
                type="button"
                className="ap-chip-x"
                aria-label={`Remove ${name}`}
                onClick={(e) => { e.stopPropagation(); remove(name); }}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
        <span className={`ap-caret ${open ? "open" : ""}`} aria-hidden>▾</span>
      </div>

      {open && (
        <div className="ap-menu">
          <input
            autoFocus
            className="ap-search"
            placeholder="Filter or add a name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); if (canAdd) addNew(); }
            }}
          />
          <div className="ap-options">
            {filtered.map((name) => {
              const isOn = selected.some((s) => s.toLowerCase() === name.toLowerCase());
              return (
                <button
                  key={name}
                  type="button"
                  className={`ap-option ${isOn ? "on" : ""}`}
                  onClick={() => toggle(name)}
                >
                  <span className={`ap-check ${isOn ? "on" : ""}`} aria-hidden>{isOn ? "✓" : ""}</span>
                  {name}
                </button>
              );
            })}
            {filtered.length === 0 && !canAdd && (
              <div className="ap-empty">No matching people.</div>
            )}
          </div>
          {canAdd && (
            <button type="button" className="ap-add" onClick={addNew} disabled={adding}>
              {adding ? "Adding…" : <>+ Add “{query.trim()}”</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
