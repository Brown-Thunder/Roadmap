"use client";

import { useState, useEffect } from "react";
import { RoadmapInitiative, STRATEGY_GOAL_LABELS, StrategyGoal, ROADMAP_STATUS_OPTIONS, RoadmapStatus } from "@/lib/roadmap-initiatives";

// Timeline fractions: 7-quarter span, Q2 '26 = 0, Q1 '28 = 1
const Q = [0, 1/7, 2/7, 3/7, 4/7, 5/7, 6/7, 1] as const;

interface Segment { start: number; end: number; shade: "heavy" | "ramp" | "sustain" }
interface SubGoal { id: string; label: string; segments: Segment[] }
interface Goal {
  id: string; label: string; shortLabel: string;
  color: string; bg: string; border: string;
  revenue: string; revenueNote?: string;
  subGoals: SubGoal[];
}

const GOALS: Goal[] = [
  {
    id: "1",
    label: "GOAL 1 · Grow our Tier 1 city visibility to match the UK",
    shortLabel: "Goal 1 · UK visibility",
    color: "#0d9488", bg: "#f0fdfa", border: "#99f6e4",
    revenue: "£1.8–2.5M",
    subGoals: [
      { id: "1.1", label: "1.1  Increase CVR of Tier 1 cities to UK levels",
        segments: [{ start: Q[0], end: Q[3], shade: "heavy" }, { start: Q[3], end: Q[7], shade: "sustain" }] },
      { id: "1.2", label: "1.2  Add 30 stashpoints capable of +£10k/yr each",
        segments: [{ start: Q[0], end: Q[3], shade: "heavy" }, { start: Q[3], end: Q[7], shade: "sustain" }] },
      { id: "1.3", label: "1.3  Rank Tier 1 city + area pages organically above position 3",
        segments: [{ start: Q[0], end: Q[3], shade: "heavy" }, { start: Q[3], end: Q[7], shade: "sustain" }] },
    ],
  },
  {
    id: "2",
    label: "GOAL 2 · Bring luggage storage to every global travel hub",
    shortLabel: "Goal 2 · Global hubs",
    color: "#ea580c", bg: "#fff7ed", border: "#fed7aa",
    revenue: "£0.4–0.7M",
    revenueNote: "direct · more in 2028+",
    subGoals: [
      { id: "2.1", label: "2.1  Systematically capture the latent demand we can already serve",
        segments: [{ start: Q[2], end: Q[4], shade: "ramp" }, { start: Q[4], end: Q[7], shade: "sustain" }] },
      { id: "2.2", label: "2.2  Add 10k stashpoints outside Tier 1",
        segments: [{ start: Q[3], end: Q[4], shade: "ramp" }, { start: Q[4], end: Q[7], shade: "sustain" }] },
      { id: "2.3", label: "2.3  Stay #1 for quality with the same-sized team",
        segments: [{ start: Q[3], end: Q[4], shade: "ramp" }, { start: Q[4], end: Q[7], shade: "sustain" }] },
    ],
  },
  {
    id: "3",
    label: "GOAL 3 · Build depth & defensibility in the best locations",
    shortLabel: "Goal 3 · Depth & defensibility",
    color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe",
    revenue: "£0.2–0.4M + moat",
    revenueNote: "indicative",
    subGoals: [
      { id: "3.1", label: "3.1  Increase capacity in areas where we max out",
        segments: [{ start: Q[6], end: Q[7], shade: "sustain" }] },
      { id: "3.2", label: "3.2  Own supply where we're confident in utilisation",
        segments: [{ start: Q[6], end: Q[7], shade: "sustain" }] },
      { id: "3.3", label: "3.3  Position our brand in high-footfall zones",
        segments: [{ start: Q[5], end: Q[7], shade: "sustain" }] },
    ],
  },
];

const QUARTERS = [
  { label: "Jun '26", frac: Q[0], note: "start" },
  { label: "Q3 '26",  frac: Q[1] },
  { label: "Q4 '26",  frac: Q[2] },
  { label: "Q1 '27",  frac: Q[3], milestone: true },
  { label: "Q2 '27",  frac: Q[4] },
  { label: "Q3 '27",  frac: Q[5] },
  { label: "Q4 '27",  frac: Q[6] },
  { label: "Q1 '28",  frac: Q[7], milestone: true },
];

const TROUGH_FRACS = [Q[3], Q[7]];
const MILESTONE_LABELS: Record<number, string> = { [Q[3]]: "£5.0M", [Q[7]]: "£8.0M" };
const SHADE_ALPHA: Record<string, number> = { heavy: 1, ramp: 0.5, sustain: 0.2 };

const STATUS_STYLES: Record<RoadmapStatus, { bg: string; fg: string; border: string }> = {
  "Planned":     { bg: "#f1f5f9", fg: "#475569",  border: "#e2e8f0" },
  "In Progress": { bg: "#eff6ff", fg: "#1d4ed8",  border: "#bfdbfe" },
  "Done":        { bg: "#f0fdf4", fg: "#15803d",  border: "#bbf7d0" },
  "On Hold":     { bg: "#fef9c3", fg: "#854d0e",  border: "#fde68a" },
};

function pct(f: number) { return `${(f * 100).toFixed(3)}%`; }

// ── Drawer ────────────────────────────────────────────────────────────────────

type DrawerScope =
  | { type: "goal"; goalId: string }
  | { type: "subgoal"; subGoalId: string };

interface DrawerProps {
  scope: DrawerScope;
  roadmapInitiatives: RoadmapInitiative[];
  onClose: () => void;
}

function InitiativeCard({ item, accentColor }: { item: RoadmapInitiative; accentColor: string }) {
  const s = STATUS_STYLES[item.status] || STATUS_STYLES["Planned"];
  return (
    <div className="ss-drawer-card" style={{ borderLeftColor: accentColor }}>
      <div className="ss-drawer-card-top">
        <span className="ss-drawer-card-name">{item.name}</span>
        <span className="ss-drawer-card-status" style={{ background: s.bg, color: s.fg, borderColor: s.border }}>
          {item.status}
        </span>
      </div>
      <div className="ss-drawer-card-meta">
        {item.summary && <span className="ss-drawer-chip ss-drawer-chip-summary">{item.summary}</span>}
        {item.quarter && <span className="ss-drawer-chip ss-drawer-chip-quarter">{item.quarter}</span>}
        {item.owner && <span className="ss-drawer-chip ss-drawer-chip-owner">{item.owner}</span>}
      </div>
      {item.description && <p className="ss-drawer-card-desc">{item.description}</p>}
    </div>
  );
}

function GoalDrawer({ scope, roadmapInitiatives, onClose }: DrawerProps) {
  // Trap focus / close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  let drawerTitle = "";
  let drawerSubtitle = "";
  let accentColor = "#64748b";
  let filteredBySubGoal: { subGoalId: string; subGoalLabel: string; items: RoadmapInitiative[] }[] = [];

  if (scope.type === "goal") {
    const goal = GOALS.find((g) => g.id === scope.goalId)!;
    accentColor = goal.color;
    drawerTitle = goal.shortLabel;
    drawerSubtitle = "All roadmap initiatives linked to this goal";

    // Group by sub-goal
    for (const sg of goal.subGoals) {
      const items = roadmapInitiatives.filter((r) => r.strategyGoal === sg.id);
      filteredBySubGoal.push({ subGoalId: sg.id, subGoalLabel: sg.label, items });
    }
  } else {
    // Single sub-goal
    const sgId = scope.subGoalId;
    const goal = GOALS.find((g) => g.subGoals.some((s) => s.id === sgId))!;
    const sg = goal.subGoals.find((s) => s.id === sgId)!;
    accentColor = goal.color;
    drawerTitle = sg.label.trim();
    drawerSubtitle = STRATEGY_GOAL_LABELS[sgId as StrategyGoal] || "";
    const items = roadmapInitiatives.filter((r) => r.strategyGoal === sgId);
    filteredBySubGoal = [{ subGoalId: sgId, subGoalLabel: sg.label, items }];
  }

  const totalCount = filteredBySubGoal.reduce((n, g) => n + g.items.length, 0);

  return (
    <>
      {/* Backdrop */}
      <div className="ss-drawer-backdrop" onClick={onClose} aria-hidden />

      {/* Panel */}
      <div className="ss-drawer" role="dialog" aria-modal="true" aria-label={drawerTitle}>
        {/* Header */}
        <div className="ss-drawer-header" style={{ borderBottomColor: accentColor + "40" }}>
          <div className="ss-drawer-header-stripe" style={{ background: accentColor }} />
          <div className="ss-drawer-header-text">
            <h2 className="ss-drawer-title" style={{ color: accentColor }}>{drawerTitle}</h2>
            <p className="ss-drawer-subtitle">{drawerSubtitle}</p>
          </div>
          <button className="ss-drawer-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Count badge */}
        <div className="ss-drawer-count-row">
          <span className="ss-drawer-count" style={{ background: accentColor + "18", color: accentColor }}>
            {totalCount} initiative{totalCount !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Content */}
        <div className="ss-drawer-body">
          {totalCount === 0 ? (
            <div className="ss-drawer-empty">
              No roadmap initiatives are linked to this goal yet.
              <br />Add them from the <strong>Product Roadmap</strong> tab.
            </div>
          ) : (
            filteredBySubGoal.map(({ subGoalId, subGoalLabel, items }) => {
              if (scope.type === "goal" && items.length === 0) return null;
              return (
                <div key={subGoalId} className="ss-drawer-group">
                  {scope.type === "goal" && (
                    <div className="ss-drawer-group-header">
                      <span className="ss-drawer-group-dot" style={{ background: accentColor }} />
                      <span className="ss-drawer-group-label">{subGoalLabel.trim()}</span>
                      <span className="ss-drawer-group-count">{items.length}</span>
                    </div>
                  )}
                  {items.length === 0 ? (
                    <p className="ss-drawer-none">No initiatives linked yet.</p>
                  ) : (
                    items.map((item) => (
                      <InitiativeCard key={item.id} item={item} accentColor={accentColor} />
                    ))
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

// ── Bar row ───────────────────────────────────────────────────────────────────

function BarRow({
  sg, color, bg, initiativeCount, onOpen,
}: {
  sg: SubGoal; color: string; bg: string;
  initiativeCount: number;
  onOpen: () => void;
}) {
  return (
    <button
      className="ss-row ss-row-btn"
      onClick={onOpen}
      title={`View roadmap initiatives for ${sg.label.trim()}`}
      aria-label={`${sg.label.trim()} — ${initiativeCount} initiative${initiativeCount !== 1 ? "s" : ""}`}
    >
      <div className="ss-row-label">
        <span className="ss-row-label-text">{sg.label}</span>
        {initiativeCount > 0 && (
          <span className="ss-row-badge" style={{ background: color + "20", color }}>
            {initiativeCount}
          </span>
        )}
      </div>
      <div className="ss-row-track" style={{ background: bg }}>
        {QUARTERS.map((q) => (
          <div
            key={q.frac}
            className={`ss-gridline${q.milestone ? " ss-gridline-milestone" : ""}`}
            style={{ left: pct(q.frac) }}
          />
        ))}
        {sg.segments.map((seg, i) => (
          <div
            key={i}
            className="ss-seg"
            style={{
              left: pct(seg.start),
              width: pct(seg.end - seg.start),
              background: color,
              opacity: SHADE_ALPHA[seg.shade],
            }}
          />
        ))}
        <div className="ss-row-hover-hint">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          View initiatives
        </div>
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  roadmapInitiatives: RoadmapInitiative[];
  onNavigateToRoadmap?: () => void;
}

export default function StasherStrategy({ roadmapInitiatives, onNavigateToRoadmap }: Props) {
  const [drawer, setDrawer] = useState<DrawerScope | null>(null);

  function countFor(id: string) {
    return roadmapInitiatives.filter((r) => r.strategyGoal === id).length;
  }
  function countForGoal(goalId: string) {
    return roadmapInitiatives.filter((r) => (r.strategyGoal || "").startsWith(goalId + ".")).length;
  }

  return (
    <div className="ss-root">

      {/* ── Page header ──────────────────────────────────── */}
      <div className="ss-page-header">
        <div>
          <h1 className="ss-title">Stasher Strategy</h1>
          <p className="ss-subtitle">
            Three goals for the next 18 months, framed as outcomes — the results we're aiming for, not the how.
            Any team can drive any objective. Bar shade shows effort over time; click any row to see linked roadmap initiatives.
          </p>
        </div>
        <div className="ss-kpi-card">
          <div className="ss-kpi-row">
            <div className="ss-kpi-block">
              <span className="ss-kpi-value">£5.0M</span>
              <span className="ss-kpi-sub">end-2026</span>
            </div>
            <svg width="20" height="14" viewBox="0 0 20 14" fill="none" aria-hidden="true" style={{ flexShrink: 0, alignSelf: "center" }}>
              <path d="M1 7h18M13 1l6 6-6 6" stroke="rgba(255,255,255,0.45)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div className="ss-kpi-block">
              <span className="ss-kpi-value ss-kpi-green">£8.0M</span>
              <span className="ss-kpi-sub">end-2027</span>
            </div>
          </div>
          <div className="ss-kpi-note">
            <span className="ss-kpi-dot" />
            Net revenue · profitable from Q2 2027
          </div>
        </div>
      </div>

      {/* ── Chart panel ──────────────────────────────────── */}
      <div className="ss-panel">

        {/* Quarter header */}
        <div className="ss-header-row">
          <div className="ss-row-label ss-header-spacer">Timeline</div>
          <div className="ss-row-track ss-quarter-header">
            {QUARTERS.map((q) => (
              <div
                key={q.frac}
                className={`ss-q-marker${q.milestone ? " ss-q-milestone" : ""}`}
                style={{ left: pct(q.frac) }}
              >
                <div className="ss-q-tick" />
                <div className="ss-q-label">
                  {q.label}
                  {q.note && <span className="ss-q-note"> ▸ {q.note}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Milestone pin row */}
        <div className="ss-pin-row">
          <div className="ss-row-label" />
          <div className="ss-row-track ss-pin-track">
            {TROUGH_FRACS.map((frac) => (
              <div key={frac} className="ss-pin-group" style={{ left: pct(frac) }}>
                <div className="ss-pin-rev">{MILESTONE_LABELS[frac]}</div>
                <div className="ss-pin-trough">◆ Cash trough</div>
              </div>
            ))}
          </div>
        </div>

        {/* Goals */}
        {GOALS.map((goal, gi) => {
          const goalCount = countForGoal(goal.id);
          return (
            <div key={goal.id} className="ss-goal-block">

              {/* Goal header — clickable */}
              <button
                className="ss-goal-header-row ss-goal-header-btn"
                onClick={() => setDrawer({ type: "goal", goalId: goal.id })}
                title={`View all roadmap initiatives for ${goal.shortLabel}`}
              >
                <div className="ss-row-label ss-goal-label-cell">
                  <span className="ss-goal-stripe" style={{ background: goal.color }} />
                  <span className="ss-goal-heading" style={{ color: goal.color }}>{goal.label}</span>
                </div>
                <div className="ss-row-track ss-goal-track" style={{ background: goal.bg + "80" }}>
                  <div className="ss-goal-track-inner">
                    <div className="ss-goal-rev" style={{ color: goal.color }}>
                      {goal.revenue}
                      {goal.revenueNote && <span className="ss-goal-rev-note"> · {goal.revenueNote}</span>}
                    </div>
                    <div className="ss-goal-cta">
                      {goalCount > 0 && (
                        <span className="ss-goal-count-badge" style={{ background: goal.color + "20", color: goal.color }}>
                          {goalCount} initiative{goalCount !== 1 ? "s" : ""}
                        </span>
                      )}
                      <span className="ss-goal-view-btn" style={{ color: goal.color }}>
                        View all
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                      </span>
                    </div>
                  </div>
                </div>
              </button>

              {/* Sub-goal rows — each clickable */}
              {goal.subGoals.map((sg) => (
                <BarRow
                  key={sg.id}
                  sg={sg}
                  color={goal.color}
                  bg={goal.bg}
                  initiativeCount={countFor(sg.id)}
                  onOpen={() => setDrawer({ type: "subgoal", subGoalId: sg.id })}
                />
              ))}

              {gi < GOALS.length - 1 && <div className="ss-goal-divider" />}
            </div>
          );
        })}
      </div>

      {/* ── Legend ───────────────────────────────────────── */}
      <div className="ss-legend">
        <span className="ss-legend-head">Effort:</span>
        {(["Heavy", "Ramping", "Sustain · low"] as const).map((label, i) => (
          <div key={label} className="ss-legend-item">
            <span className="ss-legend-swatch" style={{ background: "#334155", opacity: [1, 0.5, 0.2][i] }} />
            {label}
          </div>
        ))}
        <span className="ss-legend-sep" />
        <div className="ss-legend-item">
          <span className="ss-legend-dashed" style={{ borderColor: "#ef4444" }} />
          Cash trough
        </div>
        <div className="ss-legend-item">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden style={{ color: "#64748b" }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          Click any row to see linked initiatives
        </div>
      </div>

      {/* ── Drawer ───────────────────────────────────────── */}
      {drawer && (
        <GoalDrawer
          scope={drawer}
          roadmapInitiatives={roadmapInitiatives}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  );
}
