"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { toPng } from "html-to-image";
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
  RoadmapTeam,
  RoadmapSubBar,
  StrategyGoal,
  ROADMAP_STATUS_OPTIONS,
  ROADMAP_TEAM_OPTIONS,
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

// Within the active quarter the 3 months map to Now / Next / Later.
const QUARTER_MONTH_HORIZON = ["Now", "Next", "Later"] as const;

// ── Timeline units ─────────────────────────────────────────────────────────
// The timeline is measured in "week units" anchored at QUARTERS[0] month 0.
// 1 month = 4 units (≈ weeks); 1 quarter = 12 units. Resizing/moving snaps to
// whole units, giving 1-week increments.
const UNITS_PER_MONTH = 4;
const UNITS_PER_QUARTER = UNITS_PER_MONTH * 3; // 12

function quarterToStartUnit(qIdx: number): number {
  return qIdx * UNITS_PER_QUARTER;
}

// Convert a timeline unit (week, anchored at QUARTERS[0] month 0) into a readable
// label like "Jul 2026 wk 1" or "Aug 2026 wk 3".
function unitToDateLabel(unit: number): string {
  const monthsFromAnchor = Math.floor(unit / UNITS_PER_MONTH);
  const weekOfMonth = (unit % UNITS_PER_MONTH) + 1; // 1-based week within the month
  const qi = Math.floor(monthsFromAnchor / 3);
  const monthInQuarter = monthsFromAnchor % 3;
  const quarter = QUARTERS[Math.min(QUARTERS.length - 1, Math.max(0, qi))];
  const qNum = quarter.slice(0, 2);
  const year = parseInt(quarter.slice(3));
  const calMonth = QUARTER_MONTHS[qNum][monthInQuarter];
  return `${MONTH_ABBR[calMonth]} ${year} wk ${weekOfMonth}`;
}

// A readable span label for a [start, end) unit range, e.g.
// "Early Jul 2026 → Mid Aug 2026". end is exclusive, so we render end-1's month.
function unitRangeLabel(start: number, end: number): string {
  const startLabel = unitToDateLabel(start);
  const endLabel = unitToDateLabel(Math.max(start, end - 1));
  return startLabel === endLabel ? startLabel : `${startLabel} → ${endLabel}`;
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
  fullLabel: string;  // "Jul 2026"
  quarter: Quarter;   // owning quarter, e.g. "Q3 2026"
  quarterIdx: number; // index into QUARTERS
  isQuarterStart: boolean; // first month of its quarter
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

// Total months covered by the quarter range (each quarter = 3 months).
const TOTAL_MONTHS = QUARTERS.length * 3;

// Zoom levels. `months` is how many month columns should fit in the visible
// timeline viewport at that zoom. The timeline always spans the full range and
// scrolls; the selector just sets how many months are shown at once, so each
// column's px width is derived from the measured viewport width ÷ months.
const VIEW_OPTIONS = [
  { id: "1M",  label: "1M",  months: 1 },
  { id: "3M",  label: "3M",  months: 3 },
  { id: "6M",  label: "6M",  months: 6 },
  { id: "12M", label: "12M", months: 12 },
] as const;
type ViewId = (typeof VIEW_OPTIONS)[number]["id"];

// Fallback column widths used before the timeline width has been measured.
const FALLBACK_COL_WIDTH: Record<ViewId, number> = {
  "1M": 520, "3M": 190, "6M": 110, "12M": 64,
};

function monthsPerView(view: ViewId): number {
  return VIEW_OPTIONS.find((v) => v.id === view)?.months ?? 6;
}

// Build the full set of month columns across the entire quarter range. The view
// (zoom) does not change which months exist — only their on-screen width — so
// bars stay date-locked and the user can scroll the whole roadmap at any zoom.
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

// Sortable numeric key for a strategy sub-goal, e.g. "1.2" -> 102, "3.1" -> 301.
// Groups/themes are ordered by the sub-goal they serve (1.1 first, then 1.2, …).
// Missing/invalid goals sort to the very bottom.
function subGoalSortKey(sg: StrategyGoal | "" | undefined): number {
  if (!sg) return Number.POSITIVE_INFINITY;
  const [major, minor] = sg.split(".").map((n) => parseInt(n, 10));
  if (Number.isNaN(major) || Number.isNaN(minor)) return Number.POSITIVE_INFINITY;
  return major * 100 + minor;
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
  // Inline rename of a workstream from view mode. "__main__" = the primary bar.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  // Which workstream row is expanded to reveal its details (null = none).
  const [expandedWsId, setExpandedWsId] = useState<string | null>(null);

  const statusStyle = STATUS_STYLES[form.status] ?? STATUS_STYLES["Planned"];
  const gn = goalNum(form.strategyGoal);
  const gm = gn ? GOAL_META[gn] : null;

  function set(key: keyof RoadmapInitiative, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Persist a partial update from view mode (used for inline workstream renames).
  async function patchInitiative(patch: Partial<RoadmapInitiative>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/roadmap-initiatives/${initiative.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed");
      onSaved(data.initiative);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  function commitRename() {
    const id = renamingId;
    const label = renameDraft.trim();
    setRenamingId(null);
    if (!id) return;
    if (id === "__main__") {
      if (label !== (initiative.mainBarLabel || "")) patchInitiative({ mainBarLabel: label });
    } else {
      const next = (initiative.subBars || []).map((x) =>
        x.id === id ? { ...x, label: label || "Unlabelled" } : x
      );
      patchInitiative({ subBars: next });
    }
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
                  <label className="field-label">Team</label>
                  <select className="select" value={form.team || ""}
                    onChange={(e) => set("team", e.target.value as RoadmapTeam | "")}>
                    <option value="">— None —</option>
                    {ROADMAP_TEAM_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="rmi-grid-2" style={{ marginTop: 12 }}>
                <div className="field">
                  <label className="field-label">Owner</label>
                  <input className="input" value={form.owner || ""}
                    onChange={(e) => set("owner", e.target.value)}
                    placeholder="Team or person" />
                </div>
              </div>
            </div>

            {/* Section: Success & metrics */}
            <div className="rmi-section">
              <div className="rmi-section-title">Success &amp; metrics</div>
              <div className="field">
                <label className="field-label">North star metric</label>
                <input className="input" value={form.northStarMetric || ""}
                  onChange={(e) => set("northStarMetric", e.target.value)}
                  placeholder="e.g. First-booking CVR from Tier 1 city pages" />
              </div>
              <div className="field" style={{ marginTop: 10 }}>
                <label className="field-label">How we'll track success</label>
                <textarea className="textarea" rows={2} value={form.successMetrics || ""}
                  onChange={(e) => set("successMetrics", e.target.value)}
                  placeholder="Key metrics and signals we'll use to measure this initiative…" />
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
          {initiative.team && (
            <span className={`meta-badge rmi-team-badge team-${initiative.team.toLowerCase()}`}>{initiative.team}</span>
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

        {/* North star metric */}
        {initiative.northStarMetric && (
          <div className="modal-section">
            <p className="rmi-section-label">North star metric</p>
            <div className="rmi-north-star-metric">{initiative.northStarMetric}</div>
          </div>
        )}

        {/* Success metrics */}
        {initiative.successMetrics && (
          <div className="modal-section">
            <p className="rmi-section-label">How we&apos;ll track success</p>
            <div className="modal-notes">{initiative.successMetrics}</div>
          </div>
        )}

        {/* Workstreams — the primary bar plus any sub-bars. Shown when there's a
            placed primary bar or at least one sub-bar. */}
        {(() => {
          const gc2 = goalColor(initiative);
          const hasPrimary = initiative.startUnit != null && initiative.endUnit != null;
          const subs = initiative.subBars || [];
          if (!hasPrimary && subs.length === 0) return null;

          // One workstream row, expandable to reveal date / description / metrics.
          const rowFor = (
            key: string,
            currentLabel: string,
            span: { start: number; end: number } | null,
            renameKey: string | null,           // null = not renamable
            renameSeed: string,
            details: { status?: RoadmapStatus; goalLabel?: string; description?: string; northStarMetric?: string; successMetrics?: string },
            onDelete?: () => void,
          ) => {
            const expanded = expandedWsId === key;
            const hasDetails = !!(span || details.status || details.goalLabel || details.description || details.northStarMetric || details.successMetrics);
            const statusDot = details.status ? (STATUS_STYLES[details.status] ?? STATUS_STYLES["Planned"]).dot : gc2;
            return (
              <div key={key} className={`rmi-workstream${expanded ? " expanded" : ""}`}>
                <div className="rmi-workstream-row">
                  <button
                    className="rmi-workstream-toggle"
                    aria-expanded={expanded}
                    title={expanded ? "Collapse" : "Expand"}
                    onClick={() => setExpandedWsId(expanded ? null : key)}
                  >
                    <span className={`rmi-workstream-caret${expanded ? " open" : ""}`}>▸</span>
                    <span className="rmi-workstream-dot" style={{ background: statusDot }} title={details.status} />
                    {renameKey && renamingId === renameKey ? (
                      <input
                        className="input rmi-workstream-rename-input"
                        autoFocus
                        value={renameDraft}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                      />
                    ) : (
                      <span className="rmi-workstream-label">{currentLabel}</span>
                    )}
                  </button>
                  {span && (
                    <span className="rmi-workstream-range">{unitRangeLabel(span.start, span.end)}</span>
                  )}
                  {!readOnly && renameKey && renamingId !== renameKey && (
                    <button
                      className="rmi-workstream-icon-btn"
                      title="Rename"
                      onClick={() => { setRenameDraft(renameSeed); setRenamingId(renameKey); }}
                    >✎</button>
                  )}
                  {!readOnly && onDelete && (
                    <button className="rmi-workstream-delete" title="Delete this workstream" onClick={onDelete}>✕</button>
                  )}
                </div>
                {expanded && (
                  <div className="rmi-workstream-detail">
                    {details.status && (
                      <div className="rmi-ws-field">
                        <span className="rmi-ws-field-label">Status</span>
                        <span className="rmi-ws-field-value">{details.status}</span>
                      </div>
                    )}
                    {span && (
                      <div className="rmi-ws-field">
                        <span className="rmi-ws-field-label">Dates</span>
                        <span className="rmi-ws-field-value">{unitRangeLabel(span.start, span.end)}</span>
                      </div>
                    )}
                    {details.goalLabel && (
                      <div className="rmi-ws-field">
                        <span className="rmi-ws-field-label">Strategy goal</span>
                        <span className="rmi-ws-field-value">{details.goalLabel}</span>
                      </div>
                    )}
                    {details.description && (
                      <div className="rmi-ws-field">
                        <span className="rmi-ws-field-label">Description</span>
                        <span className="rmi-ws-field-value">{details.description}</span>
                      </div>
                    )}
                    {details.northStarMetric && (
                      <div className="rmi-ws-field">
                        <span className="rmi-ws-field-label">North star metric</span>
                        <span className="rmi-ws-field-value">{details.northStarMetric}</span>
                      </div>
                    )}
                    {details.successMetrics && (
                      <div className="rmi-ws-field">
                        <span className="rmi-ws-field-label">Success metrics</span>
                        <span className="rmi-ws-field-value">{details.successMetrics}</span>
                      </div>
                    )}
                    {!hasDetails && <div className="rmi-ws-empty">No additional details.</div>}
                  </div>
                )}
              </div>
            );
          };

          // Build every workstream row (main bar + sub-bars) with a sort key, then
          // order them by start date — soonest first, undated rows last.
          const rows: { sortStart: number; node: React.ReactNode }[] = [];

          if (hasPrimary) {
            rows.push({
              sortStart: initiative.startUnit!,
              node: rowFor(
                "__main__",
                initiative.mainBarLabel || initiative.name,
                { start: initiative.startUnit!, end: initiative.endUnit! },
                "__main__",
                initiative.mainBarLabel || "",
                {
                  status: initiative.status,
                  goalLabel: initiative.strategyGoal ? STRATEGY_GOAL_LABELS[initiative.strategyGoal as StrategyGoal] : undefined,
                  description: initiative.mainBarDescription,
                  northStarMetric: initiative.mainBarNorthStarMetric,
                  successMetrics: initiative.mainBarSuccessMetrics,
                },
                async () => {
                  const lbl = initiative.mainBarLabel || initiative.name;
                  if (!confirm(`Delete workstream "${lbl}"?`)) return;
                  // Clearing the initiative's own bar: drop its placed span. If there
                  // are sub-bars, promote the earliest-starting one to the initiative's
                  // span so the initiative keeps a bar on the roadmap.
                  const placed = subs
                    .filter((sb) => sb.startUnit != null && sb.endUnit != null)
                    .sort((a, b) => a.startUnit! - b.startUnit! || a.endUnit! - b.endUnit!);
                  if (placed.length > 0) {
                    const promote = placed[0];
                    const remaining = subs.filter((sb) => sb.id !== promote.id);
                    const sq = Math.floor(promote.startUnit! / UNITS_PER_QUARTER);
                    const eq = Math.floor((promote.endUnit! - 1) / UNITS_PER_QUARTER);
                    await patchInitiative({
                      mainBarLabel: promote.label || "",
                      mainBarDescription: promote.description || "",
                      mainBarNorthStarMetric: promote.northStarMetric || "",
                      mainBarSuccessMetrics: promote.successMetrics || "",
                      startUnit: promote.startUnit,
                      endUnit: promote.endUnit,
                      quarter: QUARTERS[Math.max(0, Math.min(QUARTERS.length - 1, sq))],
                      endQuarter: eq > sq ? QUARTERS[Math.max(0, Math.min(QUARTERS.length - 1, eq))] : "",
                      subBars: remaining,
                    });
                  } else {
                    await patchInitiative({
                      mainBarLabel: "", mainBarDescription: "", mainBarNorthStarMetric: "", mainBarSuccessMetrics: "",
                      startUnit: null, endUnit: null, quarter: "", endQuarter: "",
                    });
                  }
                },
              ),
            });
          }

          for (const sb of subs) {
            rows.push({
              sortStart: sb.startUnit != null ? sb.startUnit : Number.POSITIVE_INFINITY,
              node: rowFor(
                sb.id,
                sb.label || "Unlabelled",
                sb.startUnit != null && sb.endUnit != null ? { start: sb.startUnit, end: sb.endUnit } : null,
                sb.id,
                sb.label || "",
                (() => {
                  const eff = (sb.strategyGoal || initiative.strategyGoal || "") as StrategyGoal | "";
                  return {
                    status: (sb.status || initiative.status) as RoadmapStatus,
                    goalLabel: eff ? STRATEGY_GOAL_LABELS[eff] : undefined,
                    description: sb.description,
                    northStarMetric: sb.northStarMetric,
                    successMetrics: sb.successMetrics,
                  };
                })(),
                async () => {
                  if (!confirm(`Delete workstream "${sb.label || "Unlabelled"}"?`)) return;
                  const next = subs.filter((x) => x.id !== sb.id);
                  await patchInitiative({ subBars: next });
                },
              ),
            });
          }

          rows.sort((a, b) => a.sortStart - b.sortStart);

          return (
            <div className="modal-section">
              <p className="rmi-section-label">Workstreams</p>
              <div className="rmi-workstreams-list">
                {rows.map((r) => r.node)}
              </div>
            </div>
          );
        })()}

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

// ── Workstream detail modal ───────────────────────────────────────────────────
// Opened by clicking a workstream (sub-bar) directly in the Gantt row. Shows that
// workstream's own dates / description / metrics, with a link back to the parent.

function WorkstreamModal({
  initiative,
  subBar,
  isMain = false,
  readOnly,
  onClose,
  onSaved,
  onOpenInitiative,
}: {
  initiative: RoadmapInitiative;
  subBar: RoadmapSubBar;
  isMain?: boolean;
  readOnly?: boolean;
  onClose: () => void;
  onSaved: (i: RoadmapInitiative) => void;
  onOpenInitiative: () => void;
}) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<RoadmapSubBar>({ ...subBar });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentAuthor, setCommentAuthor] = useState("");
  const [addingComment, setAddingComment] = useState(false);
  const gc = goalColor(initiative);

  const comments = subBar.comments || [];

  const span = form.startUnit != null && form.endUnit != null
    ? { start: form.startUnit, end: form.endUnit } : null;

  // The goal this workstream serves: its own if set, otherwise the parent's.
  const effectiveGoal: StrategyGoal | "" =
    (form.strategyGoal || (isMain ? "" : (initiative.strategyGoal || ""))) as StrategyGoal | "";
  const effectiveGoalNum = goalNum(effectiveGoal);
  const effectiveGoalMeta = effectiveGoalNum ? GOAL_META[effectiveGoalNum] : null;

  // The status this workstream shows: its own if set, otherwise the parent's.
  // The main bar's status is simply the initiative's own status.
  const effectiveStatus: RoadmapStatus =
    (form.status || (isMain ? initiative.status : (initiative.status || "Planned"))) as RoadmapStatus;
  const effectiveStatusStyle = STATUS_STYLES[effectiveStatus] ?? STATUS_STYLES["Planned"];

  function set(key: keyof RoadmapSubBar, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setBusy(true); setError(null);
    try {
      // The initiative's own bar saves into its dedicated main-bar fields (kept
      // independent of the initiative-level description/metrics); sub-bars into subBars.
      // The main bar's strategy goal IS the initiative's own strategyGoal.
      const payload: Partial<RoadmapInitiative> = isMain
        ? {
            mainBarLabel: form.label.trim(),
            mainBarDescription: form.description || "",
            mainBarNorthStarMetric: form.northStarMetric || "",
            mainBarSuccessMetrics: form.successMetrics || "",
            strategyGoal: (form.strategyGoal ?? "") as StrategyGoal | "",
            // The main bar's status is the initiative's own status.
            status: (form.status || "Planned") as RoadmapStatus,
          }
        : {
            subBars: (initiative.subBars || []).map((sb) =>
              sb.id === subBar.id ? { ...form, label: form.label.trim() || "Unlabelled" } : sb
            ),
          };
      const res = await fetch(`/api/roadmap-initiatives/${initiative.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Save failed");
      onSaved(data.initiative);
      setMode("view");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
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
    const nextComments = [...comments, comment];
    // Main bar comments live on the initiative; sub-bar comments live in subBars.
    const payload: Partial<RoadmapInitiative> = isMain
      ? { mainBarComments: nextComments }
      : {
          subBars: (initiative.subBars || []).map((sb) =>
            sb.id === subBar.id ? { ...sb, comments: nextComments } : sb
          ),
        };
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/roadmap-initiatives/${initiative.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal rmi-modal ws-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ height: 4, background: gc, borderRadius: "18px 18px 0 0" }} />
        <div className="modal-header">
          <div className="modal-header-left">
            <h2>{form.label || "Workstream"}</h2>
            <div className="modal-subtitle">
              <span>Workstream in </span>
              <button className="btn-link ws-parent-link" onClick={onOpenInitiative}>{initiative.name}</button>
            </div>
          </div>
          <button className="modal-close-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {mode === "view" ? (
          <>
            <div className="modal-badges">
              <span className="meta-badge status" style={{ background: effectiveStatusStyle.bg, color: effectiveStatusStyle.fg, borderColor: effectiveStatusStyle.border }}>
                <span className="rmi-dot" style={{ background: effectiveStatusStyle.dot }} />
                {effectiveStatus}
              </span>
              {span && <span className="meta-badge tf">{unitRangeLabel(span.start, span.end)}</span>}
              {effectiveGoal && effectiveGoalMeta && (
                <span className="meta-badge" style={{ background: effectiveGoalMeta.light, color: effectiveGoalMeta.color, borderColor: effectiveGoalMeta.light }}>
                  {STRATEGY_GOAL_LABELS[effectiveGoal]}
                </span>
              )}
            </div>
            {!readOnly && (
              <div className="modal-action-bar">
                <button className="btn primary" onClick={() => setMode("edit")}>Edit</button>
              </div>
            )}
            {form.description && (
              <div className="modal-section">
                <p className="rmi-section-label">Description</p>
                <p className="modal-desc">{form.description}</p>
              </div>
            )}
            {form.northStarMetric && (
              <div className="modal-section">
                <p className="rmi-section-label">North star metric</p>
                <div className="rmi-north-star-metric">{form.northStarMetric}</div>
              </div>
            )}
            {form.successMetrics && (
              <div className="modal-section">
                <p className="rmi-section-label">Success metrics</p>
                <div className="modal-notes">{form.successMetrics}</div>
              </div>
            )}
            {!form.description && !form.northStarMetric && !form.successMetrics && (
              <div className="modal-section">
                <div className="rmi-ws-empty">No details yet.{!readOnly && " Click Edit to add some."}</div>
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
              <div style={{ flex: 1 }} />
              <button className="btn btn-soft" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-body rmi-body">
              {error && <div className="field-error rmi-error">{error}</div>}
              <div className="rmi-section">
                <div className="field">
                  <label className="field-label">Workstream name</label>
                  <input className="input" value={form.label}
                    onChange={(e) => set("label", e.target.value)} placeholder="e.g. Web, App, V2" />
                </div>
                <div className="field" style={{ marginTop: 10 }}>
                  <label className="field-label">Status</label>
                  <select className="select"
                    value={isMain ? (form.status || "Planned") : (form.status ?? "")}
                    onChange={(e) => set("status", e.target.value as RoadmapStatus | "")}>
                    {!isMain && (
                      <option value="">
                        {`— Use initiative's status${initiative.status ? ` (${initiative.status})` : ""} —`}
                      </option>
                    )}
                    {ROADMAP_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="field" style={{ marginTop: 10 }}>
                  <label className="field-label">Strategy goal</label>
                  <select className="select" value={form.strategyGoal ?? ""}
                    onChange={(e) => set("strategyGoal", e.target.value as StrategyGoal | "")}>
                    <option value="">
                      {isMain
                        ? "— None —"
                        : `— Use initiative's goal${initiative.strategyGoal ? ` (${initiative.strategyGoal})` : ""} —`}
                    </option>
                    {(Object.keys(STRATEGY_GOAL_LABELS) as StrategyGoal[]).map((g) => (
                      <option key={g} value={g}>{STRATEGY_GOAL_LABELS[g]}</option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ marginTop: 10 }}>
                  <label className="field-label">Description</label>
                  <textarea className="textarea" rows={2} value={form.description || ""}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="What does this workstream cover?" />
                </div>
                <div className="field" style={{ marginTop: 10 }}>
                  <label className="field-label">North star metric</label>
                  <input className="input" value={form.northStarMetric || ""}
                    onChange={(e) => set("northStarMetric", e.target.value)}
                    placeholder="Headline metric this workstream moves" />
                </div>
                <div className="field" style={{ marginTop: 10 }}>
                  <label className="field-label">Success metrics</label>
                  <textarea className="textarea" rows={2} value={form.successMetrics || ""}
                    onChange={(e) => set("successMetrics", e.target.value)}
                    placeholder="How we'll track this workstream's success" />
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <div style={{ flex: 1 }} />
              <button className="btn btn-soft" onClick={() => { setForm({ ...subBar }); setMode("view"); }}>Cancel</button>
              <button className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-bar naming modal ──────────────────────────────────────────────────────
// Shown after a draw gesture creates a new sub-bar. The user names it then confirms.

function SubBarNameModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: (label: string) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  function submit() {
    onConfirm(label.trim() || "New bar");
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal subbar-name-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-left">
            <h2>Name this workstream</h2>
            <p className="modal-subtitle">e.g. App, Web, MVP, V2…</p>
          </div>
          <button className="modal-close-x" onClick={onCancel} aria-label="Close">✕</button>
        </div>
        <div style={{ padding: "16px 24px 20px" }}>
          <input
            ref={inputRef}
            className="input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") onCancel(); }}
            placeholder="Workstream name"
            style={{ fontSize: 15 }}
          />
        </div>
        <div className="modal-actions">
          <div style={{ flex: 1 }} />
          <button className="btn btn-soft" onClick={onCancel}>Cancel</button>
          <button className="btn primary" onClick={submit}>Add workstream</button>
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
  onSubBarSpanChange,
  onTrackPointerDown,
  onBarMoveStart,
  readOnly,
  resizePreview,
  resizingSubBarId,
  movePreview,
  movingSubBarId,
  onResizeStart,
  drawGhost,
  dragHandleProps,
}: {
  initiative: RoadmapInitiative;
  months: MonthCol[];
  windowStartUnit: number;
  windowEndUnit: number;
  // subBarId = null → open the initiative; a sub-bar id → open that workstream.
  onOpen: (subBarId: string | null) => void;
  onSpanChange: (id: string, startUnit: number, endUnit: number) => void;
  onSubBarSpanChange: (id: string, subBarId: string, startUnit: number, endUnit: number) => void;
  onTrackPointerDown: (e: React.PointerEvent, id: string) => void;
  onBarMoveStart: (e: React.PointerEvent, id: string, subBarId: string | null) => void;
  readOnly: boolean;
  resizePreview?: { start: number; end: number } | null;
  resizingSubBarId?: string | null;
  movePreview?: { start: number; end: number } | null;
  movingSubBarId?: string | null;
  onResizeStart: (e: React.PointerEvent, id: string, side: "left" | "right", subBarId?: string) => void;
  drawGhost?: { start: number; end: number } | null;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const ss = STATUS_STYLES[initiative.status] ?? STATUS_STYLES["Planned"];
  const gc = goalColor(initiative);
  const windowUnits = windowEndUnit - windowStartUnit;
  const subBars = initiative.subBars || [];

  function clipSpan(s: { start: number; end: number }) {
    if (s.end <= windowStartUnit || s.start >= windowEndUnit) return null;
    const visStart = Math.max(s.start, windowStartUnit);
    const visEnd   = Math.min(s.end,   windowEndUnit);
    return {
      leftPct:  ((visStart - windowStartUnit) / windowUnits) * 100,
      widthPct: ((visEnd   - visStart)        / windowUnits) * 100,
      clipLeft:  s.start < windowStartUnit,
      clipRight: s.end   > windowEndUnit,
    };
  }

  // Resolve live spans (resize/move previews override stored values).
  const storedPrimary = spanUnitsOf(initiative);
  const primarySpan: { start: number; end: number } | null =
    resizePreview && !resizingSubBarId ? resizePreview
    : movePreview && !movingSubBarId   ? movePreview
    : storedPrimary;

  // Resolve each sub-bar's live span.
  const resolvedSubBars = subBars.map((sb) => {
    if (resizingSubBarId === sb.id && resizePreview) return { ...sb, startUnit: resizePreview.start, endUnit: resizePreview.end };
    if (movingSubBarId   === sb.id && movePreview)   return { ...sb, startUnit: movePreview.start,   endUnit: movePreview.end };
    return sb;
  });

  // Bar height / vertical position helpers.
  // One lane (no overlaps): use CSS defaults (top:7px bottom:7px via .gantt-bar).
  // Multiple lanes: each lane is a FULL-height slice equal to a normal row, and
  // the row grows by one row-height per lane. Bars only take a new lane when they
  // actually overlap another bar; non-overlapping bars share a lane.
  const ROW_H = 56;       // matches .gantt-row height in CSS
  const BAR_INSET = 7;    // matches .gantt-bar top/bottom in CSS
  const laneTopForIdx = (idx: number) => idx * ROW_H + BAR_INSET;

  // Greedy interval packing: place every bar (primary + sub-bars, ordered by start
  // date) into the first lane whose previous bar ends at/before this one's start.
  // "__primary__" identifies the initiative's own bar.
  const PRIMARY_KEY = "__primary__";
  const placedLanes: { key: string; start: number; end: number }[] = [];
  if (primarySpan) placedLanes.push({ key: PRIMARY_KEY, start: primarySpan.start, end: primarySpan.end });
  for (const sb of resolvedSubBars) {
    if (sb.startUnit != null && sb.endUnit != null) placedLanes.push({ key: sb.id, start: sb.startUnit, end: sb.endUnit });
  }
  placedLanes.sort((a, b) => a.start - b.start || a.end - b.end);

  const laneEnds: number[] = []; // end unit of the last bar placed in each lane
  const laneIdxByKey = new Map<string, number>();
  for (const lane of placedLanes) {
    let assigned = -1;
    for (let i = 0; i < laneEnds.length; i++) {
      if (lane.start >= laneEnds[i]) { assigned = i; break; } // fits after prev bar
    }
    if (assigned === -1) { assigned = laneEnds.length; laneEnds.push(lane.end); }
    else laneEnds[assigned] = lane.end;
    laneIdxByKey.set(lane.key, assigned);
  }

  // A draw ghost occupies whichever lane it doesn't overlap (or a fresh lane).
  let ghostLane = 0;
  if (drawGhost) {
    ghostLane = laneEnds.length; // default: new lane
    for (let i = 0; i < laneEnds.length; i++) {
      if (drawGhost.start >= laneEnds[i]) { ghostLane = i; break; }
    }
  }

  const usedLaneCount = Math.max(laneEnds.length, drawGhost ? ghostLane + 1 : 0);
  // Only grow the row / switch to lane positioning when more than one lane is used.
  const showTall = usedLaneCount > 1;
  const stackedRowHeight = usedLaneCount * ROW_H;

  const bar   = primarySpan ? clipSpan(primarySpan) : null;
  const ghost = drawGhost   ? clipSpan(drawGhost)   : null;

  function barStyle(isStacked: boolean, stackIdx: number, clipped: { clipLeft: boolean; clipRight: boolean }) {
    const base = {
      background: gc + "22",
      borderTop:    `2px solid ${gc}66`,
      borderBottom: `2px solid ${gc}66`,
      borderLeft:   clipped.clipLeft  ? "none" : `3px solid ${gc}`,
      borderRight:  clipped.clipRight ? "none" : `3px solid ${gc}`,
      borderTopLeftRadius:     clipped.clipLeft  ? 0 : 6,
      borderBottomLeftRadius:  clipped.clipLeft  ? 0 : 6,
      borderTopRightRadius:    clipped.clipRight ? 0 : 6,
      borderBottomRightRadius: clipped.clipRight ? 0 : 6,
    };
    if (!isStacked) return base; // CSS handles top/bottom (full height, single row)
    // Each lane is a full-height slice: same visible bar height as a normal row.
    return {
      ...base,
      top: laneTopForIdx(stackIdx),
      bottom: "auto" as const,
      height: ROW_H - BAR_INSET * 2,
    };
  }

  return (
    <div
      className={`gantt-row${showTall ? " gantt-row-has-subbars" : ""}`}
      style={showTall ? { height: stackedRowHeight } : undefined}
    >
      {/* Label cell */}
      <div
        className={`gantt-label-cell${!readOnly ? " gantt-label-draggable" : ""}`}
        {...(!readOnly ? dragHandleProps : {})}
      >
        {!readOnly && <span className="gantt-drag-grip" title="Drag to reorder" aria-hidden>⠿</span>}
        <span className="gantt-dot" style={{ background: ss.dot }} title={initiative.status} />
        <div className="gantt-label-text">
          <span className="gantt-row-name" onClick={(e) => { e.stopPropagation(); onOpen(null); }} role="button" title="View details">
            {initiative.name}
          </span>
          {initiative.owner && (
            <div className="gantt-label-pills">
              <span className="gantt-owner-chip">{initiative.owner}</span>
            </div>
          )}
        </div>
      </div>

      {/* Month track */}
      <div
        className={`gantt-track-grid gantt-track-overlay${!readOnly ? " gantt-track-drawable" : ""}`}
        style={{ gridTemplateColumns: `repeat(${months.length}, var(--gantt-col-w))` }}
        onPointerDown={readOnly ? undefined : (e) => onTrackPointerDown(e, initiative.id)}
      >
        {months.map((col) => (
          <div key={`${col.year}-${col.monthIdx}`}
            className={`gantt-cell${col.isQuarterStart ? " gantt-quarter-start" : ""}`} />
        ))}

        {/* Primary bar */}
        {bar && (() => {
          const stackIdx = laneIdxByKey.get(PRIMARY_KEY) ?? 0;
          const style = { left: `${bar.leftPct}%`, width: `${bar.widthPct}%`, ...barStyle(showTall, stackIdx, bar) };
          return (
            <div className="gantt-bar" style={style} onClick={(e) => { e.stopPropagation(); onOpen("__main__"); }}>
              {!readOnly && !bar.clipLeft && (
                <div className="gantt-resize-handle gantt-resize-left"
                  onPointerDown={(e) => { e.stopPropagation(); onResizeStart(e, initiative.id, "left"); }} />
              )}
              {!readOnly && (
                <div className="gantt-bar-move-handle"
                  onPointerDown={(e) => { e.stopPropagation(); onBarMoveStart(e, initiative.id, null); }}
                  title="Drag to move" />
              )}
              <span className="gantt-bar-label" style={{ color: gc }}>
                <span className="gantt-bar-status-dot" style={{ background: (STATUS_STYLES[initiative.status] ?? STATUS_STYLES["Planned"]).dot }} title={initiative.status} />
                {initiative.mainBarLabel || initiative.name}
              </span>
              {!readOnly && !bar.clipRight && (
                <div className="gantt-resize-handle gantt-resize-right"
                  onPointerDown={(e) => { e.stopPropagation(); onResizeStart(e, initiative.id, "right"); }} />
              )}
            </div>
          );
        })()}

        {/* Sub-bars — all use the same goal colour as the primary bar */}
        {resolvedSubBars.map((sb) => {
          if (sb.startUnit == null || sb.endUnit == null) return null;
          const sbBar = clipSpan({ start: sb.startUnit, end: sb.endUnit });
          if (!sbBar) return null;
          // Lane assigned by greedy interval packing (overlapping bars only).
          const stackIdx = laneIdxByKey.get(sb.id) ?? 0;
          const style = { left: `${sbBar.leftPct}%`, width: `${sbBar.widthPct}%`, ...barStyle(showTall, stackIdx, sbBar) };
          return (
            <div key={sb.id} className="gantt-bar gantt-sub-bar" style={style}
              onClick={(e) => { e.stopPropagation(); onOpen(sb.id); }}>
              {!readOnly && !sbBar.clipLeft && (
                <div className="gantt-resize-handle gantt-resize-left"
                  onPointerDown={(e) => { e.stopPropagation(); onResizeStart(e, initiative.id, "left", sb.id); }} />
              )}
              {!readOnly && (
                <div className="gantt-bar-move-handle"
                  onPointerDown={(e) => { e.stopPropagation(); onBarMoveStart(e, initiative.id, sb.id); }}
                  title="Drag to move" />
              )}
              <span className="gantt-bar-label" style={{ color: gc }}>
                <span className="gantt-bar-status-dot" style={{ background: (STATUS_STYLES[(sb.status || initiative.status) as RoadmapStatus] ?? STATUS_STYLES["Planned"]).dot }} title={sb.status || initiative.status} />
                {sb.label}
              </span>
              {!readOnly && !sbBar.clipRight && (
                <div className="gantt-resize-handle gantt-resize-right"
                  onPointerDown={(e) => { e.stopPropagation(); onResizeStart(e, initiative.id, "right", sb.id); }} />
              )}
            </div>
          );
        })}

        {/* Draw ghost — shown during click-drag to create a new bar. It sits in the
            lane it doesn't overlap; only if that pushes the row past one lane do we
            switch to explicit lane positioning. */}
        {ghost && (
          <div className="gantt-bar gantt-draw-ghost" style={{
            left: `${ghost.leftPct}%`, width: `${ghost.widthPct}%`,
            ...(showTall
              ? { top: laneTopForIdx(ghostLane), bottom: "auto", height: ROW_H - BAR_INSET * 2 }
              : {}),
            pointerEvents: "none",
          }} />
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
  mobile?: boolean;
}

export default function ProductRoadmap({ initial, readOnly = false, published = false, mobile = false }: Props) {
  const [items, setItems] = useState<RoadmapInitiative[]>(initial);
  const [filterStatus, setFilterStatus] = useState<RoadmapStatus | "All">("All");
  const [filterGoal, setFilterGoal] = useState<string>("All");
  const [filterTeam, setFilterTeam] = useState<RoadmapTeam | "All">("All");
  const [modal, setModal] = useState<RoadmapInitiative | null | "new">(null);
  // Dedicated workstream modal: which sub-bar of which initiative to show.
  const [workstreamModal, setWorkstreamModal] = useState<{ initiativeId: string; subBarId: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [isPublished, setIsPublished] = useState(published);
  const [publishing, setPublishing] = useState(false);
  const [view, setView] = useState<ViewId>("3M");
  const [snapMenuOpen, setSnapMenuOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const snapshotRef = useRef<HTMLDivElement | null>(null);

  // ── Draw state — click-drag on an empty track to sketch a new bar ────────────
  const [drawingId, setDrawingId] = useState<string | null>(null);  // initiative id being drawn on
  const [drawGhosts, setDrawGhosts] = useState<Record<string, { start: number; end: number }>>({});
  const drawRef = useRef<{
    id: string;
    anchorUnit: number;
    trackLeft: number;
    trackWidth: number;
    moved: boolean;
  } | null>(null);
  // After a draw completes we show a small naming modal for the new sub-bar.
  const [pendingSubBar, setPendingSubBar] = useState<{
    initiativeId: string;
    startUnit: number;
    endUnit: number;
  } | null>(null);

  // ── Resize state ─────────────────────────────────────────────────────────────
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [resizingSubBarId, setResizingSubBarId] = useState<string | null>(null);
  const [resizePreview, setResizePreview] = useState<{ start: number; end: number } | null>(null);
  const resizeRef = useRef<{
    id: string;
    subBarId?: string;
    side: "left" | "right";
    fixedUnit: number;
    trackLeft: number;
    trackWidth: number;
  } | null>(null);

  // ── Move state ────────────────────────────────────────────────────────────────
  const [movingId, setMovingId] = useState<string | null>(null);
  const [movingSubBarId, setMovingSubBarId] = useState<string | null>(null);
  const [movePreview, setMovePreview] = useState<{ start: number; end: number } | null>(null);
  const moveRef = useRef<{
    id: string;
    subBarId: string | null;
    originalStart: number;
    originalEnd: number;
    grabUnit: number;   // the unit position where the pointer initially landed
    trackLeft: number;
    trackWidth: number;
  } | null>(null);
  const ganttTableRef = useRef<HTMLDivElement | null>(null);
  const currentQIdx = currentQuarterIdx();
  // The full timeline always exists; the view only changes column width (zoom).
  const months = useMemo(() => buildAllMonths(), []);

  // Measure the visible timeline width (container minus the frozen label column)
  // so each zoom shows exactly N months in the viewport regardless of screen size.
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

  // Column width = visible track width ÷ months-per-view. Falls back to a sensible
  // fixed width until the viewport has been measured.
  const colWidth = trackViewport > 0
    ? trackViewport / monthsPerView(view)
    : FALLBACK_COL_WIDTH[view];

  // Unit range = the whole roadmap, so bars are positioned against fixed dates.
  const windowStartUnit = 0;
  const windowEndUnit = TOTAL_MONTHS * UNITS_PER_MONTH;

  // On mount and whenever the zoom changes, scroll so the current quarter sits at
  // the left edge of the timeline (just past the frozen label column).
  useEffect(() => {
    const el = ganttTableRef.current;
    if (!el) return;
    el.scrollLeft = currentQIdx * 3 * colWidth;
  }, [colWidth, currentQIdx]);

  function flash(msg: string, err = false) {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Snapshot — capture the currently visible view of the roadmap ─────────────
  // Renders the full timeline once, then crops the result to the window the user
  // is actually looking at: the frozen label column plus the months currently
  // scrolled into view at the current zoom, across the full height of all rows.
  async function captureBlob(): Promise<Blob> {
    const el = snapshotRef.current;
    if (!el) throw new Error("Nothing to capture");

    const fullWidth = el.scrollWidth;
    const fullHeight = el.scrollHeight;
    const viewW = el.clientWidth;
    const scrollLeft = el.scrollLeft;
    // Width of the frozen label column (always shown, regardless of scroll).
    const labelCell = el.querySelector<HTMLElement>(".gantt-label-cell");
    const labelW = labelCell ? labelCell.getBoundingClientRect().width : 0;

    // Clamp output so very wide/tall snapshots don't crash memory-limited devices.
    const MAX_CANVAS_PX = 12000;
    const pixelRatio = Math.min(2, MAX_CANVAS_PX / Math.max(fullWidth, fullHeight, 1));

    // Render the entire timeline to an image first.
    const dataUrl = await toPng(el, {
      backgroundColor: "#ffffff",
      pixelRatio,
      cacheBust: true,
      width: fullWidth,
      height: fullHeight,
      style: { overflow: "visible", width: `${fullWidth}px`, height: `${fullHeight}px` },
      filter: (node) =>
        !(node instanceof HTMLElement &&
          (node.classList.contains("gantt-resize-handle") ||
           node.classList.contains("gantt-drag-grip"))),
    });

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });

    // Crop to: [label column] + [visible month window starting at scrollLeft].
    // The visible window excludes the label column width.
    const monthWinW = Math.max(0, viewW - labelW);
    const outCssW = labelW + monthWinW;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(outCssW * pixelRatio);
    canvas.height = Math.round(fullHeight * pixelRatio);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const pr = pixelRatio;
    // 1) Frozen label column from the far left of the full render.
    if (labelW > 0) {
      ctx.drawImage(
        img,
        0, 0, labelW * pr, fullHeight * pr,        // src: label column
        0, 0, labelW * pr, fullHeight * pr,        // dest
      );
    }
    // 2) The visible month window, sourced starting after the label + scrollLeft.
    if (monthWinW > 0) {
      const srcX = (labelW + scrollLeft) * pr;
      const srcW = Math.min(monthWinW * pr, img.width - srcX);
      if (srcW > 0) {
        ctx.drawImage(
          img,
          srcX, 0, srcW, fullHeight * pr,          // src: visible months
          labelW * pr, 0, srcW, fullHeight * pr,   // dest: right of the label
        );
      }
    }

    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Snapshot failed"))), "image/png")
    );
    return blob;
  }

  async function saveSnapshot() {
    setSnapMenuOpen(false);
    setCapturing(true);
    try {
      const blob = await captureBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `product-roadmap-${stamp}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      flash("Roadmap image saved ✓");
    } catch (e: unknown) {
      flash(e instanceof Error ? e.message : "Snapshot failed", true);
    } finally {
      setCapturing(false);
    }
  }

  async function copySnapshot() {
    setSnapMenuOpen(false);
    // Clipboard image write needs a secure context + API support.
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      flash("Copy not supported in this browser — use Save instead", true);
      return;
    }
    setCapturing(true);
    try {
      const blob = await captureBlob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      flash("Roadmap copied to clipboard ✓");
    } catch (e: unknown) {
      flash(e instanceof Error ? e.message : "Copy failed", true);
    } finally {
      setCapturing(false);
    }
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
  // Set true when a resize/move drag actually moved, so the trailing click on the
  // bar (pointerdown→…→pointerup→click) is suppressed and doesn't open the modal.
  const resizeMovedRef = useRef(false);
  const suppressBarClickRef = useRef(false);

  const onResizePointerDown = useCallback((
    e: React.PointerEvent,
    id: string,
    side: "left" | "right",
    subBarId?: string,
  ) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    if (!ganttTableRef.current) return;

    const item = items.find((x) => x.id === id);
    if (!item) return;

    // Resolve the span for either the primary bar or a sub-bar.
    let stored: { start: number; end: number } | null = null;
    if (subBarId) {
      const sb = (item.subBars || []).find((x) => x.id === subBarId);
      if (sb && sb.startUnit != null && sb.endUnit != null) {
        stored = { start: sb.startUnit, end: sb.endUnit };
      }
    } else {
      stored = spanUnitsOf(item);
    }
    if (!stored) return;

    const trackEl = ganttTableRef.current.querySelector<HTMLElement>(".gantt-track-overlay");
    if (!trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    const trackLeft = rect.left;
    const trackWidth = rect.width;

    // The edge that stays anchored while the other follows the pointer.
    const fixedUnit = side === "right" ? stored.start : stored.end;

    resizeRef.current = { id, subBarId, side, fixedUnit, trackLeft, trackWidth };
    resizeMovedRef.current = false;
    setResizingId(id);
    setResizingSubBarId(subBarId ?? null);
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
      setResizingSubBarId(null);
      setResizePreview(null);
      if (!ref) return;
      const { fixedUnit: fixed, side: s, id: rid, subBarId: sbid, trackLeft: tl, trackWidth: tw } = ref;
      const u = unitAt(ev.clientX, tl, tw);
      let finalStart = s === "right" ? fixed : u;
      let finalEnd   = s === "right" ? u : fixed;
      if (finalEnd - finalStart < 1) {
        if (s === "right") finalEnd = finalStart + 1;
        else finalStart = finalEnd - 1;
      }
      if (sbid) {
        onSubBarSpanChange(rid, sbid, finalStart, finalEnd);
      } else {
        const orig = spanUnitsOf(item!);
        if (!orig || finalStart !== orig.start || finalEnd !== orig.end) {
          onSpanChange(rid, finalStart, finalEnd);
        }
      }
      // Interacting with a handle should never open the modal, even on a no-move click.
      suppressBarClickRef.current = true;
      setTimeout(() => { resizeMovedRef.current = false; suppressBarClickRef.current = false; }, 0);
    }

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }, [items, readOnly, windowStartUnit, windowEndUnit]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Move pointer handler ──────────────────────────────────────────────────────
  const onBarMoveStart = useCallback((
    e: React.PointerEvent,
    id: string,
    subBarId: string | null,
  ) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    if (!ganttTableRef.current) return;

    const item = items.find((x) => x.id === id);
    if (!item) return;

    let originalStart: number, originalEnd: number;
    if (subBarId) {
      const sb = (item.subBars || []).find((x) => x.id === subBarId);
      if (!sb || sb.startUnit == null || sb.endUnit == null) return;
      originalStart = sb.startUnit; originalEnd = sb.endUnit;
    } else {
      const stored = spanUnitsOf(item);
      if (!stored) return;
      originalStart = stored.start; originalEnd = stored.end;
    }

    const trackEl = ganttTableRef.current.querySelector<HTMLElement>(".gantt-track-overlay");
    if (!trackEl) return;
    const rect = trackEl.getBoundingClientRect();

    function unitAt(clientX: number): number {
      const frac = (clientX - rect.left) / rect.width;
      const raw = windowStartUnit + frac * (windowEndUnit - windowStartUnit);
      return Math.max(windowStartUnit, Math.min(windowEndUnit, Math.round(raw)));
    }

    const grabUnit = unitAt(e.clientX);
    moveRef.current = { id, subBarId, originalStart, originalEnd, grabUnit, trackLeft: rect.left, trackWidth: rect.width };
    setMovingId(id);
    setMovingSubBarId(subBarId);
    setMovePreview({ start: originalStart, end: originalEnd });

    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }

    let moved = false;

    function onPointerMove(ev: PointerEvent) {
      if (!moveRef.current) return;
      const { originalStart: os, originalEnd: oe, grabUnit: gu } = moveRef.current;
      const u = unitAt(ev.clientX);
      const delta = u - gu;
      const dur = oe - os;
      const newStart = Math.max(windowStartUnit, Math.min(windowEndUnit - dur, os + delta));
      if (newStart !== os) moved = true;
      setMovePreview({ start: newStart, end: newStart + dur });
    }

    function onPointerUp(ev: PointerEvent) {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      const ref = moveRef.current;
      moveRef.current = null;
      setMovingId(null);
      setMovingSubBarId(null);
      setMovePreview(null);
      if (!ref) return;
      const { originalStart: os, originalEnd: oe, grabUnit: gu, id: rid, subBarId: sbid } = ref;
      const u = unitAt(ev.clientX);
      const delta = u - gu;
      const dur = oe - os;
      const finalStart = Math.max(windowStartUnit, Math.min(windowEndUnit - dur, os + delta));
      const finalEnd = finalStart + dur;
      if (finalStart === os || !moved) return; // a plain click → let the bar's onClick open the modal
      // Only suppress the trailing click when the bar actually moved.
      suppressBarClickRef.current = true;
      setTimeout(() => { suppressBarClickRef.current = false; }, 0);
      if (sbid) {
        onSubBarSpanChange(rid, sbid, finalStart, finalEnd);
      } else {
        onSpanChange(rid, finalStart, finalEnd);
      }
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

  async function onSubBarSpanChange(id: string, subBarId: string, startUnit: number, endUnit: number) {
    setItems((prev) => prev.map((x) => {
      if (x.id !== id) return x;
      const subBars = (x.subBars || []).map((sb) =>
        sb.id === subBarId ? { ...sb, startUnit, endUnit } : sb
      );
      return { ...x, subBars };
    }));
    const item = items.find((x) => x.id === id);
    if (!item) return;
    const subBars = (item.subBars || []).map((sb) =>
      sb.id === subBarId ? { ...sb, startUnit, endUnit } : sb
    );
    try {
      const res = await fetch(`/api/roadmap-initiatives/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subBars }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Save failed");
      setItems((prev) => prev.map((x) => (x.id === id ? data.initiative : x)));
    } catch (e: unknown) {
      flash(e instanceof Error ? e.message : "Update failed", true);
    }
  }

  // ── Draw gesture ─────────────────────────────────────────────────────────────
  // pointerdown on the track: if the pointer lands on an existing bar, let that
  // bar's own onClick handle it. Otherwise start a draw gesture.
  const onTrackPointerDown = useCallback((e: React.PointerEvent, id: string) => {
    if (readOnly) return;
    // Only left button, and only when the target is the track/cell background
    // (not a bar element — bars have their own onClick).
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest(".gantt-bar") || target.closest(".gantt-resize-handle")) return;

    e.preventDefault();
    e.stopPropagation();

    const trackEl = (e.currentTarget as HTMLElement);
    const rect = trackEl.getBoundingClientRect();

    function unitAt(clientX: number): number {
      const frac = (clientX - rect.left) / rect.width;
      const raw = windowStartUnit + frac * (windowEndUnit - windowStartUnit);
      return Math.max(windowStartUnit, Math.min(windowEndUnit, Math.round(raw)));
    }

    const anchorUnit = unitAt(e.clientX);
    drawRef.current = { id, anchorUnit, trackLeft: rect.left, trackWidth: rect.width, moved: false };
    setDrawingId(id);
    setDrawGhosts((prev) => ({ ...prev, [id]: { start: anchorUnit, end: anchorUnit + 1 } }));

    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }

    function onPointerMove(ev: PointerEvent) {
      if (!drawRef.current || drawRef.current.id !== id) return;
      const u = unitAt(ev.clientX);
      const start = Math.min(drawRef.current.anchorUnit, u);
      const end   = Math.max(drawRef.current.anchorUnit, u);
      if (end - start >= 1) drawRef.current.moved = true;
      setDrawGhosts((prev) => ({ ...prev, [id]: { start, end: Math.max(end, start + 1) } }));
    }

    function onPointerUp(ev: PointerEvent) {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      const ref = drawRef.current;
      drawRef.current = null;
      setDrawingId(null);
      setDrawGhosts((prev) => { const n = { ...prev }; delete n[id]; return n; });
      if (!ref) return;

      const u = unitAt(ev.clientX);
      const start = Math.min(ref.anchorUnit, u);
      const end   = Math.max(ref.anchorUnit, u);
      const finalEnd = Math.max(end, start + 1);

      if (!ref.moved) {
        // Short tap — open the initiative detail modal if it has any bar, else ignore.
        const item = items.find((x) => x.id === id);
        if (item) {
          const hasPrimary = spanUnitsOf(item) != null;
          const hasSub = (item.subBars || []).some((sb) => sb.startUnit != null);
          if (hasPrimary || hasSub) setModal(item);
        }
        return;
      }

      // Dragged — check if the initiative already has a primary bar.
      const item = items.find((x) => x.id === id);
      const hasPrimary = item ? spanUnitsOf(item) != null : false;

      if (!hasPrimary) {
        // Place the primary bar directly (no name needed, it inherits the initiative name).
        onSpanChange(id, start, finalEnd);
      } else {
        // Queue up a new sub-bar pending a name.
        setPendingSubBar({ initiativeId: id, startUnit: start, endUnit: finalEnd });
      }
    }

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }, [readOnly, items, windowStartUnit, windowEndUnit]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (filterTeam !== "All" && i.team !== filterTeam) return false;
    return true;
  });

  const summaries: string[] = [];
  const bySummary: Record<string, RoadmapInitiative[]> = {};
  for (const item of filtered) {
    const s = item.summary || "Other";
    if (!bySummary[s]) { summaries.push(s); bySummary[s] = []; }
    bySummary[s].push(item);
  }
  // Order swimlanes by the strategy sub-goal they serve (1.1, then 1.2, …). A
  // group's key is the earliest (lowest) sub-goal across its initiatives; groups
  // with no goal fall to the bottom. Ties break alphabetically by name.
  const groupGoalKey = (summary: string): number =>
    Math.min(
      ...bySummary[summary].map((i) => subGoalSortKey(i.strategyGoal)),
      Number.POSITIVE_INFINITY,
    );
  summaries.sort((a, b) => {
    const ka = groupGoalKey(a);
    const kb = groupGoalKey(b);
    if (ka !== kb) return ka - kb;
    return a.localeCompare(b);
  });

  const newInitiative: RoadmapInitiative = {
    id: "__new__", summary: "", name: "", strategyGoal: "", status: "Planned",
    description: "", owner: "", team: "", quarter: "", endQuarter: "", startUnit: null, endUnit: null,
    mainBarLabel: "", mainBarDescription: "", mainBarNorthStarMetric: "", mainBarSuccessMetrics: "",
    mainBarComments: [], subBars: [], northStarMetric: "", successMetrics: "",
    notes: "", comments: [], order: 999,
  };
  const modalInitiative = modal === "new" ? newInitiative : modal;

  // Viewers only see the roadmap once it's been published by an editor.
  const hideFromViewer = readOnly && !isPublished;

  return (
    <div className="gantt-root" style={{ "--gantt-col-w": `${colWidth}px` } as React.CSSProperties}>
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

          {/* Snapshot — copy to clipboard or save as PNG (desktop only; the
              full-timeline raster is too large/unreliable on phones) */}
          {!hideFromViewer && summaries.length > 0 && !mobile && (
            <div className="rm-snap-wrap">
              <button
                className="btn btn-soft"
                onClick={() => setSnapMenuOpen((o) => !o)}
                disabled={capturing}
                title="Capture an image of the roadmap"
                aria-haspopup="menu"
                aria-expanded={snapMenuOpen}
              >
                {capturing ? "Capturing…" : "📷 Snapshot"}
              </button>
              {snapMenuOpen && (
                <>
                  <div className="rm-snap-backdrop" onClick={() => setSnapMenuOpen(false)} aria-hidden />
                  <div className="rm-snap-menu" role="menu">
                    <button className="rm-snap-item" role="menuitem" onClick={copySnapshot}>
                      Copy to clipboard
                    </button>
                    <button className="rm-snap-item" role="menuitem" onClick={saveSnapshot}>
                      Save as PNG
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

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
        <div className="filter-group">
          <span className="filter-label">Team</span>
          <select className="select" value={filterTeam} onChange={(e) => setFilterTeam(e.target.value as RoadmapTeam | "All")}>
            <option value="All">All teams</option>
            {ROADMAP_TEAM_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <span className="rm-count">{filtered.length} initiative{filtered.length !== 1 ? "s" : ""}</span>

        {/* Timeline zoom switcher — desktop only (mobile uses a list) */}
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
          <span className="gantt-hint">Click cells to place · drag ▐ handle to resize · drag ⠿ to reorder</span>
        )}
      </div>

      {/* Gantt table */}
      {summaries.length === 0 ? (
        <div className="rm-empty">
          No initiatives yet.{!readOnly && " Click \"+ Add initiative\" to get started."}
        </div>
      ) : mobile ? (
        /* ── Mobile: grouped initiative list (tap a card to view/edit) ── */
        <div className="rml-list">
          {summaries.map((summary) => {
            const groupItems = bySummary[summary];
            const primaryGoal = groupItems.find((i) => i.strategyGoal)?.strategyGoal as StrategyGoal | undefined;
            const gn = primaryGoal ? SUBGOAL_TO_GOAL[primaryGoal] : undefined;
            const meta = gn ? GOAL_META[gn] : null;
            return (
              <div key={summary} className="rml-group">
                <div
                  className="rml-group-header"
                  style={{ background: meta ? meta.bg : "#f8fafc", borderLeft: `4px solid ${meta ? meta.color : "#cbd5e1"}` }}
                >
                  <span className="rml-group-name">{summary}</span>
                  {gn && meta && (
                    <span className="rml-goal-badge" style={{ background: meta.light, color: meta.color }}>Goal {gn}</span>
                  )}
                </div>
                {groupItems.map((item) => {
                  const ss = STATUS_STYLES[item.status] ?? STATUS_STYLES["Planned"];
                  const igc = goalColor(item);
                  const range = item.quarter
                    ? (item.endQuarter && item.endQuarter !== item.quarter
                        ? `${item.quarter} → ${item.endQuarter}`
                        : item.quarter)
                    : "No timeframe set";
                  return (
                    <button
                      key={item.id}
                      className="rml-card"
                      style={{ borderLeftColor: igc }}
                      onClick={() => setModal(item)}
                    >
                      <div className="rml-card-top">
                        <span className="rml-card-name">{item.name}</span>
                        <span className="rml-status" style={{ background: ss.bg, color: ss.fg, borderColor: ss.border }}>
                          <span className="rml-status-dot" style={{ background: ss.dot }} />
                          {item.status}
                        </span>
                      </div>
                      <div className="rml-card-meta">
                        <span className="rml-chip rml-chip-time">{range}</span>
                        {item.owner && <span className="rml-chip rml-chip-owner">{item.owner}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div
            className={`gantt-table${readOnly ? " gantt-readonly" : ""}`}
            ref={(el) => { ganttTableRef.current = el; snapshotRef.current = el; }}
          >
            {/* Quarter section header — labels stay pinned to the left edge of their
                quarter block and scroll-reveal the next quarter as you scroll. */}
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
              <div className="gantt-label-cell gantt-header-label">Initiative</div>
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
                      {horizon && (
                        <span className="gantt-horizon-label">{horizon}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Groups */}
            {summaries.map((summary) => {
              const groupItems = bySummary[summary];
              const primaryGoal = groupItems.find((i) => i.strategyGoal)?.strategyGoal as StrategyGoal | undefined;
              const gn = primaryGoal ? SUBGOAL_TO_GOAL[primaryGoal] : undefined;
              const meta = gn ? GOAL_META[gn] : null;
              // Distinct teams represented in this group, shown as chips on the header.
              const groupTeams = Array.from(new Set(groupItems.map((i) => i.team).filter(Boolean)));

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
                      {groupTeams.map((t) => (
                        <span key={t} className={`gantt-team-chip team-${t.toLowerCase()}`}>{t}</span>
                      ))}
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
                                  onOpen={(subBarId) => {
                                    if (suppressBarClickRef.current) return;
                                    if (subBarId) setWorkstreamModal({ initiativeId: item.id, subBarId });
                                    else setModal(item);
                                  }}
                                  onSpanChange={onSpanChange}
                                  onSubBarSpanChange={onSubBarSpanChange}
                                  onTrackPointerDown={onTrackPointerDown}
                                  onBarMoveStart={onBarMoveStart}
                                  readOnly={readOnly}
                                  resizePreview={resizingId === item.id ? resizePreview : null}
                                  resizingSubBarId={resizingId === item.id ? resizingSubBarId : null}
                                  movePreview={movingId === item.id ? movePreview : null}
                                  movingSubBarId={movingId === item.id ? movingSubBarId : null}
                                  onResizeStart={onResizePointerDown}
                                  drawGhost={drawingId === item.id ? drawGhosts[item.id] ?? null : null}
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

      {workstreamModal && (() => {
        const ws = items.find((x) => x.id === workstreamModal.initiativeId);
        if (!ws) return null;
        const isMain = workstreamModal.subBarId === "__main__";
        // The initiative's own bar is shown through the same modal as a synthesised
        // workstream backed by the initiative's own fields.
        const sb: RoadmapSubBar | undefined = isMain
          ? {
              id: "__main__",
              label: ws.mainBarLabel || ws.name,
              startUnit: ws.startUnit,
              endUnit: ws.endUnit,
              description: ws.mainBarDescription,
              northStarMetric: ws.mainBarNorthStarMetric,
              successMetrics: ws.mainBarSuccessMetrics,
              strategyGoal: ws.strategyGoal,
              status: ws.status,
              comments: ws.mainBarComments,
            }
          : ws.subBars?.find((s) => s.id === workstreamModal.subBarId);
        if (!sb) return null;
        return (
          <WorkstreamModal
            initiative={ws}
            subBar={sb}
            isMain={isMain}
            readOnly={readOnly}
            onClose={() => setWorkstreamModal(null)}
            onSaved={(i) => { onSaved(i); }}
            onOpenInitiative={() => { setWorkstreamModal(null); setModal(ws); }}
          />
        );
      })()}

      {pendingSubBar && (
        <SubBarNameModal
          onConfirm={(label) => {
            const { initiativeId, startUnit, endUnit } = pendingSubBar;
            setPendingSubBar(null);
            const newBar: RoadmapSubBar = {
              id: `sb-${Date.now()}`,
              label,
              startUnit,
              endUnit,
            };
            const item = items.find((x) => x.id === initiativeId);
            if (!item) return;
            const subBars = [...(item.subBars || []), newBar];
            setItems((prev) => prev.map((x) => x.id === initiativeId ? { ...x, subBars } : x));
            fetch(`/api/roadmap-initiatives/${initiativeId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ subBars }),
            })
              .then((r) => r.json())
              .then((d) => {
                if (d.ok) setItems((prev) => prev.map((x) => x.id === initiativeId ? d.initiative : x));
                else flash(d.error || "Save failed", true);
              })
              .catch(() => flash("Save failed", true));
          }}
          onCancel={() => setPendingSubBar(null)}
        />
      )}

      {toast && <div className={`toast ${toast.err ? "err" : ""}`}>{toast.msg}</div>}
    </div>
  );
}
