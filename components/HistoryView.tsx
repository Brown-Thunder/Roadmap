"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Initiative,
  colorForAssignee,
  primaryAssigneeOf,
  AssigneeColor,
} from "@/lib/types";
import InitiativeModal from "./InitiativeModal";

const STATUS_PILL: Record<string, { bg: string; fg: string; border: string }> = {
  "In Flight": { bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe" },
  "To Do":     { bg: "#f1f5f9", fg: "#475569", border: "#e2e8f0" },
  "At Risk":   { bg: "#fff7ed", fg: "#c2410c", border: "#fed7aa" },
  Blocked:     { bg: "#fef2f2", fg: "#b91c1c", border: "#fecaca" },
  Done:        { bg: "#f0fdf4", fg: "#15803d", border: "#bbf7d0" },
};

const STASHER_ICON = (
  <svg width="28" height="24" viewBox="0 0 122 104" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M105.793 26.3962H86.4293C85.253 13.2727 74.1686 2.95496 60.7769 2.95496C47.34 2.95496 36.3009 13.2727 35.1246 26.3962H15.7609C8.97452 26.3962 3.45496 31.9171 3.45496 38.7051V88.529C3.45496 95.3169 8.97452 100.838 15.7609 100.838H105.838C112.625 100.838 118.144 95.3169 118.144 88.529V38.7051C118.144 31.9171 112.579 26.3962 105.793 26.3962ZM49.8283 31.8266C51.1856 36.6234 55.5741 40.1079 60.7769 40.1079C65.9798 40.1079 70.3683 36.5782 71.7256 31.8266H80.8645C79.281 41.194 70.685 49.7016 61.6365 58.6618C61.3651 58.9333 61.0484 59.2048 60.7769 59.5216C60.5055 59.2501 60.1888 58.9785 59.9173 58.6618C50.8689 49.7016 42.2728 41.194 40.6894 31.8266H49.8283ZM54.8502 28.7493C54.8502 25.4911 57.5195 22.8212 60.7769 22.8212C64.0344 22.8212 66.7037 25.4911 66.7037 28.7493C66.7037 32.0076 64.0344 34.6775 60.7769 34.6775C57.5195 34.6775 54.8502 32.0076 54.8502 28.7493ZM56.117 62.5083C57.0218 63.4134 57.9719 64.3184 58.8768 65.2687C59.3744 65.7665 60.0983 66.0833 60.7769 66.0833C61.4556 66.0833 62.1795 65.8118 62.6771 65.2687C63.582 64.3637 64.532 63.4134 65.4369 62.5083C75.3902 52.6431 84.8458 43.2304 86.3388 31.8266H95.2968V95.4527H26.2571V31.8266H35.215C36.6628 43.2756 46.1184 52.6431 56.117 62.5083ZM60.7769 8.4306C71.1827 8.4306 79.8239 16.3047 80.955 26.4414H71.8613C70.7755 21.2825 66.206 17.436 60.7317 17.436C55.2574 17.436 50.6879 21.2825 49.6021 26.4414H40.5084C41.7299 16.3047 50.3712 8.4306 60.7769 8.4306ZM8.8388 88.5742V38.7051C8.8388 34.9038 11.9153 31.8266 15.7156 31.8266H20.828V95.4527H15.7156C11.9605 95.4527 8.8388 92.3755 8.8388 88.5742ZM112.715 88.5742C112.715 92.3755 109.639 95.4527 105.838 95.4527H100.726V31.8266H105.838C109.639 31.8266 112.715 34.9038 112.715 38.7051V88.5742Z" fill="#102A56"/>
  </svg>
);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function parseISO(iso: string): Date {
  return new Date(iso + "T00:00:00");
}
function monthKey(iso: string): string {
  const d = parseISO(iso);
  return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtDate(iso: string): string {
  const d = parseISO(iso);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

type ViewMode = "timeline" | "calendar";

export default function HistoryView({ initial }: { initial: Initiative[] }) {
  const [items, setItems] = useState<Initiative[]>(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftDate, setDraftDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("timeline");
  const [calCursor, setCalCursor] = useState<{ y: number; m: number } | null>(null);
  const [selected, setSelected] = useState<Initiative | null>(null);
  const [colourMap, setColourMap] = useState<Record<string, AssigneeColor>>({});

  // Per-person colours from the People table.
  useEffect(() => {
    fetch("/api/people")
      .then((r) => r.json())
      .then((data) => { if (data.ok && data.colours) setColourMap(data.colours); })
      .catch(() => {});
  }, []);

  function flash(msg: string, err = false) {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3000);
  }

  // All completed items, newest first, filtered by the search query.
  const completed = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => i.completedDate)
      .filter((i) => {
        if (!q) return true;
        const owner = primaryAssigneeOf(i.primaryAssignees);
        return (
          i.name.toLowerCase().includes(q) ||
          (i.area || "").toLowerCase().includes(q) ||
          (i.pod || "").toLowerCase().includes(q) ||
          owner.toLowerCase().includes(q) ||
          (i.primaryAssignees || "").toLowerCase().includes(q) ||
          (i.supportAssignees || "").toLowerCase().includes(q) ||
          (i.description || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.completedDate.localeCompare(a.completedDate));
  }, [items, query]);

  // Timeline groups (by month)
  const grouped = useMemo(() => {
    const groups: { month: string; items: Initiative[] }[] = [];
    for (const it of completed) {
      const m = monthKey(it.completedDate);
      const last = groups[groups.length - 1];
      if (last && last.month === m) last.items.push(it);
      else groups.push({ month: m, items: [it] });
    }
    return groups;
  }, [completed]);

  const totalAll = items.filter((i) => i.completedDate).length;

  // Default the calendar to the most recent completed month.
  const cursor = useMemo(() => {
    if (calCursor) return calCursor;
    const newest = completed[0]?.completedDate ?? items.find((i) => i.completedDate)?.completedDate;
    if (newest) { const d = parseISO(newest); return { y: d.getFullYear(), m: d.getMonth() }; }
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  }, [calCursor, completed, items]);

  async function saveDate(id: string) {
    if (!draftDate) { setEditingId(null); return; }
    setBusy(true);
    const prev = items;
    setItems((list) => list.map((i) => (i.id === id ? { ...i, completedDate: draftDate } : i)));
    setEditingId(null);
    try {
      const res = await fetch(`/api/initiatives/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completedDate: draftDate }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Update failed");
      flash("Date updated ✓");
    } catch (e: any) {
      setItems(prev);
      flash(e?.message || "Failed to update date", true);
    } finally {
      setBusy(false);
    }
  }

  async function restore(id: string) {
    setBusy(true);
    const prev = items;
    setItems((list) => list.filter((i) => i.id !== id));
    try {
      const res = await fetch(`/api/initiatives/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completedDate: "" }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Update failed");
      flash("Moved back to priorities ✓");
    } catch (e: any) {
      setItems(prev);
      flash(e?.message || "Failed to restore", true);
    } finally {
      setBusy(false);
    }
  }

  function shiftMonth(delta: number) {
    const m = cursor.m + delta;
    const y = cursor.y + Math.floor(m / 12);
    const mm = ((m % 12) + 12) % 12;
    setCalCursor({ y, m: mm });
  }

  return (
    <div className="page">
      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-row topbar-row-main">
          <div className="brand-lockup">
            {STASHER_ICON}
            <div className="brand-text">
              <div className="brand-titles">
                <span className="brand-wordmark">Stasher</span>
                <span className="brand-divider" />
                <span className="brand-product">History</span>
              </div>
              <div className="sub">
                {totalAll} completed {totalAll === 1 ? "initiative" : "initiatives"}
              </div>
            </div>
          </div>
          <nav className="topbar-actions">
            <Link href="/" className="btn btn-soft">← Back to priorities</Link>
          </nav>
        </div>

        {/* Tools row: search + view tabs */}
        <div className="topbar-row topbar-row-tools">
          <div className="history-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="#94a3b8" strokeWidth="2" />
              <path d="M21 21l-4.3-4.3" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              placeholder="Search completed initiatives, people, areas…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button className="history-search-clear" onClick={() => setQuery("")} aria-label="Clear search">✕</button>
            )}
          </div>

          <div className="view-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={view === "timeline"}
              className={`view-tab ${view === "timeline" ? "active" : ""}`}
              onClick={() => setView("timeline")}
            >
              ☰ Timeline
            </button>
            <button
              role="tab"
              aria-selected={view === "calendar"}
              className={`view-tab ${view === "calendar" ? "active" : ""}`}
              onClick={() => setView("calendar")}
            >
              ▦ Calendar
            </button>
          </div>
        </div>
      </header>

      {/* Empty state */}
      {completed.length === 0 ? (
        <div className="board-wrap" style={{ padding: "56px 24px", textAlign: "center", color: "#94a3b8" }}>
          {query
            ? <>No completed initiatives match “{query}”.</>
            : <>Nothing completed yet. Mark an initiative complete to see it here.</>}
        </div>
      ) : view === "timeline" ? (
        <TimelineView
          grouped={grouped}
          editingId={editingId}
          draftDate={draftDate}
          busy={busy}
          setEditingId={setEditingId}
          setDraftDate={setDraftDate}
          saveDate={saveDate}
          restore={restore}
          onOpen={setSelected}
          colourMap={colourMap}
        />
      ) : (
        <CalendarView
          completed={completed}
          cursor={cursor}
          shiftMonth={shiftMonth}
          onOpen={setSelected}
          colourMap={colourMap}
        />
      )}

      {selected && (
        <InitiativeModal
          initiative={selected}
          readOnly
          onClose={() => setSelected(null)}
          onSaved={() => setSelected(null)}
          flash={flash}
        />
      )}

      {toast && <div className={`toast ${toast.err ? "err" : ""}`}>{toast.msg}</div>}
    </div>
  );
}

/* ─── Timeline view ──────────────────────────────────────────────────────────── */
function TimelineView({
  grouped, editingId, draftDate, busy, setEditingId, setDraftDate, saveDate, restore, onOpen, colourMap,
}: {
  grouped: { month: string; items: Initiative[] }[];
  editingId: string | null;
  draftDate: string;
  busy: boolean;
  setEditingId: (id: string | null) => void;
  setDraftDate: (d: string) => void;
  saveDate: (id: string) => void;
  restore: (id: string) => void;
  onOpen: (it: Initiative) => void;
  colourMap: Record<string, AssigneeColor>;
}) {
  return (
    <div className="board-wrap" style={{ padding: "8px 0 16px" }}>
      {grouped.map((group) => (
        <div key={group.month} className="history-group">
          <div className="history-month">
            {group.month}
            <span className="history-month-count">{group.items.length}</span>
          </div>
          <div className="history-timeline">
            {group.items.map((it) => {
              const owner = primaryAssigneeOf(it.primaryAssignees);
              const ac = colorForAssignee(owner, colourMap);
              const pill = STATUS_PILL[it.status] ?? STATUS_PILL["Done"];
              const isEditing = editingId === it.id;
              return (
                <div key={it.id} className="history-item">
                  <div className="history-dot" style={{ background: ac.accent }} />
                  <div
                    className="history-card history-card-clickable"
                    style={{ borderLeftColor: ac.accent }}
                    onClick={() => onOpen(it)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(it); } }}
                  >
                    <div className="history-card-top">
                      <span className="history-name">{it.name}</span>
                      {it.priority === "High" && (
                        <span className="priority-chip high"><span className="priority-bang" aria-hidden>!</span>High</span>
                      )}
                      <span className="status-pill" style={{ background: pill.bg, color: pill.fg, borderColor: pill.border }}>
                        {it.status}
                      </span>
                      {it.tShirtSize && <span className="size-badge">{it.tShirtSize}</span>}
                    </div>

                    <div className="history-meta">
                      <span>{it.area}{it.pod ? ` › ${it.pod}` : ""}</span>
                      {owner && (
                        <>
                          <span style={{ color: "#cbd5e1" }}>·</span>
                          <span style={{ color: ac.fg, fontWeight: 600 }}>{owner}</span>
                        </>
                      )}
                    </div>

                    <div className="history-completed" onClick={(e) => e.stopPropagation()}>
                      {isEditing ? (
                        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          <input
                            type="date"
                            className="form-input"
                            style={{ width: "auto", padding: "5px 9px", fontSize: 13 }}
                            value={draftDate}
                            onChange={(e) => setDraftDate(e.target.value)}
                            autoFocus
                          />
                          <button className="btn primary" style={{ padding: "5px 11px", fontSize: 12.5 }}
                            disabled={busy} onClick={() => saveDate(it.id)}>Save</button>
                          <button className="btn" style={{ padding: "5px 11px", fontSize: 12.5 }}
                            onClick={() => setEditingId(null)}>Cancel</button>
                        </span>
                      ) : (
                        <>
                          <span className="history-completed-label">✓ Completed {fmtDate(it.completedDate)}</span>
                          <button className="btn-link" onClick={() => { setEditingId(it.id); setDraftDate(it.completedDate); }}>
                            Edit date
                          </button>
                          <button className="btn-link" style={{ color: "#64748b" }} onClick={() => restore(it.id)}>
                            Restore
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Calendar view ──────────────────────────────────────────────────────────── */
function CalendarView({
  completed, cursor, shiftMonth, onOpen, colourMap,
}: {
  completed: Initiative[];
  cursor: { y: number; m: number };
  shiftMonth: (d: number) => void;
  onOpen: (it: Initiative) => void;
  colourMap: Record<string, AssigneeColor>;
}) {
  // Map day-of-month -> items completed that day (for the visible month)
  const byDay = useMemo(() => {
    const map: Record<number, Initiative[]> = {};
    for (const it of completed) {
      const d = parseISO(it.completedDate);
      if (d.getFullYear() === cursor.y && d.getMonth() === cursor.m) {
        (map[d.getDate()] ??= []).push(it);
      }
    }
    return map;
  }, [completed, cursor]);

  const monthCount = Object.values(byDay).reduce((n, arr) => n + arr.length, 0);

  // Build the calendar grid (Mon-first)
  const firstDay = new Date(cursor.y, cursor.m, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const isToday = (d: number) =>
    today.getFullYear() === cursor.y && today.getMonth() === cursor.m && today.getDate() === d;

  return (
    <div className="board-wrap" style={{ padding: 18 }}>
      <div className="cal-header">
        <button className="btn btn-soft" onClick={() => shiftMonth(-1)} aria-label="Previous month">←</button>
        <div className="cal-title">
          {MONTHS_LONG[cursor.m]} {cursor.y}
          <span className="cal-count">{monthCount} completed</span>
        </div>
        <button className="btn btn-soft" onClick={() => shiftMonth(1)} aria-label="Next month">→</button>
      </div>

      <div className="cal-grid cal-dow">
        {DOW.map((d) => <div key={d} className="cal-dow-cell">{d}</div>)}
      </div>

      <div className="cal-grid">
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} className="cal-cell cal-empty" />;
          const dayItems = byDay[d] ?? [];
          return (
            <div key={d} className={`cal-cell ${isToday(d) ? "cal-today" : ""} ${dayItems.length ? "cal-has" : ""}`}>
              <div className="cal-daynum">{d}</div>
              <div className="cal-items">
                {dayItems.slice(0, 4).map((it) => {
                  const ac = colorForAssignee(primaryAssigneeOf(it.primaryAssignees), colourMap);
                  return (
                    <button
                      key={it.id}
                      type="button"
                      className="cal-chip"
                      style={{ background: ac.bg, color: ac.fg, borderColor: ac.border }}
                      title={`${it.name}${it.priority === "High" ? " (High priority)" : ""}`}
                      onClick={() => onOpen(it)}
                    >
                      {it.priority === "High" && <span className="cal-chip-bang" aria-hidden>!</span>}
                      <span className="cal-chip-name">{it.name}</span>
                    </button>
                  );
                })}
                {dayItems.length > 4 && (
                  <div className="cal-more">+{dayItems.length - 4} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
