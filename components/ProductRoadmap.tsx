"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import {
  RoadmapInitiative,
  RoadmapComment,
  RoadmapStatus,
  StrategyGoal,
  ROADMAP_STATUS_OPTIONS,
  STRATEGY_GOAL_LABELS,
} from "@/lib/roadmap-initiatives";

// ── Constants ────────────────────────────────────────────────────────────────

const QUARTERS = ["Q3 2026", "Q4 2026", "Q1 2027", "Q2 2027", "Q3 2027", "Q4 2027"] as const;
type Quarter = (typeof QUARTERS)[number];

const QUARTER_IDX: Record<Quarter, number> = {
  "Q3 2026": 0, "Q4 2026": 1, "Q1 2027": 2, "Q2 2027": 3, "Q3 2027": 4, "Q4 2027": 5,
};

// The three calendar months that make up each quarter (0-based month index in the quarter's year).
const QUARTER_MONTHS: Record<string, number[]> = {
  Q1: [0, 1, 2],   // Jan, Feb, Mar
  Q2: [3, 4, 5],   // Apr, May, Jun
  Q3: [6, 7, 8],   // Jul, Aug, Sep
  Q4: [9, 10, 11], // Oct, Nov, Dec
};
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ── Timeline units ─────────────────────────────────────────────────────────
// The timeline is measured in "half-month units" anchored at QUARTERS[0] month 0.
// 1 month = 2 units; 1 quarter = 6 units. Resizing snaps to whole units (half-months).
const UNITS_PER_MONTH = 2;
const UNITS_PER_QUARTER = UNITS_PER_MONTH * 3; // 6

function quarterToStartUnit(qIdx: number): number {
  return qIdx * UNITS_PER_QUARTER;
}

// Resolve an initiative's [startUnit, endUnit) span, falling back to quarter fields
// when fine-grained units aren't set.
function spanUnitsOf(i: { startUnit: number | null; endUnit: number | null; quarter: string; endQuarter: string }): { start: number; end: number } | null {
  if (i.startUnit != null && i.endUnit != null && i.endUnit > i.startUnit) {
    return { start: i.startUnit, end: i.endUnit };
  }
  const sq = i.quarter ? QUARTER_IDX[i.quarter as Quarter] : undefined;
  if (sq === undefined) return null;
  const eq = i.endQuarter ? QUARTER_IDX[i.endQuarter as Quarter] : sq;
  return { start: quarterToStartUnit(sq), end: quarterToStartUnit(eq) + UNITS_PER_QUARTER };
}

// A single month column in the timeline.
interface MonthCol {
  monthIdx: number;   // 0-11
  year: number;
  label: string;      // "Jul"
  quarter: Quarter;   // owning quarter, e.g. "Q3 2026"
  quarterIdx: number; // index into QUARTERS
  isQuarterStart: boolean; // first month of its quarter within the visible window
  startUnit: number;  // unit at this month's left edge
}

// Returns the index of the current or next quarter within QUARTERS (-1 if before range, clamped to last if after)
function currentQuarterIdx(): number {
  const now = new Date();
  const y = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3) + 1; // 1-4
  const label = `Q${q} ${y}` as Quarter;
  if (label in QUARTER_IDX) return QUARTER_IDX[label];
  // Before the range → show from start; after → show from end
  const firstQ = QUARTERS[0];
  const [fQ, fY] = [parseInt(firstQ[1]), parseInt(firstQ.slice(3))];
  if (y < fY || (y === fY && q < fQ)) return 0;
  return QUARTERS.length - 1;
}

// Build the visible month columns: all 3 months of the current quarter + the first
// 2 months of the next quarter (5 columns total). Falls back gracefully near the
// end of the quarter range.
function buildVisibleMonths(): MonthCol[] {
  const cols: MonthCol[] = [];
  const curIdx = currentQuarterIdx();
  const nextIdx = Math.min(curIdx + 1, QUARTERS.length - 1);

  function monthsForQuarter(qi: number, count: number, fromStart = true): MonthCol[] {
    const quarter = QUARTERS[qi];
    const qNum = quarter.slice(0, 2);          // "Q3"
    const year = parseInt(quarter.slice(3));   // 2026
    const months = QUARTER_MONTHS[qNum];
    const slice = fromStart ? months.slice(0, count) : months.slice(-count);
    const quarterStartUnit = quarterToStartUnit(qi);
    return slice.map((m, i) => ({
      monthIdx: m,
      year,
      label: MONTH_ABBR[m],
      quarter,
      quarterIdx: qi,
      isQuarterStart: i === 0,
      // month i of this quarter (fromStart always true here) → quarterStart + i months
      startUnit: quarterStartUnit + i * UNITS_PER_MONTH,
    }));
  }

  // 3 months of current quarter
  cols.push(...monthsForQuarter(curIdx, 3));
  // 2 months of next quarter (only if there is a distinct next quarter)
  if (nextIdx !== curIdx) {
    cols.push(...monthsForQuarter(nextIdx, 2));
  }
  return cols;
}

const GOAL_META: Record<string, { color: string; bg: string; light: string }> = {
  "1": { color: "#0f766e", bg: "#f0fdfa", light: "#ccfbf1" },
  "2": { color: "#c2410c", bg: "#fff7ed", light: "#fed7aa" },
  "3": { color: "#7c3aed", bg: "#f5f3ff", light: "#ddd6fe" },
};

const SUBGOAL_TO_GOAL: Record<StrategyGoal, string> = {
  "1.1": "1", "1.2": "1", "1.3": "1",
  "2.1": "2", "2.2": "2", "2.3": "2",
  "3.1": "3", "3.2": "3", "3.3": "3",
};

// Preferred display order for swimlane groups (by summary). Anything not listed
// falls to the bottom, keeping its first-seen order.
const SUMMARY_ORDER = [
  "First booking conversion",
  "Increase host engagement",
  "Organic page rank",
  "Scaling supply",
];
function summaryRank(summary: string): number {
  const idx = SUMMARY_ORDER.indexOf(summary);
  return idx === -1 ? SUMMARY_ORDER.length : idx;
}

const STATUS_STYLES: Record<RoadmapStatus, { bg: string; fg: string; border: string; dot: string }> = {
  "Planned":     { bg: "#f1f5f9", fg: "#475569", border: "#e2e8f0",  dot: "#94a3b8" },
  "In Progress": { bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe",  dot: "#3b82f6" },
  "Done":        { bg: "#f0fdf4", fg: "#15803d", border: "#bbf7d0",  dot: "#22c55e" },
  "On Hold":     { bg: "#fef9c3", fg: "#854d0e", border: "#fde68a",  dot: "#f59e0b" },
};

function goalNum(sg: StrategyGoal | "" | undefined): string | undefined {
  return sg ? SUBGOAL_TO_GOAL[sg as StrategyGoal] : undefined;
}
function goalColor(initiative: RoadmapInitiative): string {
  const gn = goalNum(initiative.strategyGoal);
  return gn ? GOAL_META[gn].color : "#94a3b8";
}

// ── Detail / Edit Modal ───────────────────────────────────────────────────────

interface ModalProps {
  initiative: RoadmapInitiative;
  onClose: () => void;
  onSaved: (i: RoadmapInitiative) => void;
  onDeleted: (id: string) => void;
  readOnly?: boolean;
  defaultEdit?: boolean;
}

function RoadmapModal({ initiative, onClose, onSaved, onDeleted, readOnly, defaultEdit }: ModalProps) {
  const isNew = initiative.id === "__new__";
  const [mode, setMode] = useState<"view" | "edit">(isNew || defaultEdit ? "edit" : "view");
  const [form, setForm] = useState<RoadmapInitiative>({ ...initiative });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentAuthor, setCommentAuthor] = useState("");
  const [addingComment, setAddingComment] = useState(false);

  const statusStyle = STATUS_STYLES[form.status] ?? STATUS_STYLES["Planned"];
  const gn = goalNum(form.strategyGoal);
  const gm = gn ? GOAL_META[gn] : null;

  function set(key: keyof RoadmapInitiative, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.name?.trim()) { setError("Name is required."); return; }
    if (!form.summary?.trim()) { setError("Summary / group is required."); return; }
    setBusy(true); setError(null);
    try {
      // If the quarter selection changed in the modal, recompute the fine-grained
      // units to match (full-quarter span) so the Gantt and modal stay consistent.
      const payload: Partial<RoadmapInitiative> = { ...form };
      const qChanged = form.quarter !== initiative.quarter || form.endQuarter !== initiative.endQuarter;
      if (qChanged) {
        if (form.quarter && form.quarter in QUARTER_IDX) {
          const sq = QUARTER_IDX[form.quarter as Quarter];
          const eq = form.endQuarter && form.endQuarter in QUARTER_IDX
            ? QUARTER_IDX[form.endQuarter as Quarter] : sq;
          payload.startUnit = quarterToStartUnit(sq);
          payload.endUnit = quarterToStartUnit(eq) + UNITS_PER_QUARTER;
        } else {
          payload.startUnit = null;
          payload.endUnit = null;
        }
      }
      const url = isNew ? "/api/roadmap-initiatives" : `/api/roadmap-initiatives/${initiative.id}`;
      const res = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Save failed");
      onSaved(data.initiative);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (isNew) return;
    if (!confirm(`Delete "${initiative.name}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/roadmap-initiatives/${initiative.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Delete failed");
      onDeleted(initiative.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setBusy(false);
    }
  }

  async function addComment() {
    if (!commentText.trim() || !commentAuthor.trim()) return;
    const comment: RoadmapComment = {
      id: `${Date.now()}`,
      author: commentAuthor.trim(),
      text: commentText.trim(),
      createdAt: new Date().toISOString(),
    };
    const updated: RoadmapInitiative = {
      ...initiative,
      comments: [...(initiative.comments || []), comment],
    };
    setBusy(true);
    try {
      const res = await fetch(`/api/roadmap-initiatives/${initiative.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comments: updated.comments }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed");
      onSaved(data.initiative);
      setCommentText(""); setCommentAuthor(""); setAddingComment(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Comment failed");
    } finally {
      setBusy(false);
    }
  }

  const comments = initiative.comments || [];

  // ── EDIT / CREATE mode ──
  if (mode === "edit" || isNew) {
    return (
      <div className="overlay" onClick={onClose}>
        <div className="modal rmi-modal" onClick={(e) => e.stopPropagation()}>
          {/* Accent bar */}
          <div style={{ height: 4, background: gm ? gm.color : "var(--accent)", borderRadius: "18px 18px 0 0" }} />

          <div className="modal-header">
            <div className="modal-header-left">
              <h2>{isNew ? "New initiative" : "Edit initiative"}</h2>
              {!isNew && <p className="modal-subtitle">{initiative.name}</p>}
            </div>
            <button className="modal-close-x" onClick={onClose} aria-label="Close">✕</button>
          </div>

          <div className="modal-body rmi-body">
            {error && <div className="field-error rmi-error">{error}</div>}

            {/* Section: Core */}
            <div className="rmi-section">
              <div className="rmi-section-title">Core details</div>
              <div className="rmi-grid-2">
                <div className="field">
                  <label className="field-label">Initiative name <span className="required">*</span></label>
                  <input className="input" value={form.name || ""}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="e.g. Localising the flow" />
                </div>
                <div className="field">
                  <label className="field-label">Group / Theme <span className="required">*</span></label>
                  <input className="input" value={form.summary || ""}
                    onChange={(e) => set("summary", e.target.value)}
                    placeholder="e.g. First booking conversion" />
                </div>
              </div>
              <div className="rmi-grid-3">
                <div className="field">
                  <label className="field-label">Status</label>
                  <select className="select" value={form.status || "Planned"}
                    onChange={(e) => set("status", e.target.value as RoadmapStatus)}>
                    {ROADMAP_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Start quarter</label>
                  <select className="select" value={form.quarter || ""}
                    onChange={(e) => set("quarter", e.target.value)}>
                    <option value="">— Not set —</option>
                    {QUARTERS.map((q) => <option key={q} value={q}>{q}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">End quarter</label>
                  <select className="select" value={form.endQuarter || ""}
                    onChange={(e) => set("endQuarter", e.target.value)}>
                    <option value="">— Same —</option>
                    {QUARTERS.map((q) => <option key={q} value={q}>{q}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Section: Strategy */}
            <div className="rmi-section">
              <div className="rmi-section-title">Strategy &amp; ownership</div>
              <div className="rmi-grid-2">
                <div className="field">
                  <label className="field-label">Strategy goal</label>
                  <select className="select" value={form.strategyGoal || ""}
                    onChange={(e) => set("strategyGoal", e.target.value as StrategyGoal | "")}>
                    <option value="">— None —</option>
                    {(Object.keys(STRATEGY_GOAL_LABELS) as StrategyGoal[]).map((g) => (
                      <option key={g} value={g}>{STRATEGY_GOAL_LABELS[g]}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Owner</label>
                  <input className="input" value={form.owner || ""}
                    onChange={(e) => set("owner", e.target.value)}
                    placeholder="Team or person" />
                </div>
              </div>
            </div>

            {/* Section: Description & Notes */}
            <div className="rmi-section">
              <div className="rmi-section-title">Description &amp; notes</div>
              <div className="field">
                <label className="field-label">Description</label>
                <textarea className="textarea" rows={2} value={form.description || ""}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="What does this initiative entail?" />
              </div>
              <div className="field" style={{ marginTop: 10 }}>
                <label className="field-label">Notes</label>
                <textarea className="textarea" rows={3} value={form.notes || ""}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder="Any additional notes, links, or context…" />
              </div>
            </div>
          </div>

          <div className="modal-actions">
            {!isNew && !readOnly && (
              <button className="btn btn-danger" onClick={handleDelete} disabled={busy}>Delete</button>
            )}
            <div style={{ flex: 1 }} />
            <button className="btn btn-soft" onClick={isNew ? onClose : () => setMode("view")}>
              {isNew ? "Cancel" : "Back"}
            </button>
            {!readOnly && (
              <button className="btn primary" onClick={handleSave} disabled={busy}>
                {busy ? "Saving…" : isNew ? "Create" : "Save"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── VIEW mode ──
  const ss = STATUS_STYLES[initiative.status] ?? STATUS_STYLES["Planned"];
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal rmi-modal" onClick={(e) => e.stopPropagation()}>
        {/* Accent bar */}
        <div style={{ height: 4, background: gm ? gm.color : "#94a3b8", borderRadius: "18px 18px 0 0" }} />

        <div className="modal-header">
          <div className="modal-header-left">
            <h2>{initiative.name}</h2>
            <div className="modal-subtitle">
              <span>{initiative.summary}</span>
              {gn && gm && initiative.strategyGoal && (
                <span className="rmi-goal-pill" style={{ background: gm.light, color: gm.color }}>
                  Goal {gn}
                </span>
              )}
            </div>
          </div>
          <button className="modal-close-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Badge strip */}
        <div className="modal-badges">
          <span className="meta-badge status" style={{ background: ss.bg, color: ss.fg, borderColor: ss.border }}>
            <span className="rmi-dot" style={{ background: ss.dot }} />
            {initiative.status}
          </span>
          {initiative.quarter && (
            <span className="meta-badge tf">
              {initiative.quarter}{initiative.endQuarter && initiative.endQuarter !== initiative.quarter ? ` → ${initiative.endQuarter}` : ""}
            </span>
          )}
          {initiative.owner && (
            <span className="meta-badge area">{initiative.owner}</span>
          )}
          {initiative.strategyGoal && (
            <span className="meta-badge pod">{STRATEGY_GOAL_LABELS[initiative.strategyGoal as StrategyGoal]}</span>
          )}
        </div>

        {!readOnly && (
          <div className="modal-action-bar">
            <button className="btn primary" onClick={() => setMode("edit")}>Edit</button>
          </div>
        )}

        {/* Description */}
        {initiative.description && (
          <div className="modal-section">
            <p className="rmi-section-label">Description</p>
            <p className="modal-desc">{initiative.description}</p>
          </div>
        )}

        {/* Notes */}
        {initiative.notes && (
          <div className="modal-section">
            <p className="rmi-section-label">Notes</p>
            <div className="modal-notes">{initiative.notes}</div>
          </div>
        )}

        {/* Comments */}
        <div className="modal-section">
          <div className="comments-header">
            <span>Comments ({comments.length})</span>
            {!addingComment && !readOnly && (
              <button className="btn-link" onClick={() => setAddingComment(true)}>+ Add comment</button>
            )}
          </div>
          {comments.length === 0 && !addingComment && (
            <div className="comments-empty">No comments yet.</div>
          )}
          {comments.map((c) => (
            <div key={c.id} className="comment-item">
              <div className="comment-meta">
                <strong>{c.author}</strong>
                <span className="comment-date">
                  {new Date(c.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
              </div>
              <div className="comment-text">{c.text}</div>
            </div>
          ))}
          {addingComment && (
            <div className="comment-compose">
              <input className="comment-author-input" placeholder="Your name"
                value={commentAuthor} onChange={(e) => setCommentAuthor(e.target.value)} />
              <textarea className="comment-textarea" placeholder="Write a comment…"
                value={commentText} onChange={(e) => setCommentText(e.target.value)} autoFocus />
              <div className="comment-actions">
                <button className="btn btn-soft" style={{ fontSize: 13, padding: "6px 12px" }}
                  onClick={() => { setAddingComment(false); setCommentText(""); }}>Cancel</button>
                <button className="btn primary" style={{ fontSize: 13, padding: "6px 12px" }}
                  onClick={addComment} disabled={busy}>Post comment</button>
              </div>
            </div>
          )}
          {error && <div className="field-error" style={{ marginTop: 8 }}>{error}</div>}
        </div>

        <div className="modal-actions">
          {!readOnly && (
            <button className="btn btn-danger" onClick={handleDelete} disabled={busy}>Delete</button>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn btn-soft" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Gantt row ─────────────────────────────────────────────────────────────────

function GanttRow({
  initiative,
  months,
  windowStartUnit,
  windowEndUnit,
  onOpen,
  onSpanChange,
  readOnly,
  resizePreview,
  wasResizing,
  onResizeStart,
  dragHandleProps,
}: {
  initiative: RoadmapInitiative;
  months: MonthCol[];
  windowStartUnit: number;
  windowEndUnit: number;
  onOpen: () => void;
  // Persist a fine-grained [startUnit, endUnit) span.
  onSpanChange: (id: string, startUnit: number, endUnit: number) => void;
  readOnly: boolean;
  // Live resize preview, expressed in units.
  resizePreview?: { start: number; end: number } | null;
  wasResizing: () => boolean;
  onResizeStart: (e: React.PointerEvent, id: string, side: "left" | "right") => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const ss = STATUS_STYLES[initiative.status] ?? STATUS_STYLES["Planned"];
  const gc = goalColor(initiative);

  // Resolve the bar's unit span (preview during drag, else stored).
  const stored = spanUnitsOf(initiative);
  const span = resizePreview ?? stored;
  const windowUnits = windowEndUnit - windowStartUnit;

  // Clip the span to the visible window and convert to % offsets.
  let bar: { leftPct: number; widthPct: number; clipLeft: boolean; clipRight: boolean } | null = null;
  if (span && span.end > windowStartUnit && span.start < windowEndUnit) {
    const visStart = Math.max(span.start, windowStartUnit);
    const visEnd   = Math.min(span.end, windowEndUnit);
    bar = {
      leftPct: ((visStart - windowStartUnit) / windowUnits) * 100,
      widthPct: ((visEnd - visStart) / windowUnits) * 100,
      clipLeft: span.start < windowStartUnit,
      clipRight: span.end > windowEndUnit,
    };
  }

  function handleTrackClick(e: React.MouseEvent<HTMLDivElement>) {
    if (wasResizing()) return; // ignore the click that trails a resize drag
    // Clicking an existing bar opens detail; in read-only that's the only action.
    if (span) { onOpen(); return; }
    if (readOnly) return;
    // No bar yet — place a 1-month bar snapped to the clicked half-month.
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    const rawUnit = windowStartUnit + frac * windowUnits;
    const startU = Math.round(rawUnit); // snap to half-month
    onSpanChange(initiative.id, startU, startU + UNITS_PER_MONTH);
  }

  return (
    <div className="gantt-row">
      {/* Label cell — the whole cell is the drag handle (reorder) */}
      <div
        className={`gantt-label-cell${!readOnly ? " gantt-label-draggable" : ""}`}
        {...(!readOnly ? dragHandleProps : {})}
      >
        {!readOnly && (
          <span className="gantt-drag-grip" title="Drag to reorder" aria-hidden>⠿</span>
        )}
        <span className="gantt-dot" style={{ background: ss.dot }} title={initiative.status} />
        <span
          className="gantt-row-name"
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
          role="button"
          title="View details"
        >
          {initiative.name}
        </span>
        {initiative.owner && <span className="gantt-owner-chip">{initiative.owner}</span>}
      </div>

      {/* Month track — grid for dividers, with an absolutely-positioned bar overlay */}
      <div
        className="gantt-track-grid gantt-track-overlay"
        style={{ gridTemplateColumns: `repeat(${months.length}, var(--gantt-col-w))` }}
        onClick={handleTrackClick}
      >
        {months.map((col) => (
          <div
            key={`${col.year}-${col.monthIdx}`}
            className={`gantt-cell${col.isQuarterStart ? " gantt-quarter-start" : ""}`}
          />
        ))}

        {bar && (
          <div
            className="gantt-bar gantt-bar-abs"
            style={{
              left: `${bar.leftPct}%`,
              width: `${bar.widthPct}%`,
              background: gc + "22",
              borderTop: `2px solid ${gc}66`,
              borderBottom: `2px solid ${gc}66`,
              borderLeft: bar.clipLeft ? "none" : `3px solid ${gc}`,
              borderRight: bar.clipRight ? "none" : `3px solid ${gc}`,
              borderTopLeftRadius: bar.clipLeft ? 0 : 6,
              borderBottomLeftRadius: bar.clipLeft ? 0 : 6,
              borderTopRightRadius: bar.clipRight ? 0 : 6,
              borderBottomRightRadius: bar.clipRight ? 0 : 6,
            }}
          >
            {!readOnly && !bar.clipLeft && (
              <div
                className="gantt-resize-handle gantt-resize-left"
                onPointerDown={(e) => onResizeStart(e, initiative.id, "left")}
                title="Drag to change start"
                aria-label="Resize start"
              />
            )}
            <span className="gantt-bar-label" style={{ color: gc }}>
              {initiative.name}
            </span>
            {!readOnly && !bar.clipRight && (
              <div
                className="gantt-resize-handle gantt-resize-right"
                onPointerDown={(e) => onResizeStart(e, initiative.id, "right")}
                title="Drag to resize"
                aria-label="Resize end"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface Props {
  initial: RoadmapInitiative[];
  readOnly?: boolean;
  published?: boolean;
}

export default function ProductRoadmap({ initial, readOnly = false, published = false }: Props) {
  const [items, setItems] = useState<RoadmapInitiative[]>(initial);
  const [filterStatus, setFilterStatus] = useState<RoadmapStatus | "All">("All");
  const [filterGoal, setFilterGoal] = useState<string>("All");
  const [modal, setModal] = useState<RoadmapInitiative | null | "new">(null);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [isPublished, setIsPublished] = useState(published);
  const [publishing, setPublishing] = useState(false);

  // ── Resize state ─────────────────────────────────────────────────────────────
  // Tracks which bar is being dragged and its live preview span
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [resizePreview, setResizePreview] = useState<{ start: number; end: number } | null>(null);
  const resizeRef = useRef<{
    id: string;
    side: "left" | "right";
    fixedUnit: number;  // the unit edge that doesn't move
    trackLeft: number;  // px offset of the track grid's left edge
    trackWidth: number; // px width of the full track grid
  } | null>(null);
  const ganttTableRef = useRef<HTMLDivElement>(null);
  const currentQIdx = currentQuarterIdx();
  // Visible month columns: 3 of this quarter + 2 of next. Stable for the session.
  const months = useMemo(() => buildVisibleMonths(), []);
  // Unit range of the visible window (left edge of first month → right edge of last).
  const windowStartUnit = months.length ? months[0].startUnit : 0;
  const windowEndUnit = months.length ? months[months.length - 1].startUnit + UNITS_PER_MONTH : UNITS_PER_QUARTER;

  function flash(msg: string, err = false) {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3000);
  }

  async function togglePublish() {
    const next = !isPublished;
    setPublishing(true);
    try {
      const res = await fetch("/api/roadmap-initiatives/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed");
      setIsPublished(data.published);
      flash(data.published ? "Roadmap published — now visible to viewers ✓" : "Roadmap unpublished — hidden from viewers");
    } catch (e: unknown) {
      flash(e instanceof Error ? e.message : "Publish failed", true);
    } finally {
      setPublishing(false);
    }
  }

  // ── Resize pointer handlers ───────────────────────────────────────────────
  // Tracks whether a resize actually moved, so the trailing cell click can be suppressed.
  const resizeMovedRef = useRef(false);

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

    resizeRef.current = { id, side, fixedUnit, trackLeft, trackWidth };
    resizeMovedRef.current = false;
    setResizingId(id);
    setResizePreview({ start: stored.start, end: stored.end });

    // Capture the pointer so we keep receiving moves even outside the handle.
    const target = e.currentTarget as HTMLElement;
    try { target.setPointerCapture(e.pointerId); } catch { /* noop */ }

    // Map a pointer X to a unit, snapped to the nearest half-month (whole unit),
    // clamped to the visible window.
    function unitAt(clientX: number, tl: number, tw: number): number {
      const frac = (clientX - tl) / tw;
      const raw = windowStartUnit + frac * (windowEndUnit - windowStartUnit);
      const snapped = Math.round(raw);
      return Math.max(windowStartUnit, Math.min(windowEndUnit, snapped));
    }

    function onPointerMove(ev: PointerEvent) {
      if (!resizeRef.current) return;
      const { fixedUnit: fixed, side: s, trackLeft: tl, trackWidth: tw } = resizeRef.current;
      const u = unitAt(ev.clientX, tl, tw);
      let newStart = s === "right" ? fixed : u;
      let newEnd   = s === "right" ? u : fixed;
      // Keep a minimum width of one half-month.
      if (newEnd - newStart < 1) {
        if (s === "right") newEnd = newStart + 1;
        else newStart = newEnd - 1;
      }
      resizeMovedRef.current = true;
      setResizePreview({ start: newStart, end: newEnd });
    }

    function onPointerUp(ev: PointerEvent) {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      const ref = resizeRef.current;
      resizeRef.current = null;
      setResizingId(null);
      setResizePreview(null);
      if (!ref) return;
      const { fixedUnit: fixed, side: s, id: rid, trackLeft: tl, trackWidth: tw } = ref;
      const u = unitAt(ev.clientX, tl, tw);
      let finalStart = s === "right" ? fixed : u;
      let finalEnd   = s === "right" ? u : fixed;
      if (finalEnd - finalStart < 1) {
        if (s === "right") finalEnd = finalStart + 1;
        else finalStart = finalEnd - 1;
      }
      const orig = spanUnitsOf(item!);
      if (!orig || finalStart !== orig.start || finalEnd !== orig.end) {
        onSpanChange(rid, finalStart, finalEnd);
      }
      // Suppress the click that fires right after pointerup on the underlying track.
      setTimeout(() => { resizeMovedRef.current = false; }, 0);
    }

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }, [items, readOnly, windowStartUnit, windowEndUnit]); // eslint-disable-line react-hooks/exhaustive-deps

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/roadmap-initiatives", { cache: "no-store" });
      const data = await res.json();
      if (data.ok) setItems(data.initiatives);
      else throw new Error(data.error);
    } catch (e: unknown) {
      flash(e instanceof Error ? e.message : "Refresh failed", true);
    } finally {
      setRefreshing(false);
    }
  }

  function onSaved(i: RoadmapInitiative) {
    setItems((prev) => {
      const exists = prev.find((x) => x.id === i.id);
      if (exists) return prev.map((x) => (x.id === i.id ? i : x));
      return [...prev, i].sort((a, b) => a.order - b.order);
    });
    setModal(null);
    flash("Saved ✓");
  }

  function onDeleted(id: string) {
    setItems((prev) => prev.filter((x) => x.id !== id));
    setModal(null);
    flash("Deleted");
  }

  // Persist a fine-grained unit span. Also derives quarter/endQuarter so other
  // consumers (e.g. the strategy chart) that read quarters stay consistent.
  async function onSpanChange(id: string, startUnit: number, endUnit: number) {
    const startQ = Math.floor(startUnit / UNITS_PER_QUARTER);
    // endUnit is exclusive; the last covered unit is endUnit-1.
    const endQ = Math.floor((endUnit - 1) / UNITS_PER_QUARTER);
    const quarter = QUARTERS[Math.max(0, Math.min(QUARTERS.length - 1, startQ))];
    const endQuarter = endQ > startQ ? QUARTERS[Math.max(0, Math.min(QUARTERS.length - 1, endQ))] : "";
    const patch = { startUnit, endUnit, quarter, endQuarter };

    // Optimistic update
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    try {
      const res = await fetch(`/api/roadmap-initiatives/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Save failed");
      setItems((prev) => prev.map((x) => (x.id === id ? data.initiative : x)));
    } catch (e: unknown) {
      flash(e instanceof Error ? e.message : "Update failed", true);
    }
  }

  async function persistOrder(id: string, order: number) {
    try {
      await fetch(`/api/roadmap-initiatives/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });
    } catch { /* non-fatal */ }
  }

  function onDragEnd(result: DropResult) {
    if (readOnly) return;
    if (!result.destination) return;
    const srcGroup = result.source.droppableId;
    const dstGroup = result.destination.droppableId;
    if (srcGroup !== dstGroup) return; // cross-group not supported
    if (result.source.index === result.destination.index) return;

    setItems((prev) => {
      // Build the new order within the group, preserving the order of all items.
      const groupItems = prev.filter((i) => (i.summary || "Other") === srcGroup);
      const reordered = [...groupItems];
      const [moved] = reordered.splice(result.source.index, 1);
      reordered.splice(result.destination!.index, 0, moved);

      // Assign fresh order values and persist any that changed.
      const orderById = new Map<string, number>();
      reordered.forEach((item, idx) => {
        const newOrder = (idx + 1) * 10;
        orderById.set(item.id, newOrder);
        if (item.order !== newOrder) persistOrder(item.id, newOrder);
      });

      // Rebuild the full list: apply new orders to group members, keep others as-is.
      const next = prev.map((item) =>
        orderById.has(item.id) ? { ...item, order: orderById.get(item.id)! } : item
      );
      // Stable sort: group by summary (original group order), then by order within group.
      const groupSeq: string[] = [];
      for (const it of next) {
        const g = it.summary || "Other";
        if (!groupSeq.includes(g)) groupSeq.push(g);
      }
      return next.slice().sort((a, b) => {
        const ga = a.summary || "Other";
        const gb = b.summary || "Other";
        if (ga !== gb) return groupSeq.indexOf(ga) - groupSeq.indexOf(gb);
        return a.order - b.order;
      });
    });
  }

  const filtered = items.filter((i) => {
    if (filterStatus !== "All" && i.status !== filterStatus) return false;
    if (filterGoal !== "All") {
      const gn = i.strategyGoal ? SUBGOAL_TO_GOAL[i.strategyGoal as StrategyGoal] : null;
      if (gn !== filterGoal) return false;
    }
    return true;
  });

  const summaries: string[] = [];
  const bySummary: Record<string, RoadmapInitiative[]> = {};
  for (const item of filtered) {
    const s = item.summary || "Other";
    if (!bySummary[s]) { summaries.push(s); bySummary[s] = []; }
    bySummary[s].push(item);
  }
  // Order swimlanes by the preferred SUMMARY_ORDER, then alphabetically for the rest.
  summaries.sort((a, b) => {
    const ra = summaryRank(a);
    const rb = summaryRank(b);
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });

  const newInitiative: RoadmapInitiative = {
    id: "__new__", summary: "", name: "", strategyGoal: "", status: "Planned",
    description: "", owner: "", quarter: "", endQuarter: "", startUnit: null, endUnit: null,
    notes: "", comments: [], order: 999,
  };
  const modalInitiative = modal === "new" ? newInitiative : modal;

  // Viewers only see the roadmap once it's been published by an editor.
  const hideFromViewer = readOnly && !isPublished;

  return (
    <div className="gantt-root">
      {/* Header */}
      <div className="rm-header">
        <div className="rm-header-left">
          <h1 className="rm-title">Product Roadmap</h1>
          <p className="rm-subtitle">Initiatives organised by theme, linked to Stasher Strategy goals.</p>
        </div>
        <div className="rm-header-actions">
          {!readOnly && (
            <span className={`rm-publish-status ${isPublished ? "live" : "draft"}`}>
              <span className="rm-publish-dot" />
              {isPublished ? "Published" : "Draft"}
            </span>
          )}
          <button className="btn icon-btn" onClick={refresh} disabled={refreshing}
            title="Refresh" aria-label="Refresh">
            <span className={refreshing ? "spin" : ""}>↻</span>
          </button>
          {!readOnly && (
            <button
              className={`btn ${isPublished ? "btn-soft" : "primary"}`}
              onClick={togglePublish}
              disabled={publishing}
              title={isPublished ? "Hide the roadmap from viewers" : "Make the roadmap visible to viewers"}
            >
              {publishing ? "…" : isPublished ? "Unpublish" : "Publish"}
            </button>
          )}
          {!readOnly && (
            <button className="btn primary" onClick={() => setModal("new")}>+ Add initiative</button>
          )}
        </div>
      </div>

      {hideFromViewer ? (
        /* Viewer, roadmap not yet published */
        <div className="rm-unpublished">
          <div className="rm-unpublished-icon" aria-hidden>🗺️</div>
          <h2 className="rm-unpublished-title">The roadmap is being finalised</h2>
          <p className="rm-unpublished-msg">
            The product roadmap will be available to view once all initiatives have been
            decided on and agreed upon across the teams. Check back soon.
          </p>
        </div>
      ) : (
      <>
      {/* Filters */}
      <div className="rm-filters">
        <div className="filter-group">
          <span className="filter-label">Status</span>
          <select className="select" value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as RoadmapStatus | "All")}>
            <option value="All">All statuses</option>
            {ROADMAP_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <span className="filter-label">Goal</span>
          <select className="select" value={filterGoal} onChange={(e) => setFilterGoal(e.target.value)}>
            <option value="All">All goals</option>
            <option value="1">Goal 1 · UK visibility</option>
            <option value="2">Goal 2 · Global hubs</option>
            <option value="3">Goal 3 · Depth &amp; defensibility</option>
          </select>
        </div>
        <span className="rm-count">{filtered.length} initiative{filtered.length !== 1 ? "s" : ""}</span>
        {!readOnly && (
          <span className="gantt-hint">Click cells to place · drag ▐ handle to resize · drag ⠿ to reorder</span>
        )}
      </div>

      {/* Gantt table */}
      {summaries.length === 0 ? (
        <div className="rm-empty">
          No initiatives yet.{!readOnly && " Click \"+ Add initiative\" to get started."}
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className={`gantt-table${readOnly ? " gantt-readonly" : ""}`} ref={ganttTableRef}>
            {/* Quarter section header (spans each quarter's visible months) */}
            <div className="gantt-quarter-row">
              <div className="gantt-label-cell gantt-quarter-corner" />
              <div className="gantt-track-grid" style={{ gridTemplateColumns: `repeat(${months.length}, var(--gantt-col-w))` }}>
                {months.map((col, i) => {
                  const isQuarterStart = col.isQuarterStart;
                  if (!isQuarterStart) return null;
                  // Number of visible months in this quarter (consecutive cols with same quarter).
                  const span = months.filter((m) => m.quarterIdx === col.quarterIdx).length;
                  const isCurrent = col.quarterIdx === currentQIdx;
                  return (
                    <div
                      key={col.quarter}
                      className={`gantt-quarter-cell${isCurrent ? " gantt-quarter-current" : ""}`}
                      style={{ gridColumn: `${i + 1} / span ${span}` }}
                    >
                      <span className="gantt-q-label">{col.quarter}</span>
                      {isCurrent && <span className="gantt-now-pip" />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Month header */}
            <div className="gantt-header-row">
              <div className="gantt-label-cell gantt-header-label">Initiative</div>
              <div className="gantt-track-grid" style={{ gridTemplateColumns: `repeat(${months.length}, var(--gantt-col-w))` }}>
                {months.map((col) => (
                  <div
                    key={`${col.year}-${col.monthIdx}`}
                    className={`gantt-cell gantt-header-cell${col.isQuarterStart ? " gantt-quarter-start" : ""}`}
                  >
                    <span className="gantt-m-label">{col.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Groups */}
            {summaries.map((summary) => {
              const groupItems = bySummary[summary];
              const primaryGoal = groupItems.find((i) => i.strategyGoal)?.strategyGoal as StrategyGoal | undefined;
              const gn = primaryGoal ? SUBGOAL_TO_GOAL[primaryGoal] : undefined;
              const meta = gn ? GOAL_META[gn] : null;

              return (
                <div key={summary} className="gantt-group">
                  {/* Group header */}
                  <div
                    className="gantt-group-header"
                    style={{
                      background: meta ? meta.bg : "#f8fafc",
                      borderLeft: `4px solid ${meta ? meta.color : "#cbd5e1"}`,
                    }}
                  >
                    <div className="gantt-label-cell">
                      <span className="gantt-group-name">{summary}</span>
                      {gn && meta && (
                        <span
                          className="gantt-goal-badge"
                          style={{ background: meta.light, color: meta.color }}
                        >
                          Goal {gn}
                        </span>
                      )}
                    </div>
                    {/* Plain colored band — no cell dividers in group headers */}
                    <div
                      className="gantt-group-track"
                      style={{ width: `calc(${months.length} * var(--gantt-col-w))` }}
                    />
                  </div>

                  {/* Droppable rows */}
                  <Droppable droppableId={summary} direction="vertical" isDropDisabled={readOnly}>
                    {(provided) => (
                      <div ref={provided.innerRef} {...provided.droppableProps}>
                        {groupItems.map((item, index) => (
                          <Draggable key={item.id} draggableId={item.id} index={index} isDragDisabled={readOnly}>
                            {(drag, snapshot) => (
                              <div
                                ref={drag.innerRef}
                                {...drag.draggableProps}
                                className={snapshot.isDragging ? "gantt-row-dragging" : ""}
                              >
                                <GanttRow
                                  initiative={item}
                                  months={months}
                                  windowStartUnit={windowStartUnit}
                                  windowEndUnit={windowEndUnit}
                                  onOpen={() => setModal(item)}
                                  onSpanChange={onSpanChange}
                                  readOnly={readOnly}
                                  resizePreview={resizingId === item.id ? resizePreview : null}
                                  wasResizing={() => resizeMovedRef.current}
                                  onResizeStart={onResizePointerDown}
                                  dragHandleProps={drag.dragHandleProps ?? undefined}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      )}
      </>
      )}

      {modalInitiative && (
        <RoadmapModal
          initiative={modalInitiative}
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
