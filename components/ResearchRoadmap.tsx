"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  ResearchTask,
  ResearchStatus,
  RESEARCH_STATUS_OPTIONS,
} from "@/lib/research-tasks";

// ── Constants ────────────────────────────────────────────────────────────────
// The timeline mirrors the Product Roadmap exactly so both tabs read against the
// same quarters, months and week units.

const QUARTERS = ["Q3 2026", "Q4 2026", "Q1 2027", "Q2 2027", "Q3 2027", "Q4 2027"] as const;
type Quarter = (typeof QUARTERS)[number];

const QUARTER_IDX: Record<Quarter, number> = {
  "Q3 2026": 0, "Q4 2026": 1, "Q1 2027": 2, "Q2 2027": 3, "Q3 2027": 4, "Q4 2027": 5,
};

const QUARTER_MONTHS: Record<string, number[]> = {
  Q1: [0, 1, 2], Q2: [3, 4, 5], Q3: [6, 7, 8], Q4: [9, 10, 11],
};
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Within the active quarter the 3 months map to Now / Next / Later.
const QUARTER_MONTH_HORIZON = ["Now", "Next", "Later"] as const;

// 1 month = 4 units (≈ weeks); 1 quarter = 12 units. Drags snap to whole units.
const UNITS_PER_MONTH = 4;
const UNITS_PER_QUARTER = UNITS_PER_MONTH * 3; // 12

function quarterToStartUnit(qIdx: number): number {
  return qIdx * UNITS_PER_QUARTER;
}

// Convert a timeline unit into a readable label like "Jul 2026 wk 1".
function unitToDateLabel(unit: number): string {
  const monthsFromAnchor = Math.floor(unit / UNITS_PER_MONTH);
  const weekOfMonth = (unit % UNITS_PER_MONTH) + 1;
  const qi = Math.floor(monthsFromAnchor / 3);
  const monthInQuarter = monthsFromAnchor % 3;
  const quarter = QUARTERS[Math.min(QUARTERS.length - 1, Math.max(0, qi))];
  const qNum = quarter.slice(0, 2);
  const year = parseInt(quarter.slice(3));
  const calMonth = QUARTER_MONTHS[qNum][monthInQuarter];
  return `${MONTH_ABBR[calMonth]} ${year} wk ${weekOfMonth}`;
}

// A readable span label for a [start, end) unit range. end is exclusive.
function unitRangeLabel(start: number, end: number): string {
  const startLabel = unitToDateLabel(start);
  const endLabel = unitToDateLabel(Math.max(start, end - 1));
  return startLabel === endLabel ? startLabel : `${startLabel} → ${endLabel}`;
}

// Resolve a task's [startUnit, endUnit) span, falling back to quarter fields.
function spanUnitsOf(t: { startUnit: number | null; endUnit: number | null; quarter: string; endQuarter: string }): { start: number; end: number } | null {
  if (t.startUnit != null && t.endUnit != null && t.endUnit > t.startUnit) {
    return { start: t.startUnit, end: t.endUnit };
  }
  const sq = t.quarter ? QUARTER_IDX[t.quarter as Quarter] : undefined;
  if (sq === undefined) return null;
  const eq = t.endQuarter ? QUARTER_IDX[t.endQuarter as Quarter] : sq;
  return { start: quarterToStartUnit(sq), end: quarterToStartUnit(eq) + UNITS_PER_QUARTER };
}

// Derive the quarter fields that correspond to a unit span, so the stored record
// stays readable in Airtable even though the Gantt works in units.
function quartersForSpan(startUnit: number, endUnit: number): { quarter: string; endQuarter: string } {
  const startQ = Math.floor(startUnit / UNITS_PER_QUARTER);
  const endQ = Math.floor((endUnit - 1) / UNITS_PER_QUARTER);
  const clamp = (n: number) => Math.max(0, Math.min(QUARTERS.length - 1, n));
  return {
    quarter: QUARTERS[clamp(startQ)],
    endQuarter: endQ > startQ ? QUARTERS[clamp(endQ)] : "",
  };
}

interface MonthCol {
  monthIdx: number;
  year: number;
  label: string;
  fullLabel: string;
  quarter: Quarter;
  quarterIdx: number;
  isQuarterStart: boolean;
  startUnit: number;
}

function currentQuarterIdx(): number {
  const now = new Date();
  const y = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3) + 1;
  const label = `Q${q} ${y}` as Quarter;
  if (label in QUARTER_IDX) return QUARTER_IDX[label];
  const firstQ = QUARTERS[0];
  const [fQ, fY] = [parseInt(firstQ[1]), parseInt(firstQ.slice(3))];
  if (y < fY || (y === fY && q < fQ)) return 0;
  return QUARTERS.length - 1;
}

const TOTAL_MONTHS = QUARTERS.length * 3;

const VIEW_OPTIONS = [
  { id: "1M",  label: "1M",  months: 1 },
  { id: "3M",  label: "3M",  months: 3 },
  { id: "6M",  label: "6M",  months: 6 },
  { id: "12M", label: "12M", months: 12 },
] as const;
type ViewId = (typeof VIEW_OPTIONS)[number]["id"];

const FALLBACK_COL_WIDTH: Record<ViewId, number> = {
  "1M": 520, "3M": 190, "6M": 110, "12M": 64,
};

function monthsPerView(view: ViewId): number {
  return VIEW_OPTIONS.find((v) => v.id === view)?.months ?? 6;
}

function buildAllMonths(): MonthCol[] {
  const cols: MonthCol[] = [];
  for (let abs = 0; abs < TOTAL_MONTHS; abs++) {
    const qi = Math.floor(abs / 3);
    const monthInQuarter = abs % 3;
    const quarter = QUARTERS[qi];
    const qNum = quarter.slice(0, 2);
    const year = parseInt(quarter.slice(3));
    const calMonth = QUARTER_MONTHS[qNum][monthInQuarter];
    cols.push({
      monthIdx: calMonth,
      year,
      label: MONTH_ABBR[calMonth],
      fullLabel: `${MONTH_ABBR[calMonth]} ${year}`,
      quarter,
      quarterIdx: qi,
      isQuarterStart: monthInQuarter === 0,
      startUnit: quarterToStartUnit(qi) + monthInQuarter * UNITS_PER_MONTH,
    });
  }
  return cols;
}

const STATUS_STYLES: Record<ResearchStatus, { bg: string; fg: string; border: string; dot: string; bar: string }> = {
  "Planned":     { bg: "#f1f5f9", fg: "#475569", border: "#e2e8f0", dot: "#94a3b8", bar: "#64748b" },
  "In Progress": { bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe", dot: "#3b82f6", bar: "#3b82f6" },
  "Done":        { bg: "#f0fdf4", fg: "#15803d", border: "#bbf7d0", dot: "#22c55e", bar: "#22c55e" },
  "On Hold":     { bg: "#fef9c3", fg: "#854d0e", border: "#fde68a", dot: "#f59e0b", bar: "#f59e0b" },
};

// Research bars are coloured by status (there are no strategy goals here).
function barColor(task: ResearchTask): string {
  return (STATUS_STYLES[task.status] ?? STATUS_STYLES["Planned"]).bar;
}

// ── Task modal ────────────────────────────────────────────────────────────────

interface ModalProps {
  task: ResearchTask;
  onClose: () => void;
  onSaved: (t: ResearchTask) => void;
  onDeleted: (id: string) => void;
  readOnly?: boolean;
}

function ResearchModal({ task, onClose, onSaved, onDeleted, readOnly }: ModalProps) {
  const isNew = task.id === "__new__";
  const [mode, setMode] = useState<"view" | "edit">(isNew ? "edit" : "view");
  const [form, setForm] = useState<ResearchTask>({ ...task });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof ResearchTask, value: unknown) {
    setForm((f) => ({ ...f, [key]: value } as ResearchTask));
  }

  // Keep the quarter fields in step with whichever quarters the user picks, and
  // clear the unit span when the quarters change so the bar follows the quarters.
  function setQuarter(key: "quarter" | "endQuarter", value: string) {
    setForm((f) => ({ ...f, [key]: value, startUnit: null, endUnit: null }));
  }

  async function save() {
    if (!form.name.trim()) {
      setError("Give the research task a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload: Partial<ResearchTask> = {
        name: form.name.trim(),
        assignee: form.assignee.trim(),
        status: form.status,
        quarter: form.quarter,
        endQuarter: form.endQuarter,
        startUnit: form.startUnit,
        endUnit: form.endUnit,
        notes: form.notes,
        order: form.order,
      };
      const res = await fetch(
        isNew ? "/api/research-tasks" : `/api/research-tasks/${task.id}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Save failed");
      onSaved(data.task);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${task.name}"? This can't be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/research-tasks/${task.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Delete failed");
      onDeleted(task.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setBusy(false);
    }
  }

  const span = spanUnitsOf(form);
  const ss = STATUS_STYLES[form.status] ?? STATUS_STYLES["Planned"];

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal rs-modal" onClick={(e) => e.stopPropagation()}>
        {/* Accent bar, coloured by status */}
        <div style={{ height: 4, background: ss.bar, borderRadius: "18px 18px 0 0" }} />

        <div className="modal-header">
          <div className="modal-header-left">
            <h2>{isNew ? "New research task" : mode === "edit" ? "Edit research task" : form.name}</h2>
            {!isNew && mode === "edit" && <p className="modal-subtitle">{task.name}</p>}
          </div>
          <button className="modal-close-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {mode === "edit" ? (
          <>
            <div className="modal-body rmi-body">
              {error && <div className="field-error rmi-error">{error}</div>}

              <div className="rmi-section">
                <div className="rmi-section-title">Task details</div>
                <div className="field">
                  <label className="field-label">Research task <span className="required">*</span></label>
                  <input className="input" value={form.name || ""}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="e.g. Competitor pricing analysis" autoFocus />
                </div>
                <div className="rmi-grid-2" style={{ marginTop: 12 }}>
                  <div className="field">
                    <label className="field-label">Assignee</label>
                    <input className="input" value={form.assignee || ""}
                      onChange={(e) => set("assignee", e.target.value)}
                      placeholder="Who's doing this research?" />
                  </div>
                  <div className="field">
                    <label className="field-label">Status</label>
                    <select className="select" value={form.status || "Planned"}
                      onChange={(e) => set("status", e.target.value as ResearchStatus)}>
                      {RESEARCH_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="rmi-section">
                <div className="rmi-section-title">Timeframe</div>
                <div className="rmi-grid-2">
                  <div className="field">
                    <label className="field-label">Start quarter</label>
                    <select className="select" value={form.quarter || ""}
                      onChange={(e) => setQuarter("quarter", e.target.value)}>
                      <option value="">— Not set —</option>
                      {QUARTERS.map((q) => <option key={q} value={q}>{q}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label className="field-label">End quarter</label>
                    <select className="select" value={form.endQuarter || ""}
                      onChange={(e) => setQuarter("endQuarter", e.target.value)}
                      disabled={!form.quarter}>
                      <option value="">— Same —</option>
                      {QUARTERS.map((q) => <option key={q} value={q}>{q}</option>)}
                    </select>
                  </div>
                </div>
                {span && (
                  <p className="rs-span-hint">
                    {unitRangeLabel(span.start, span.end)} · drag the bar on the timeline
                    for week-level precision.
                  </p>
                )}
              </div>

              <div className="rmi-section">
                <div className="rmi-section-title">Notes</div>
                <div className="field">
                  <textarea className="textarea" rows={4} value={form.notes || ""}
                    onChange={(e) => set("notes", e.target.value)}
                    placeholder="Context, questions to answer, findings…" />
                </div>
              </div>
            </div>

            <div className="modal-actions">
              {!isNew && !readOnly && (
                <button className="btn danger" onClick={remove} disabled={busy}>Delete</button>
              )}
              <div style={{ flex: 1 }} />
              <button className="btn btn-soft" onClick={isNew ? onClose : () => setMode("view")}>
                {isNew ? "Cancel" : "Back"}
              </button>
              {!readOnly && (
                <button className="btn primary" onClick={save} disabled={busy}>
                  {busy ? "Saving…" : isNew ? "Create" : "Save"}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Badge strip */}
            <div className="modal-badges">
              <span className="meta-badge status" style={{ background: ss.bg, color: ss.fg, borderColor: ss.border }}>
                <span className="rmi-dot" style={{ background: ss.dot }} />
                {form.status}
              </span>
              {span && <span className="meta-badge tf">{unitRangeLabel(span.start, span.end)}</span>}
              {form.assignee && <span className="meta-badge">{form.assignee}</span>}
            </div>

            <div className="modal-body rmi-body">
              {error && <div className="field-error rmi-error">{error}</div>}
              <div className="rmi-section">
                <div className="rmi-section-title">Notes</div>
                {form.notes
                  ? <p className="modal-notes">{form.notes}</p>
                  : <p className="rs-view-empty">No notes yet.</p>}
              </div>
            </div>

            <div className="modal-actions">
              <div style={{ flex: 1 }} />
              <button className="btn btn-soft" onClick={onClose}>Close</button>
              {!readOnly && (
                <button className="btn primary" onClick={() => setMode("edit")}>Edit</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Gantt row ─────────────────────────────────────────────────────────────────

function ResearchRow({
  task,
  months,
  windowStartUnit,
  windowEndUnit,
  onOpen,
  onTrackPointerDown,
  onBarMoveStart,
  onResizeStart,
  readOnly,
  resizePreview,
  movePreview,
  drawGhost,
}: {
  task: ResearchTask;
  months: MonthCol[];
  windowStartUnit: number;
  windowEndUnit: number;
  onOpen: () => void;
  onTrackPointerDown: (e: React.PointerEvent, id: string) => void;
  onBarMoveStart: (e: React.PointerEvent, id: string) => void;
  onResizeStart: (e: React.PointerEvent, id: string, side: "left" | "right") => void;
  readOnly: boolean;
  resizePreview?: { start: number; end: number } | null;
  movePreview?: { start: number; end: number } | null;
  drawGhost?: { start: number; end: number } | null;
}) {
  const ss = STATUS_STYLES[task.status] ?? STATUS_STYLES["Planned"];
  const bc = barColor(task);
  const windowUnits = windowEndUnit - windowStartUnit;

  function clipSpan(s: { start: number; end: number }) {
    if (s.end <= windowStartUnit || s.start >= windowEndUnit) return null;
    const visStart = Math.max(s.start, windowStartUnit);
    const visEnd = Math.min(s.end, windowEndUnit);
    return {
      leftPct: ((visStart - windowStartUnit) / windowUnits) * 100,
      widthPct: ((visEnd - visStart) / windowUnits) * 100,
      clipLeft: s.start < windowStartUnit,
      clipRight: s.end > windowEndUnit,
    };
  }

  // Live span: a resize/move preview overrides the stored value.
  const span = resizePreview ?? movePreview ?? spanUnitsOf(task);
  const bar = span ? clipSpan(span) : null;
  const ghost = drawGhost ? clipSpan(drawGhost) : null;

  return (
    <div className="gantt-row">
      {/* Label cell */}
      <div className="gantt-label-cell">
        <span className="gantt-dot" style={{ background: ss.dot }} title={task.status} />
        <div className="gantt-label-text">
          <span
            className="gantt-row-name"
            onClick={(e) => { e.stopPropagation(); onOpen(); }}
            role="button"
            title="View details"
          >
            {task.name}
          </span>
          {task.assignee && (
            <div className="gantt-label-pills">
              <span className="gantt-owner-chip">{task.assignee}</span>
            </div>
          )}
        </div>
      </div>

      {/* Month track */}
      <div
        className={`gantt-track-grid gantt-track-overlay${!readOnly ? " gantt-track-drawable" : ""}`}
        style={{ gridTemplateColumns: `repeat(${months.length}, var(--gantt-col-w))` }}
        onPointerDown={readOnly ? undefined : (e) => onTrackPointerDown(e, task.id)}
      >
        {months.map((col) => (
          <div
            key={`${col.year}-${col.monthIdx}`}
            className={`gantt-cell${col.isQuarterStart ? " gantt-quarter-start" : ""}`}
          />
        ))}

        {bar && (
          <div
            className="gantt-bar"
            style={{
              left: `${bar.leftPct}%`,
              width: `${bar.widthPct}%`,
              background: bc + "22",
              borderTop: `2px solid ${bc}66`,
              borderBottom: `2px solid ${bc}66`,
              borderLeft: bar.clipLeft ? "none" : `3px solid ${bc}`,
              borderRight: bar.clipRight ? "none" : `3px solid ${bc}`,
              borderTopLeftRadius: bar.clipLeft ? 0 : 6,
              borderBottomLeftRadius: bar.clipLeft ? 0 : 6,
              borderTopRightRadius: bar.clipRight ? 0 : 6,
              borderBottomRightRadius: bar.clipRight ? 0 : 6,
            }}
            onClick={(e) => { e.stopPropagation(); onOpen(); }}
          >
            {!readOnly && !bar.clipLeft && (
              <div
                className="gantt-resize-handle gantt-resize-left"
                onPointerDown={(e) => { e.stopPropagation(); onResizeStart(e, task.id, "left"); }}
              />
            )}
            {!readOnly && (
              <div
                className="gantt-bar-move-handle"
                onPointerDown={(e) => { e.stopPropagation(); onBarMoveStart(e, task.id); }}
                title="Drag to move"
              />
            )}
            <span className="gantt-bar-label" style={{ color: bc }}>
              <span className="gantt-bar-status-dot" style={{ background: ss.dot }} title={task.status} />
              {task.name}
            </span>
            {!readOnly && !bar.clipRight && (
              <div
                className="gantt-resize-handle gantt-resize-right"
                onPointerDown={(e) => { e.stopPropagation(); onResizeStart(e, task.id, "right"); }}
              />
            )}
          </div>
        )}

        {ghost && (
          <div
            className="gantt-bar gantt-draw-ghost"
            style={{ left: `${ghost.leftPct}%`, width: `${ghost.widthPct}%`, pointerEvents: "none" }}
          />
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface Props {
  initial: ResearchTask[];
  readOnly?: boolean;
  mobile?: boolean;
}

export default function ResearchRoadmap({ initial, readOnly = false, mobile = false }: Props) {
  const [items, setItems] = useState<ResearchTask[]>(initial);
  const [filterStatus, setFilterStatus] = useState<ResearchStatus | "All">("All");
  const [filterAssignee, setFilterAssignee] = useState<string>("All");
  const [modal, setModal] = useState<ResearchTask | null | "new">(null);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [view, setView] = useState<ViewId>("3M");

  // ── Draw state — click-drag on an empty track to place a task's bar ──────────
  const [drawingId, setDrawingId] = useState<string | null>(null);
  const [drawGhosts, setDrawGhosts] = useState<Record<string, { start: number; end: number }>>({});
  const drawRef = useRef<{ id: string; anchorUnit: number; moved: boolean } | null>(null);

  // ── Resize state ─────────────────────────────────────────────────────────────
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [resizePreview, setResizePreview] = useState<{ start: number; end: number } | null>(null);
  const resizeRef = useRef<{ id: string; side: "left" | "right"; fixedUnit: number } | null>(null);

  // ── Move state ────────────────────────────────────────────────────────────────
  const [movingId, setMovingId] = useState<string | null>(null);
  const [movePreview, setMovePreview] = useState<{ start: number; end: number } | null>(null);
  const moveRef = useRef<{ id: string; originalStart: number; originalEnd: number; grabUnit: number } | null>(null);

  // Suppress the click that trails a drag so it doesn't open the modal.
  const suppressBarClickRef = useRef(false);

  const ganttTableRef = useRef<HTMLDivElement | null>(null);
  const currentQIdx = currentQuarterIdx();
  const months = useMemo(() => buildAllMonths(), []);

  // Measure the visible timeline width so each zoom shows exactly N months.
  const [trackViewport, setTrackViewport] = useState(0);
  useEffect(() => {
    const el = ganttTableRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const labelCell = el.querySelector<HTMLElement>(".gantt-label-cell");
      const labelW = labelCell ? labelCell.getBoundingClientRect().width : 0;
      setTrackViewport(Math.max(0, el.clientWidth - labelW));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  const colWidth = trackViewport > 0
    ? trackViewport / monthsPerView(view)
    : FALLBACK_COL_WIDTH[view];

  const windowStartUnit = 0;
  const windowEndUnit = TOTAL_MONTHS * UNITS_PER_MONTH;

  // Scroll the current quarter to the left edge on mount / zoom change.
  useEffect(() => {
    const el = ganttTableRef.current;
    if (!el) return;
    el.scrollLeft = currentQIdx * 3 * colWidth;
  }, [colWidth, currentQIdx]);

  function flash(msg: string, err = false) {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3000);
  }

  // Map a pointer X to a whole unit, clamped to the timeline.
  const unitAtX = useCallback((clientX: number, trackLeft: number, trackWidth: number): number => {
    const frac = (clientX - trackLeft) / trackWidth;
    const raw = windowStartUnit + frac * (windowEndUnit - windowStartUnit);
    return Math.max(windowStartUnit, Math.min(windowEndUnit, Math.round(raw)));
  }, [windowStartUnit, windowEndUnit]);

  // ── Persist a span ───────────────────────────────────────────────────────────
  const onSpanChange = useCallback(async (id: string, startUnit: number, endUnit: number) => {
    const patch = { startUnit, endUnit, ...quartersForSpan(startUnit, endUnit) };
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    try {
      const res = await fetch(`/api/research-tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Save failed");
      setItems((prev) => prev.map((x) => (x.id === id ? data.task : x)));
    } catch (e: unknown) {
      flash(e instanceof Error ? e.message : "Update failed", true);
    }
  }, []);

  // ── Resize ───────────────────────────────────────────────────────────────────
  const onResizePointerDown = useCallback((
    e: React.PointerEvent,
    id: string,
    side: "left" | "right",
  ) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    if (!ganttTableRef.current) return;

    const item = items.find((x) => x.id === id);
    if (!item) return;
    const stored = spanUnitsOf(item);
    if (!stored) return;

    const trackEl = ganttTableRef.current.querySelector<HTMLElement>(".gantt-track-overlay");
    if (!trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    const trackLeft = rect.left;
    const trackWidth = rect.width;

    // The edge that stays anchored while the other follows the pointer.
    const fixedUnit = side === "right" ? stored.start : stored.end;
    resizeRef.current = { id, side, fixedUnit };
    setResizingId(id);
    setResizePreview({ start: stored.start, end: stored.end });

    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }

    function resolve(clientX: number) {
      const u = unitAtX(clientX, trackLeft, trackWidth);
      let start = side === "right" ? fixedUnit : u;
      let end = side === "right" ? u : fixedUnit;
      if (end - start < 1) {
        if (side === "right") end = start + 1;
        else start = end - 1;
      }
      return { start, end };
    }

    function onPointerMove(ev: PointerEvent) {
      if (!resizeRef.current) return;
      setResizePreview(resolve(ev.clientX));
    }

    function onPointerUp(ev: PointerEvent) {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      const ref = resizeRef.current;
      resizeRef.current = null;
      setResizingId(null);
      setResizePreview(null);
      if (!ref) return;
      const final = resolve(ev.clientX);
      if (final.start !== stored!.start || final.end !== stored!.end) {
        onSpanChange(ref.id, final.start, final.end);
      }
      // Interacting with a handle should never open the modal.
      suppressBarClickRef.current = true;
      setTimeout(() => { suppressBarClickRef.current = false; }, 0);
    }

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }, [items, readOnly, unitAtX, onSpanChange]);

  // ── Move ─────────────────────────────────────────────────────────────────────
  const onBarMoveStart = useCallback((e: React.PointerEvent, id: string) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    if (!ganttTableRef.current) return;

    const item = items.find((x) => x.id === id);
    if (!item) return;
    const stored = spanUnitsOf(item);
    if (!stored) return;

    const trackEl = ganttTableRef.current.querySelector<HTMLElement>(".gantt-track-overlay");
    if (!trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    const trackLeft = rect.left;
    const trackWidth = rect.width;

    const grabUnit = unitAtX(e.clientX, trackLeft, trackWidth);
    moveRef.current = { id, originalStart: stored.start, originalEnd: stored.end, grabUnit };
    setMovingId(id);
    setMovePreview({ start: stored.start, end: stored.end });

    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }

    let moved = false;
    const dur = stored.end - stored.start;

    function resolveStart(clientX: number) {
      const delta = unitAtX(clientX, trackLeft, trackWidth) - grabUnit;
      return Math.max(windowStartUnit, Math.min(windowEndUnit - dur, stored!.start + delta));
    }

    function onPointerMove(ev: PointerEvent) {
      if (!moveRef.current) return;
      const newStart = resolveStart(ev.clientX);
      if (newStart !== stored!.start) moved = true;
      setMovePreview({ start: newStart, end: newStart + dur });
    }

    function onPointerUp(ev: PointerEvent) {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      const ref = moveRef.current;
      moveRef.current = null;
      setMovingId(null);
      setMovePreview(null);
      if (!ref) return;
      const finalStart = resolveStart(ev.clientX);
      if (finalStart === stored!.start || !moved) return; // a plain click → open the modal
      suppressBarClickRef.current = true;
      setTimeout(() => { suppressBarClickRef.current = false; }, 0);
      onSpanChange(ref.id, finalStart, finalStart + dur);
    }

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }, [items, readOnly, unitAtX, onSpanChange, windowStartUnit, windowEndUnit]);

  // ── Draw — click-drag on an empty track to set a task's timeframe ────────────
  const onTrackPointerDown = useCallback((e: React.PointerEvent, id: string) => {
    if (readOnly) return;
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest(".gantt-bar") || target.closest(".gantt-resize-handle")) return;

    e.preventDefault();
    e.stopPropagation();

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const anchorUnit = unitAtX(e.clientX, rect.left, rect.width);
    drawRef.current = { id, anchorUnit, moved: false };
    setDrawingId(id);
    setDrawGhosts((prev) => ({ ...prev, [id]: { start: anchorUnit, end: anchorUnit + 1 } }));

    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }

    function resolve(clientX: number) {
      const u = unitAtX(clientX, rect.left, rect.width);
      const start = Math.min(anchorUnit, u);
      const end = Math.max(anchorUnit, u);
      return { start, end: Math.max(end, start + 1) };
    }

    function onPointerMove(ev: PointerEvent) {
      if (!drawRef.current || drawRef.current.id !== id) return;
      // Any movement off the anchor unit counts as a drag rather than a tap.
      if (unitAtX(ev.clientX, rect.left, rect.width) !== anchorUnit) drawRef.current.moved = true;
      setDrawGhosts((prev) => ({ ...prev, [id]: resolve(ev.clientX) }));
    }

    function onPointerUp(ev: PointerEvent) {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      const ref = drawRef.current;
      drawRef.current = null;
      setDrawingId(null);
      setDrawGhosts((prev) => { const n = { ...prev }; delete n[id]; return n; });
      if (!ref) return;

      const span = resolve(ev.clientX);
      if (!ref.moved) {
        // Short tap on an empty track — open the task so it can be edited.
        const item = items.find((x) => x.id === id);
        if (item) setModal(item);
        return;
      }
      onSpanChange(id, span.start, span.end);
    }

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }, [readOnly, items, unitAtX, onSpanChange]);

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/research-tasks", { cache: "no-store" });
      const data = await res.json();
      if (data.ok) setItems(data.tasks);
      else throw new Error(data.error);
    } catch (e: unknown) {
      flash(e instanceof Error ? e.message : "Refresh failed", true);
    } finally {
      setRefreshing(false);
    }
  }

  function onSaved(t: ResearchTask) {
    setItems((prev) => {
      const exists = prev.find((x) => x.id === t.id);
      if (exists) return prev.map((x) => (x.id === t.id ? t : x));
      return [...prev, t].sort((a, b) => a.order - b.order);
    });
    setModal(null);
    flash("Saved ✓");
  }

  function onDeleted(id: string) {
    setItems((prev) => prev.filter((x) => x.id !== id));
    setModal(null);
    flash("Deleted");
  }

  // Distinct assignees, for the filter dropdown.
  const assignees = Array.from(new Set(items.map((t) => t.assignee).filter(Boolean))).sort();

  const filtered = items.filter((t) => {
    if (filterStatus !== "All" && t.status !== filterStatus) return false;
    if (filterAssignee !== "All" && t.assignee !== filterAssignee) return false;
    return true;
  });

  const newTask: ResearchTask = {
    id: "__new__", name: "", assignee: "", status: "Planned",
    quarter: "", endQuarter: "", startUnit: null, endUnit: null,
    notes: "", order: 999,
  };
  const modalTask = modal === "new" ? newTask : modal;

  return (
    <div className="gantt-root" style={{ "--gantt-col-w": `${colWidth}px` } as React.CSSProperties}>
      {/* Header */}
      <div className="rm-header">
        <div className="rm-header-left">
          <h1 className="rm-title">Research Roadmap</h1>
          <p className="rm-subtitle">Individual research tasks and when they&rsquo;re happening.</p>
        </div>
        <div className="rm-header-actions">
          <button className="btn icon-btn" onClick={refresh} disabled={refreshing}
            title="Refresh" aria-label="Refresh">
            <span className={refreshing ? "spin" : ""}>↻</span>
          </button>
          {!readOnly && (
            <button className="btn primary" onClick={() => setModal("new")}>+ Add research task</button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="rm-filters">
        <div className="filter-group">
          <span className="filter-label">Status</span>
          <select className="select" value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as ResearchStatus | "All")}>
            <option value="All">All statuses</option>
            {RESEARCH_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <span className="filter-label">Assignee</span>
          <select className="select" value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}>
            <option value="All">All assignees</option>
            {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <span className="rm-count">{filtered.length} task{filtered.length !== 1 ? "s" : ""}</span>

        {!mobile && (
          <div className="rm-view-switch" role="group" aria-label="Timeline zoom">
            {VIEW_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                className={`rm-view-btn${view === opt.id ? " active" : ""}`}
                onClick={() => setView(opt.id)}
                aria-pressed={view === opt.id}
                title={`${opt.label} zoom`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {!readOnly && !mobile && (
          <span className="gantt-hint">Drag across a row to set dates · drag ▐ handle to resize</span>
        )}
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div className="rm-empty">
          {items.length === 0
            ? <>No research tasks yet.{!readOnly && " Click \"+ Add research task\" to get started."}</>
            : "No tasks match these filters."}
        </div>
      ) : mobile ? (
        /* ── Mobile: simple task list ── */
        <div className="rml-list">
          {filtered.map((t) => {
            const ss = STATUS_STYLES[t.status] ?? STATUS_STYLES["Planned"];
            const span = spanUnitsOf(t);
            return (
              <button
                key={t.id}
                className="rml-card"
                style={{ borderLeftColor: barColor(t) }}
                onClick={() => setModal(t)}
              >
                <div className="rml-card-top">
                  <span className="rml-card-name">{t.name}</span>
                  <span className="rml-status" style={{ background: ss.bg, color: ss.fg, borderColor: ss.border }}>
                    <span className="rml-status-dot" style={{ background: ss.dot }} />
                    {t.status}
                  </span>
                </div>
                <div className="rml-card-meta">
                  <span className="rml-chip rml-chip-time">
                    {span ? unitRangeLabel(span.start, span.end) : "No timeframe set"}
                  </span>
                  {t.assignee && <span className="rml-chip rml-chip-owner">{t.assignee}</span>}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div
          className={`gantt-table${readOnly ? " gantt-readonly" : ""}`}
          ref={ganttTableRef}
        >
          {/* Quarter header */}
          <div className="gantt-quarter-row">
            <div className="gantt-label-cell gantt-quarter-corner" />
            <div className="gantt-track-grid" style={{ gridTemplateColumns: `repeat(${months.length}, var(--gantt-col-w))` }}>
              {months.map((col, i) => {
                if (!col.isQuarterStart) return null;
                const span = months.filter((m) => m.quarterIdx === col.quarterIdx).length;
                const isCurrent = col.quarterIdx === currentQIdx;
                return (
                  <div
                    key={col.quarter}
                    className={`gantt-quarter-cell${isCurrent ? " gantt-quarter-current" : ""}`}
                    style={{ gridColumn: `${i + 1} / span ${span}` }}
                  >
                    <span className="gantt-q-label-sticky">
                      <span className="gantt-q-label">{col.quarter}</span>
                      {isCurrent && <span className="gantt-now-pip" />}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Month header */}
          <div className="gantt-header-row">
            <div className="gantt-label-cell gantt-header-label">Research task</div>
            <div className="gantt-track-grid" style={{ gridTemplateColumns: `repeat(${months.length}, var(--gantt-col-w))` }}>
              {months.map((col, mi) => {
                const isActiveQ = col.quarterIdx === currentQIdx;
                const monthInQ = mi - months.findIndex((m) => m.quarterIdx === col.quarterIdx);
                const horizon = isActiveQ ? QUARTER_MONTH_HORIZON[monthInQ] : null;
                return (
                  <div
                    key={`${col.year}-${col.monthIdx}`}
                    className={`gantt-cell gantt-header-cell${col.isQuarterStart ? " gantt-quarter-start" : ""}${isActiveQ ? " gantt-active-q-col" : ""}`}
                  >
                    <span className="gantt-m-label">
                      {view === "1M" ? col.fullLabel : col.label}
                    </span>
                    {horizon && <span className="gantt-horizon-label">{horizon}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rows — a flat list, no swimlanes */}
          {filtered.map((t) => (
            <ResearchRow
              key={t.id}
              task={t}
              months={months}
              windowStartUnit={windowStartUnit}
              windowEndUnit={windowEndUnit}
              onOpen={() => {
                if (suppressBarClickRef.current) return;
                setModal(t);
              }}
              onTrackPointerDown={onTrackPointerDown}
              onBarMoveStart={onBarMoveStart}
              onResizeStart={onResizePointerDown}
              readOnly={readOnly}
              resizePreview={resizingId === t.id ? resizePreview : null}
              movePreview={movingId === t.id ? movePreview : null}
              drawGhost={drawingId === t.id ? drawGhosts[t.id] ?? null : null}
            />
          ))}
        </div>
      )}

      {modalTask && (
        <ResearchModal
          task={modalTask}
          onClose={() => setModal(null)}
          onSaved={onSaved}
          onDeleted={onDeleted}
          readOnly={readOnly}
        />
      )}

      {toast && <div className={`toast ${toast.err ? "err" : ""}`}>{toast.msg}</div>}
    </div>
  );
}
