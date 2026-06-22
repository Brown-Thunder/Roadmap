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

// A single month column in the timeline.
interface MonthCol {
  monthIdx: number;   // 0-11
  year: number;
  label: string;      // "Jul"
  quarter: Quarter;   // owning quarter, e.g. "Q3 2026"
  quarterIdx: number; // index into QUARTERS
  isQuarterStart: boolean; // first month of its quarter within the visible window
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
    return slice.map((m, i) => ({
      monthIdx: m,
      year,
      label: MONTH_ABBR[m],
      quarter,
      quarterIdx: qi,
      isQuarterStart: i === 0,
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
      const url = isNew ? "/api/roadmap-initiatives" : `/api/roadmap-initiatives/${initiative.id}`;
      const res = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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
  onOpen: () => void;
  onSpanChange: (id: string, start: Quarter, end: Quarter) => void;
  readOnly: boolean;
  // Resize preview is expressed in quarter indices (the data model unit).
  resizePreview?: { start: number; end: number } | null;
  wasResizing: () => boolean;
  onResizeStart: (e: React.PointerEvent, id: string, side: "left" | "right") => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const siQ = initiative.quarter ? QUARTER_IDX[initiative.quarter as Quarter] : undefined;
  const rawEiQ = initiative.endQuarter
    ? QUARTER_IDX[initiative.endQuarter as Quarter]
    : siQ;
  // Active quarter span, accounting for live resize preview.
  const startQ = resizePreview ? resizePreview.start : (siQ ?? -1);
  const endQ   = resizePreview ? resizePreview.end   : (rawEiQ ?? startQ);

  const ss = STATUS_STYLES[initiative.status] ?? STATUS_STYLES["Planned"];
  const gc = goalColor(initiative);

  // Translate the quarter span into the visible month-column range.
  const firstMonthCol = startQ === -1 ? -1 : months.findIndex((m) => m.quarterIdx === startQ);
  const lastMonthCol  = startQ === -1 ? -1 : (() => {
    for (let i = months.length - 1; i >= 0; i--) {
      if (months[i].quarterIdx <= endQ) return i;
    }
    return -1;
  })();
  const hasBar = firstMonthCol !== -1 && lastMonthCol !== -1 && lastMonthCol >= firstMonthCol;

  function handleCellClick(col: MonthCol) {
    if (wasResizing()) return; // ignore the click that trails a resize drag
    const baseStart = siQ ?? -1;
    const baseEnd   = rawEiQ ?? baseStart;
    const qi = col.quarterIdx;
    const insideBar = baseStart !== -1 && qi >= baseStart && qi <= baseEnd;

    // In read-only, clicking inside a bar opens detail; empty cells do nothing.
    if (readOnly) {
      if (insideBar) onOpen();
      return;
    }

    if (baseStart === -1) {
      // No bar yet — place it on the clicked month's quarter
      onSpanChange(initiative.id, QUARTERS[qi], QUARTERS[qi]);
    } else if (insideBar) {
      onOpen();
    } else if (qi < baseStart) {
      onSpanChange(initiative.id, QUARTERS[qi], QUARTERS[baseEnd]);
    } else {
      onSpanChange(initiative.id, QUARTERS[baseStart], QUARTERS[qi]);
    }
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

      {/* Month cells */}
      <div className="gantt-track-grid" style={{ gridTemplateColumns: `repeat(${months.length}, var(--gantt-col-w))` }}>
        {months.map((col, i) => {
          const inSpan   = hasBar && i >= firstMonthCol && i <= lastMonthCol;
          const isStart  = hasBar && i === firstMonthCol;
          const isEnd    = hasBar && i === lastMonthCol;
          const isSingle = isStart && isEnd;

          return (
            <div
              key={`${col.year}-${col.monthIdx}`}
              className={[
                "gantt-cell",
                inSpan ? "gantt-cell-active" : "",
                col.isQuarterStart ? "gantt-quarter-start" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => handleCellClick(col)}
              title={inSpan ? undefined : readOnly ? undefined : `Place in ${col.quarter}`}
            >
              {isStart && (
                <div
                  className={`gantt-bar ${isSingle ? "gantt-bar-single" : "gantt-bar-start"}`}
                  style={{
                    background: gc + "22",
                    borderTop: `2px solid ${gc}66`,
                    borderBottom: `2px solid ${gc}66`,
                    borderLeft: `3px solid ${gc}`,
                    borderRight: isSingle ? `3px solid ${gc}` : "none",
                  }}
                >
                  {!readOnly && (
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
                  {!readOnly && isSingle && (
                    <div
                      className="gantt-resize-handle gantt-resize-right"
                      onPointerDown={(e) => onResizeStart(e, initiative.id, "right")}
                      title="Drag to extend"
                      aria-label="Resize end"
                    />
                  )}
                </div>
              )}
              {inSpan && !isStart && !isEnd && (
                <div
                  className="gantt-bar gantt-bar-mid"
                  style={{
                    background: gc + "22",
                    borderTop: `2px solid ${gc}66`,
                    borderBottom: `2px solid ${gc}66`,
                  }}
                />
              )}
              {inSpan && !isStart && isEnd && (
                <div
                  className="gantt-bar gantt-bar-end"
                  style={{
                    background: gc + "22",
                    borderTop: `2px solid ${gc}66`,
                    borderBottom: `2px solid ${gc}66`,
                    borderRight: `3px solid ${gc}`,
                  }}
                >
                  {!readOnly && (
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
          );
        })}
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
    fixedIdx: number;   // the quarter index that doesn't move
    cellWidth: number;
    trackLeft: number;  // px offset of the track grid's left edge
  } | null>(null);
  const ganttTableRef = useRef<HTMLDivElement>(null);
  const currentQIdx = currentQuarterIdx();
  // Visible month columns: 3 of this quarter + 2 of next. Stable for the session.
  const months = useMemo(() => buildVisibleMonths(), []);

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

    // Measure a real cell to get accurate column width (handles fixed-px columns + scroll).
    const cellEl = ganttTableRef.current.querySelector<HTMLElement>(".gantt-track-grid .gantt-cell");
    const trackEl = ganttTableRef.current.querySelector<HTMLElement>(".gantt-track-grid");
    if (!cellEl || !trackEl) return;
    const cellWidth = cellEl.getBoundingClientRect().width;
    const trackLeft = trackEl.getBoundingClientRect().left;

    const si = item.quarter ? QUARTER_IDX[item.quarter as Quarter] : 0;
    const ei = item.endQuarter ? QUARTER_IDX[item.endQuarter as Quarter] : si;
    const fixedIdx = side === "right" ? si : ei;

    resizeRef.current = { id, side, fixedIdx, cellWidth, trackLeft };
    resizeMovedRef.current = false;
    setResizingId(id);
    setResizePreview({ start: si, end: ei });

    // Capture the pointer so we keep receiving moves even outside the handle.
    const target = e.currentTarget as HTMLElement;
    try { target.setPointerCapture(e.pointerId); } catch { /* noop */ }

    // Pure helper — maps a pointer X to a month column, then to that month's
    // quarter index (the data unit). Takes captured geometry so it never touches
    // the (possibly already-nulled) resizeRef.
    function computeIdx(clientX: number, tl: number, cw: number): number {
      const rawCol = Math.floor((clientX - tl) / cw);
      const col = Math.max(0, Math.min(months.length - 1, rawCol));
      return months[col].quarterIdx;
    }

    function onPointerMove(ev: PointerEvent) {
      if (!resizeRef.current) return;
      const { fixedIdx: fixed, side: s, trackLeft: tl, cellWidth: cw } = resizeRef.current;
      const idx = computeIdx(ev.clientX, tl, cw);
      const newStart = s === "right" ? fixed : idx;
      const newEnd   = s === "right" ? idx : fixed;
      if (newStart <= newEnd) {
        resizeMovedRef.current = true;
        setResizePreview({ start: newStart, end: newEnd });
      }
    }

    function onPointerUp(ev: PointerEvent) {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      const ref = resizeRef.current;
      resizeRef.current = null;
      setResizingId(null);
      setResizePreview(null);
      if (!ref) return;
      const { fixedIdx: fixed, side: s, id: rid, trackLeft: tl, cellWidth: cw } = ref;
      const idx = computeIdx(ev.clientX, tl, cw);
      const finalStart = s === "right" ? fixed : idx;
      const finalEnd   = s === "right" ? idx : fixed;
      // Only persist if the span actually changed.
      const orig = items.find((x) => x.id === rid);
      const origStart = orig?.quarter ? QUARTER_IDX[orig.quarter as Quarter] : -1;
      const origEnd = orig?.endQuarter ? QUARTER_IDX[orig.endQuarter as Quarter] : origStart;
      if (finalStart <= finalEnd && (finalStart !== origStart || finalEnd !== origEnd)) {
        onSpanChange(rid, QUARTERS[finalStart], QUARTERS[finalEnd]);
      }
      // Suppress the click that fires right after pointerup on the underlying cell.
      setTimeout(() => { resizeMovedRef.current = false; }, 0);
    }

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }, [items, readOnly, months]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function onSpanChange(id: string, start: Quarter, end: Quarter) {
    // Optimistic update
    setItems((prev) =>
      prev.map((x) => (x.id === id ? { ...x, quarter: start, endQuarter: end !== start ? end : "" } : x))
    );
    try {
      const res = await fetch(`/api/roadmap-initiatives/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quarter: start, endQuarter: end !== start ? end : "" }),
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
    description: "", owner: "", quarter: "", endQuarter: "", notes: "", comments: [], order: 999,
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
                    <div className="gantt-track-grid" style={{ gridTemplateColumns: `repeat(${months.length}, var(--gantt-col-w))` }}>
                      {months.map((col) => (
                        <div
                          key={`${col.year}-${col.monthIdx}`}
                          className={`gantt-cell gantt-group-cell${col.isQuarterStart ? " gantt-quarter-start" : ""}`}
                        />
                      ))}
                    </div>
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
