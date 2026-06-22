"use client";

import { useState, useEffect } from "react";
import {
  Initiative,
  Comment,
  TEAM_OPTIONS,
  AREA_OPTIONS,
  STATUS_OPTIONS,
  TIMEFRAMES,
  TSHIRT_OPTIONS,
  PRIORITY_OPTIONS,
  LAYER_OPTIONS,
  DEFAULT_TAGS,
  areaHasPods,
  podsForArea,
  AREA_DEFAULT_POD,
  SPANS_PODS_AREAS,
  assignCardCodes,
  DEP_TYPE_LABELS,
  DEP_TYPE_OPTIONS,
  DepType,
  DepLink,
} from "@/lib/types";
import type { GithubIssue } from "@/lib/github";
import AssigneePicker from "./AssigneePicker";

type Draft = Partial<Initiative>;

const EMPTY: Draft = {
  name: "",
  description: "",
  team: "Host/Platform",
  area: "Lockers",
  pod: "3rd Party Lockers",
  spansPods: false,
  timeframe: "This Week",
  status: "To Do",
  primaryAssignees: "",
  supportAssignees: "",
  link: "",
  notes: "",
  tShirtSize: "",
  durationWeeks: 1,
  tags: [],
  comments: [],
  layers: [],
  completedDate: "",
  priority: "",
  blockedBy: [],
  depLinks: [],
};

// Local YYYY-MM-DD for "today" without UTC drift.
function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// "2026-06-08" -> "Mon 8 Jun 2026" for the Week Plan 2 section headers.
function formatWeekPlanDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

const DEP_CHIP_STYLE: Record<DepType, { bg: string; color: string; border: string }> = {
  "blocked-by": { bg: "#fef2f2", color: "#991b1b", border: "#fecaca" },
  "waiting-on": { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
  "related-to": { bg: "#f0f9ff", color: "#075985", border: "#bae6fd" },
};

const TAG_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  priority:       { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" },
  delayed:        { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
  blocked:        { bg: "#fdf2f8", color: "#a21caf", border: "#f5d0fe" },
  "needs review": { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  "quick win":    { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
  "tech debt":    { bg: "#f8fafc", color: "#475569", border: "#cbd5e1" },
  discovery:      { bg: "#fafaf9", color: "#57534e", border: "#d6d3d1" },
  dependencies:   { bg: "#fefce8", color: "#a16207", border: "#fde68a" },
};

const STATUS_PILL: Record<string, { bg: string; fg: string; border: string; accent: string }> = {
  "In Flight": { bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe", accent: "#3b82f6" },
  "To Do":     { bg: "#f1f5f9", fg: "#475569", border: "#e2e8f0", accent: "#94a3b8" },
  "At Risk":   { bg: "#fff7ed", fg: "#c2410c", border: "#fed7aa", accent: "#f97316" },
  Blocked:     { bg: "#fef2f2", fg: "#b91c1c", border: "#fecaca", accent: "#ef4444" },
  Done:        { bg: "#f0fdf4", fg: "#15803d", border: "#bbf7d0", accent: "#22c55e" },
};

function tagStyle(tag: string) {
  return TAG_COLORS[tag] ?? { bg: "#f1f5f9", color: "#334155", border: "#cbd5e1" };
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function GithubMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
      <label style={{
        display: "block", fontSize: 11, fontWeight: 700, color: "#64748b",
        textTransform: "uppercase", letterSpacing: "0.07em",
      }}>
        {children}
      </label>
      {hint && (
        <span style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>{hint}</span>
      )}
    </div>
  );
}

function SectionHeading({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
      paddingBottom: 10, borderBottom: "1px solid #e2e8f0",
    }}>
      <span style={{
        width: 26, height: 26, borderRadius: 7,
        background: "#f1f5f9", display: "inline-flex",
        alignItems: "center", justifyContent: "center",
        fontSize: 13, flexShrink: 0,
      }}>{icon}</span>
      <span style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{title}</span>
    </div>
  );
}

function StyledSelect({
  value,
  onChange,
  options,
  noneLabel,
}: {
  value: string | number;
  onChange: (v: string) => void;
  options: { value: string | number; label: string }[];
  noneLabel?: string;
}) {
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="styled-select"
      >
        {noneLabel && <option value="">{noneLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <span className="styled-select-arrow">▾</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function InitiativeModal({
  initiative,
  onClose,
  onSaved,
  flash,
  readOnly = false,
  extraAreas,
  extraPods,
  onAddArea,
  onAddPod,
  onLocalUpdate,
  allInitiatives = [],
  ghIssues = [],
  ghConfigured = false,
  ghLoading = false,
  ghError = null,
  onRefreshGhIssues,
}: {
  initiative: Initiative | null;
  onClose: () => void;
  onSaved: () => void;
  flash: (msg: string, err?: boolean) => void;
  readOnly?: boolean;
  extraAreas?: string[];
  extraPods?: string[];
  onAddArea?: (a: string) => void;
  onAddPod?: (p: string) => void;
  onLocalUpdate?: (id: string, patch: Partial<Initiative>) => void;
  allInitiatives?: Initiative[];
  ghIssues?: GithubIssue[];
  ghConfigured?: boolean;
  ghLoading?: boolean;
  ghError?: string | null;
  onRefreshGhIssues?: () => void;
}) {
  const isNew = !initiative;
  const [edit, setEdit] = useState(isNew);
  const [form, setForm] = useState<Draft>(initiative ?? EMPTY);
  const [saving, setSaving] = useState(false);

  const [commentText, setCommentText] = useState("");
  const [commentAuthor, setCommentAuthor] = useState("");
  const [addingComment, setAddingComment] = useState(false);

  const [showAddArea, setShowAddArea] = useState(false);
  const [newAreaText, setNewAreaText] = useState("");
  const [showAddPod, setShowAddPod] = useState(false);
  const [newPodText, setNewPodText] = useState("");
  const [depSearch, setDepSearch] = useState("");

  // People directory — drives the assignee dropdowns.
  const [people, setPeople] = useState<string[]>([]);

  async function loadPeople() {
    try {
      const res = await fetch("/api/people");
      const data = await res.json();
      if (data.ok) setPeople(data.people.map((p: { name: string }) => p.name));
    } catch { /* non-fatal — picker just shows current selection */ }
  }
  useEffect(() => { loadPeople(); }, []);

  // Persist a brand-new name to the People table, then refresh the option list.
  async function addPerson(name: string) {
    try {
      const res = await fetch("/api/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setPeople((prev) =>
          prev.some((p) => p.toLowerCase() === name.toLowerCase()) ? prev : [...prev, name].sort((a, b) => a.localeCompare(b))
        );
      }
    } catch { /* still selected locally even if the write fails */ }
  }

  // GitHub issue picker UI state — issues themselves come in as props.
  const [ghOpen, setGhOpen] = useState(false);
  const [ghQuery, setGhQuery] = useState("");
  const [ghLinkedUrl, setGhLinkedUrl] = useState<string>("");

  // Filter the full issue list by team client-side, replicating the saved-view
  // logic from lib/github.ts so no extra server call is needed on team change.
  const TEAM_VIEWS: Record<"Host/Platform" | "Customer", {
    squad: string; repos: string[]; excludeStatuses: string[];
  }> = {
    "Host/Platform": {
      squad: "Supply",
      repos: ["web", "api", "web-admin-dashboard", "web-hosts", "react-email-templates"],
      excludeStatuses: ["Done", "Released"],
    },
    Customer: {
      squad: "Demand",
      repos: ["web", "api", "dummy"],
      excludeStatuses: ["Discovery In Progress", "Discovery Backlog", "Discovery Done", "Known Issues"],
    },
  };

  const ghSections = (() => {
    const selectedTeam = form.team as "Host/Platform" | "Customer" | string;
    const view = (selectedTeam === "Host/Platform" || selectedTeam === "Customer")
      ? TEAM_VIEWS[selectedTeam] : null;

    const q = ghQuery.trim().toLowerCase();
    const base = ghIssues
      .filter((i) => !i.isPR)
      .filter((i) => {
        if (!view) return true;
        const repo = i.repository.split("/").pop() || i.repository;
        if (view.squad && i.squad !== view.squad) return false;
        if (view.repos.length && !view.repos.includes(repo)) return false;
        if (view.excludeStatuses.includes(i.status)) return false;
        return true;
      })
      .filter((i) =>
        !q ||
        i.title.toLowerCase().includes(q) ||
        String(i.number).includes(q) ||
        i.repository.toLowerCase().includes(q) ||
        i.assignees.some((a) => a.toLowerCase().includes(q))
      )
      .slice(0, 200);

    const sections: { key: string; label: string; backlog: boolean; items: GithubIssue[] }[] = [];
    for (const issue of base) {
      const key = issue.weekPlan2 || "__backlog__";
      let section = sections.find((s) => s.key === key);
      if (!section) {
        section = {
          key,
          label: issue.weekPlan2 ? formatWeekPlanDate(issue.weekPlan2) : "Backlog",
          backlog: !issue.weekPlan2,
          items: [],
        };
        sections.push(section);
      }
      section.items.push(issue);
    }
    return sections;
  })();
  const ghTotal = ghSections.reduce((n, s) => n + s.items.length, 0);

  function pickIssue(issue: GithubIssue) {
    // Prefer display names resolved from GitHub logins; fall back to the raw
    // logins for anyone not in the People directory.
    const names = issue.mappedAssignees ?? issue.assignees;
    setForm((f) => ({
      ...f,
      name: issue.title,
      link: issue.url,
      primaryAssignees: names.join(", "),
    }));
    setGhLinkedUrl(issue.url);
    setGhOpen(false);
    setGhQuery("");
  }

  const currentArea = form.area || "";
  // Include the record's current area even if it's a legacy value not in the
  // standard list, so editing doesn't silently switch it.
  const allAreas = Array.from(
    new Set([...AREA_OPTIONS, ...(extraAreas ?? []), ...(currentArea ? [currentArea] : [])])
  );
  const showPods = areaHasPods(currentArea);
  const showSpansPods = SPANS_PODS_AREAS.includes(currentArea);
  // Pods available for the chosen area, plus any user-added pods, plus the
  // record's current pod if it's a legacy value.
  const podChoices = Array.from(
    new Set([
      ...podsForArea(currentArea),
      ...(extraPods ?? []),
      ...(showPods && form.pod ? [form.pod] : []),
    ])
  );

  function set<K extends keyof Initiative>(key: K, value: Initiative[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Changing the area cascades pod + spansPods to keep the data consistent.
  function setArea(area: string) {
    setForm((f) => {
      const next: Draft = { ...f, area };
      if (areaHasPods(area)) {
        // Keep current pod if still valid, else fall back to the area default.
        const valid = podsForArea(area);
        next.pod = valid.includes(f.pod ?? "") ? f.pod : (AREA_DEFAULT_POD[area] ?? valid[0] ?? "");
      } else {
        // "Its own pod" areas: clear the pod entirely.
        next.pod = "";
      }
      if (!SPANS_PODS_AREAS.includes(area)) {
        next.spansPods = false;
      }
      return next;
    });
  }

  function toggleTag(tag: string) {
    const current = form.tags ?? [];
    set("tags", current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]);
  }


  async function save() {
    if (!form.name?.trim()) { flash("Name is required", true); return; }
    setSaving(true);
    try {
      const res = await fetch(
        isNew ? "/api/initiatives" : `/api/initiatives/${initiative!.id}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      flash(isNew ? "Initiative added ✓" : "Saved ✓");
      onSaved();
    } catch (e: any) {
      flash(e?.message || "Save failed", true);
    } finally {
      setSaving(false);
    }
  }

  // Mark complete: sets the Completed Date to today and Status to Done.
  // The item then drops off the roadmap and appears in History.
  async function markComplete() {
    if (!initiative) return;
    setSaving(true);
    const patch = { completedDate: todayISO(), status: "Done" as const };
    try {
      const res = await fetch(`/api/initiatives/${initiative.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Update failed");
      flash("Marked complete ✓");
      onSaved();
    } catch (e: any) {
      flash(e?.message || "Failed to mark complete", true);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!initiative) return;
    if (!confirm(`Delete "${initiative.name}"? This cannot be undone.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/initiatives/${initiative.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Delete failed");
      flash("Deleted");
      onSaved();
    } catch (e: any) {
      flash(e?.message || "Delete failed", true);
    } finally {
      setSaving(false);
    }
  }

  async function addComment() {
    if (!commentText.trim()) return;
    const newComment: Comment = {
      id: `${Date.now()}`,
      author: commentAuthor.trim() || "Anonymous",
      text: commentText.trim(),
      createdAt: new Date().toISOString(),
    };
    const updatedComments = [...(form.comments ?? []), newComment];
    set("comments", updatedComments);
    setCommentText("");
    setAddingComment(false);

    if (!isNew && initiative) {
      try {
        const res = await fetch(`/api/initiatives/${initiative.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comments: updatedComments }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Failed to save comment");
        // Keep the board's copy in sync so the comment survives reopening.
        onLocalUpdate?.(initiative.id, { comments: updatedComments });
        flash("Comment added ✓");
      } catch (e: any) {
        // Roll the optimistic comment back so the UI matches reality.
        set("comments", form.comments ?? []);
        flash(e?.message || "Failed to save comment", true);
      }
    }
  }

  function handleAddArea() {
    const trimmed = newAreaText.trim();
    if (!trimmed) return;
    onAddArea?.(trimmed);
    setArea(trimmed);
    setNewAreaText("");
    setShowAddArea(false);
  }

  function handleAddPod() {
    const trimmed = newPodText.trim();
    if (!trimmed) return;
    onAddPod?.(trimmed);
    set("pod", trimmed);
    setNewPodText("");
    setShowAddPod(false);
  }

  const isViewMode = !edit || readOnly;

  // ── VIEW MODE ────────────────────────────────────────────────────────────────
  if (isViewMode && initiative) {
    const primaryList = initiative.primaryAssignees.split(",").map((s) => s.trim()).filter(Boolean);
    const supportList = initiative.supportAssignees.split(",").map((s) => s.trim()).filter(Boolean);
    // Group outbound depLinks by type
    const depsByType = (initiative.depLinks ?? []).reduce<Record<DepType, string[]>>(
      (acc, dep) => {
        const name = allInitiatives.find((i) => i.id === dep.id)?.name;
        if (name) acc[dep.type] = [...(acc[dep.type] ?? []), name];
        return acc;
      },
      {} as Record<DepType, string[]>
    );
    // Reverse: what points at this initiative and with what type
    const reverseLinks = allInitiatives.flatMap((i) =>
      (i.depLinks ?? [])
        .filter((d) => d.id === initiative.id)
        .map((d) => ({ type: d.type, name: i.name }))
    );
    const displayComments = form.comments ?? initiative.comments ?? [];
    const pill = STATUS_PILL[initiative.status] ?? STATUS_PILL["To Do"];

    return (
      <div className="overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>

          {/* Coloured accent bar */}
          <div style={{ height: 4, background: pill.accent, borderRadius: "16px 16px 0 0" }} />

          {/* Header */}
          <div className="modal-header">
            <div className="modal-header-left">
              <h2>{initiative.name}</h2>
              <div className="modal-subtitle">
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  background: pill.bg, color: pill.fg, border: `1px solid ${pill.border}`,
                  borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 700,
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: pill.fg, display: "inline-block" }} />
                  {initiative.status}
                </span>
                {initiative.tShirtSize && (
                  <span className="size-badge">{initiative.tShirtSize}</span>
                )}
                <span style={{ color: "#94a3b8" }}>·</span>
                <span style={{ color: "#64748b" }}>{initiative.area}</span>
                {initiative.pod && (
                  <><span style={{ color: "#cbd5e1" }}>›</span><span style={{ color: "#64748b" }}>{initiative.pod}</span></>
                )}
              </div>
            </div>
            <button className="modal-close-x" onClick={onClose} aria-label="Close">✕</button>
          </div>

          {/* Primary actions — at the top so they're always in reach */}
          {!readOnly && (
            <div className="modal-action-bar">
              {!initiative.completedDate ? (
                <button className="btn complete" onClick={markComplete} disabled={saving}>
                  ✓ Mark as complete
                </button>
              ) : (
                <span className="completed-flag">
                  ✓ Completed {initiative.completedDate}
                </span>
              )}
              <button className="btn primary" onClick={() => setEdit(true)}>Edit</button>
            </div>
          )}

          {/* Details table */}
          <div className="modal-section">
            <div className="card-info-table">
              <div className="card-info-row">
                <div className="card-info-key">Timeframe</div>
                <div className="card-info-val">{initiative.timeframe}</div>
              </div>
              {initiative.priority && (
                <div className="card-info-row">
                  <div className="card-info-key">Priority</div>
                  <div className="card-info-val">
                    <span className={`priority-chip ${initiative.priority.toLowerCase()}`}>
                      {initiative.priority === "High" && <span className="priority-bang" aria-hidden>!</span>}
                      {initiative.priority}
                    </span>
                  </div>
                </div>
              )}
              {primaryList.length > 0 && (
                <div className="card-info-row">
                  <div className="card-info-key">Primary assignee(s)</div>
                  <div className="card-info-val">
                    {primaryList.map((n) => <span key={n} className="assignee-chip primary">{n}</span>)}
                  </div>
                </div>
              )}
              {supportList.length > 0 && (
                <div className="card-info-row">
                  <div className="card-info-key">Support assignee(s)</div>
                  <div className="card-info-val">
                    {supportList.map((n) => <span key={n} className="assignee-chip support">{n}</span>)}
                  </div>
                </div>
              )}
              {initiative.durationWeeks > 1 && (
                <div className="card-info-row">
                  <div className="card-info-key">Duration</div>
                  <div className="card-info-val">{initiative.durationWeeks} weeks</div>
                </div>
              )}
              {initiative.layers?.length > 0 && (
                <div className="card-info-row">
                  <div className="card-info-key">Layer</div>
                  <div className="card-info-val">
                    {initiative.layers.map((l) => (
                      <span key={l} className={`layer-chip ${l.toLowerCase()}`}>{l}</span>
                    ))}
                  </div>
                </div>
              )}
              {initiative.tags?.length > 0 && (
                <div className="card-info-row">
                  <div className="card-info-key">Tags</div>
                  <div className="card-info-val">
                    {initiative.tags.map((t) => {
                      const s = tagStyle(t);
                      return (
                        <span key={t} className="tag-chip"
                          style={{ background: s.bg, color: s.color, borderColor: s.border }}>
                          {t}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              {initiative.spansPods && (
                <div className="card-info-row">
                  <div className="card-info-key">Scope</div>
                  <div className="card-info-val" style={{ color: "#92400e", fontWeight: 600 }}>
                    Spans Internal + 3rd Party Lockers
                  </div>
                </div>
              )}
              {(Object.keys(depsByType) as DepType[]).map((type) => (
                <div key={type} className="card-info-row">
                  <div className="card-info-key">{DEP_TYPE_LABELS[type]}</div>
                  <div className="card-info-val" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {depsByType[type].map((name) => (
                      <span key={name} className={`dep-chip dep-${type}`}>{name}</span>
                    ))}
                  </div>
                </div>
              ))}
              {reverseLinks.length > 0 && (
                <div className="card-info-row">
                  <div className="card-info-key">Depended on by</div>
                  <div className="card-info-val" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {reverseLinks.map((r) => (
                      <span key={r.name} className="dep-chip dep-reverse" title={`${r.name} is ${DEP_TYPE_LABELS[r.type].toLowerCase()} this`}>
                        {r.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {initiative.description && (
            <div className="modal-section">
              <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em" }}>Description</p>
              <p className="modal-desc">{initiative.description}</p>
            </div>
          )}

          {initiative.notes && (
            <div className="modal-section">
              <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em" }}>Notes</p>
              <div className="modal-notes">{initiative.notes}</div>
            </div>
          )}

          {initiative.link && (
            <div className="modal-section" style={{ paddingTop: 0 }}>
              <a className="link" href={initiative.link} target="_blank" rel="noreferrer">Open linked work ↗</a>
            </div>
          )}

          <div className="modal-section">
            <div className="comments-header">
              <span>Comments ({displayComments.length})</span>
              {!addingComment && (
                <button className="btn-link" onClick={() => setAddingComment(true)}>+ Add comment</button>
              )}
            </div>
            {displayComments.length === 0 && !addingComment && (
              <div className="comments-empty">No comments yet.</div>
            )}
            {displayComments.map((c) => (
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
                  <button className="btn" style={{ fontSize: 13, padding: "6px 12px" }}
                    onClick={() => { setAddingComment(false); setCommentText(""); }}>Cancel</button>
                  <button className="btn primary" style={{ fontSize: 13, padding: "6px 12px" }}
                    onClick={addComment}>Post comment</button>
                </div>
              </div>
            )}
          </div>

          <div className="modal-actions">
            {!readOnly
              ? <button className="btn danger" onClick={remove} disabled={saving}>Delete</button>
              : <span />}
            <button className="btn" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  // ── EDIT / CREATE MODE ────────────────────────────────────────────────────────
  const accentColor = (form.status && STATUS_PILL[form.status]?.accent) ?? "#4f46e5";

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal edit-modal" onClick={(e) => e.stopPropagation()}>

        {/* Coloured accent bar — reflects current status */}
        <div style={{ height: 4, background: accentColor, borderRadius: "16px 16px 0 0" }} />

        {/* Header */}
        <div style={{
          padding: "18px 24px 16px",
          borderBottom: "1px solid #e2e8f0",
          display: "flex", alignItems: "flex-start", gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>
              {isNew ? "New initiative" : "Editing initiative"}
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>
              {isNew ? "What are we building?" : (form.name || "Untitled")}
            </div>
          </div>
          <button className="modal-close-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Team picker — sits above everything so it filters the GitHub issue list */}
        <div style={{
          padding: "10px 24px",
          borderBottom: "1px solid #e2e8f0",
          background: "#fafbfc",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>
            Team
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            {TEAM_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set("team", t)}
                style={{
                  fontSize: 12.5, fontWeight: 600, padding: "5px 14px",
                  borderRadius: 8, border: "1.5px solid",
                  cursor: "pointer",
                  background: form.team === t ? "#eef2ff" : "#fff",
                  color: form.team === t ? "#3730a3" : "#475569",
                  borderColor: form.team === t ? "#c7d2fe" : "#e2e8f0",
                  transition: "all 0.12s",
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable form body */}
        <div className="edit-form-body">

          {/* ── GitHub issue prefill (new initiatives only) ───── */}
          {/* Render as soon as we're loading OR confirmed configured, so the
             picker appears immediately with a loading state instead of popping
             in only after the (slow) first board crawl resolves. */}
          {isNew && (ghConfigured || (ghLoading && ghError === null)) && (
            <div className="gh-picker">
              {ghLinkedUrl ? (
                <div className="gh-linked">
                  <span className="gh-linked-icon" aria-hidden>
                    <GithubMark />
                  </span>
                  <span className="gh-linked-text">
                    Prefilled from <a href={ghLinkedUrl} target="_blank" rel="noreferrer">GitHub issue</a>
                  </span>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => { setGhLinkedUrl(""); setGhOpen(true); }}
                  >
                    Change
                  </button>
                </div>
              ) : !ghOpen ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    type="button"
                    className="gh-trigger"
                    onClick={() => setGhOpen(true)}
                    disabled={ghLoading}
                    style={{ flex: 1 }}
                  >
                    <GithubMark />
                    <span>Start from a Stashboard V2 issue</span>
                    <span className="gh-trigger-hint">
                      {ghLoading
                        ? "loading…"
                        : form.team === "Customer" ? "Customers view"
                        : form.team === "Host/Platform" ? "Hosts view"
                        : "all issues"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="btn icon-btn"
                    onClick={() => onRefreshGhIssues?.()}
                    disabled={ghLoading}
                    title="Refresh GitHub issues"
                    aria-label="Refresh GitHub issues"
                    style={{ flexShrink: 0 }}
                  >
                    <span className={ghLoading ? "spin" : ""}>↻</span>
                  </button>
                </div>
              ) : (
                <div className="gh-search-panel">
                  <div className="gh-search-head">
                    <GithubMark />
                    <input
                      autoFocus
                      className="gh-search-input"
                      placeholder="Search issues by title, #number, repo or assignee…"
                      value={ghQuery}
                      onChange={(e) => setGhQuery(e.target.value)}
                    />
                    <button type="button" className="btn-link" onClick={() => { setGhOpen(false); setGhQuery(""); }}>
                      Cancel
                    </button>
                  </div>
                  <div className="gh-results">
                    {ghLoading && <div className="gh-empty">Loading issues…</div>}
                    {ghError && <div className="gh-empty gh-error">{ghError}</div>}
                    {!ghLoading && !ghError && ghTotal === 0 && (
                      <div className="gh-empty">No matching issues.</div>
                    )}
                    {ghSections.map((section) => (
                      <div key={section.key} className="gh-section">
                        <div className={`gh-section-head ${section.backlog ? "backlog" : ""}`}>
                          {section.backlog ? (
                            <span>Backlog</span>
                          ) : (
                            <span><span className="gh-section-cal" aria-hidden>🗓</span> Week of {section.label}</span>
                          )}
                          <span className="gh-section-count">{section.items.length}</span>
                        </div>
                        {section.items.map((issue) => (
                          <button
                            key={issue.id}
                            type="button"
                            className="gh-result"
                            onClick={() => pickIssue(issue)}
                          >
                            <span className={`gh-state gh-state-${issue.state.toLowerCase()}`} title={issue.state} />
                            <span className="gh-result-main">
                              <span className="gh-result-title">{issue.title}</span>
                              <span className="gh-result-meta">
                                {issue.repository} #{issue.number}
                                {issue.status && <> · {issue.status}</>}
                                {issue.assignees.length > 0 && <> · {issue.assignees.join(", ")}</>}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Section 1: Basics ─────────────────────────────── */}
          <div className="form-section">
            <SectionHeading icon="📋" title="Basic details" />

            <div className="form-field">
              <FieldLabel>Initiative name <span style={{ color: "#ef4444" }}>*</span></FieldLabel>
              <input
                className="form-input"
                value={form.name || ""}
                onChange={(e) => set("name", e.target.value)}
                placeholder="What are we building or solving?"
                autoFocus={isNew}
              />
            </div>

            <div className="form-field">
              <FieldLabel hint="optional">Description</FieldLabel>
              <textarea
                className="form-input form-textarea"
                value={form.description || ""}
                onChange={(e) => set("description", e.target.value)}
                placeholder="What is it and why does it matter?"
              />
            </div>

            <div className="form-row-3">
              <div className="form-field">
                <FieldLabel>Status</FieldLabel>
                <StyledSelect
                  value={form.status || ""}
                  onChange={(v) => set("status", v as any)}
                  options={STATUS_OPTIONS.map((o) => ({ value: o, label: o }))}
                />
              </div>
              <div className="form-field">
                <FieldLabel>Size estimate</FieldLabel>
                <StyledSelect
                  value={form.tShirtSize || ""}
                  onChange={(v) => set("tShirtSize", v as any)}
                  options={TSHIRT_OPTIONS.map((o) => ({ value: o, label: o }))}
                  noneLabel="— not set —"
                />
              </div>
              <div className="form-field">
                <FieldLabel>Duration</FieldLabel>
                <StyledSelect
                  value={form.durationWeeks || 1}
                  onChange={(v) => set("durationWeeks", Number(v) as any)}
                  options={[
                    { value: 1, label: "1 week" },
                    { value: 2, label: "2 weeks" },
                    { value: 3, label: "3 weeks" },
                  ]}
                />
              </div>
            </div>

            <div className="form-field">
              <FieldLabel>Priority</FieldLabel>
              <div className="priority-picker">
                {PRIORITY_OPTIONS.map((p) => {
                  const active = form.priority === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      className={`priority-option ${p.toLowerCase()} ${active ? "active" : ""}`}
                      onClick={() => set("priority", active ? "" : (p as any))}
                    >
                      {p === "High" && <span className="priority-bang" aria-hidden>!</span>}
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Section 2: Placement ──────────────────────────── */}
          <div className="form-section">
            <SectionHeading icon="📍" title="Where does it live?" />

            <div className="form-field">
              <FieldLabel>Timeframe</FieldLabel>
              <StyledSelect
                value={form.timeframe || ""}
                onChange={(v) => set("timeframe", v as any)}
                options={TIMEFRAMES.map((o) => ({ value: o, label: o }))}
              />
            </div>

            <div className={showPods ? "form-row-2" : ""}>
              {/* Area */}
              <div className="form-field">
                <FieldLabel>Area</FieldLabel>
                <div className="select-with-add">
                  <div style={{ position: "relative", flex: 1 }}>
                    <select value={form.area || ""} onChange={(e) => setArea(e.target.value)} className="styled-select">
                      {allAreas.map((o) => <option key={o}>{o}</option>)}
                    </select>
                    <span className="styled-select-arrow">▾</span>
                  </div>
                  <button type="button" className="add-option-btn"
                    onClick={() => setShowAddArea((v) => !v)} title="Add new area">+</button>
                </div>
                {showAddArea && (
                  <div className="add-option-row">
                    <input autoFocus placeholder="New area name" value={newAreaText}
                      onChange={(e) => setNewAreaText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddArea(); }} />
                    <button className="btn primary" style={{ padding: "7px 12px", fontSize: 13 }}
                      onClick={handleAddArea}>Add</button>
                  </div>
                )}
                {!showPods && (
                  <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 6 }}>
                    {currentArea} is its own pod — no pod needed.
                  </div>
                )}
              </div>

              {/* Pod — only shown for areas that have pods */}
              {showPods && (
                <div className="form-field">
                  <FieldLabel>Pod</FieldLabel>
                  <div className="select-with-add">
                    <div style={{ position: "relative", flex: 1 }}>
                      <select value={form.pod || ""} onChange={(e) => set("pod", e.target.value)} className="styled-select">
                        {podChoices.map((o) => <option key={o}>{o}</option>)}
                      </select>
                      <span className="styled-select-arrow">▾</span>
                    </div>
                    <button type="button" className="add-option-btn"
                      onClick={() => setShowAddPod((v) => !v)} title="Add new pod">+</button>
                  </div>
                  {showAddPod && (
                    <div className="add-option-row">
                      <input autoFocus placeholder="New pod name" value={newPodText}
                        onChange={(e) => setNewPodText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleAddPod(); }} />
                      <button className="btn primary" style={{ padding: "7px 12px", fontSize: 13 }}
                        onClick={handleAddPod}>Add</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Spans both pods toggle — only for Lockers */}
            {showSpansPods && (
              <div className="form-field">
                <label className="spans-toggle" style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px", borderRadius: 10, cursor: "pointer",
                  border: form.spansPods ? "1.5px solid #f59e0b" : "1.5px solid #e2e8f0",
                  background: form.spansPods ? "#fffbeb" : "#fafbfc",
                  transition: "all 0.15s",
                }}>
                  <input
                    type="checkbox"
                    checked={!!form.spansPods}
                    onChange={(e) => set("spansPods", e.target.checked)}
                    style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#f59e0b" }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5, color: form.spansPods ? "#92400e" : "#0f172a" }}>
                      Spans both pods
                    </div>
                    <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 1 }}>
                      This initiative covers both Internal and 3rd Party Lockers
                    </div>
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* ── Section 3: People ─────────────────────────────── */}
          <div className="form-section">
            <SectionHeading icon="👥" title="Who's involved?" />

            <div className="form-row-2">
              <div className="form-field">
                <FieldLabel hint="pick or type to add">Primary assignee(s)</FieldLabel>
                <AssigneePicker
                  value={form.primaryAssignees || ""}
                  onChange={(v) => set("primaryAssignees", v)}
                  options={people}
                  onAddPerson={addPerson}
                  placeholder="Select people…"
                />
              </div>
              <div className="form-field">
                <FieldLabel hint="pick or type to add">Support assignee(s)</FieldLabel>
                <AssigneePicker
                  value={form.supportAssignees || ""}
                  onChange={(v) => set("supportAssignees", v)}
                  options={people}
                  onAddPerson={addPerson}
                  placeholder="Select people…"
                />
              </div>
            </div>
          </div>

          {/* ── Section 4: Labels ─────────────────────────────── */}
          <div className="form-section">
            <SectionHeading icon="🏷️" title="Labels & classification" />

            <div className="form-field">
              <FieldLabel>Layer</FieldLabel>
              <div className="layer-toggle-group">
                {LAYER_OPTIONS.map((l) => {
                  const active = (form.layers ?? []).includes(l);
                  return (
                    <button
                      key={l} type="button"
                      className={`layer-toggle ${l.toLowerCase()} ${active ? "active" : ""}`}
                      onClick={() => {
                        const current = form.layers ?? [];
                        set("layers", active ? current.filter((x) => x !== l) : [...current, l]);
                      }}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="form-field">
              <FieldLabel>Tags <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "#94a3b8", fontSize: 11 }}>— select all that apply</span></FieldLabel>
              <div className="tag-picker">
                {DEFAULT_TAGS.map((tag) => {
                  const active = (form.tags ?? []).includes(tag);
                  const s = tagStyle(tag);
                  return (
                    <button
                      key={tag} type="button"
                      className={`tag-option ${active ? "active" : ""}`}
                      style={active ? { background: s.bg, color: s.color, borderColor: s.border } : undefined}
                      onClick={() => toggleTag(tag)}
                    >
                      {active ? "✓ " : "+ "}{tag}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Section 5: Dependencies ───────────────────────── */}
          {allInitiatives.length > 0 && (
            <div className="form-section">
              <SectionHeading icon="🔗" title="Dependencies" />
              <div className="form-field">
                <FieldLabel hint="how is this initiative linked to others?">Linked initiatives</FieldLabel>
                {(() => {
                  const candidates = allInitiatives
                    .filter((c) => c.id !== initiative?.id)
                    .filter((c) => {
                      const q = depSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        c.name.toLowerCase().includes(q) ||
                        c.area.toLowerCase().includes(q)
                      );
                    });

                  function getDepType(id: string): DepType | null {
                    return (form.depLinks ?? []).find((d) => d.id === id)?.type ?? null;
                  }

                  function setDepLink(id: string, type: DepType | null) {
                    const current = (form.depLinks ?? []).filter((d) => d.id !== id);
                    set("depLinks", type ? [...current, { type, id }] : current);
                  }

                  return (
                    <>
                      {allInitiatives.length > 6 && (
                        <input
                          className="form-input"
                          style={{ marginBottom: 6, fontSize: 13 }}
                          placeholder="Filter initiatives…"
                          value={depSearch}
                          onChange={(e) => setDepSearch(e.target.value)}
                        />
                      )}
                      <div className="dep-picker">
                        {candidates.length === 0 && (
                          <div style={{ padding: "8px", fontSize: 12.5, color: "#94a3b8" }}>No initiatives found.</div>
                        )}
                        {candidates.map((c) => {
                          const activeType = getDepType(c.id);
                          return (
                            <div key={c.id} className="dep-picker-item" style={{ alignItems: "flex-start", flexDirection: "column", gap: 6 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
                                <input
                                  type="checkbox"
                                  checked={activeType !== null}
                                  onChange={() => setDepLink(c.id, activeType !== null ? null : "blocked-by")}
                                  style={{ width: 15, height: 15, cursor: "pointer", accentColor: "#6366f1", flexShrink: 0 }}
                                />
                                <span className="dep-picker-name">{c.name}</span>
                                <span className="dep-picker-area">{c.area}</span>
                              </div>
                              {activeType !== null && (
                                <div style={{ display: "flex", gap: 6, paddingLeft: 23 }}>
                                  {DEP_TYPE_OPTIONS.map((t) => (
                                    <button
                                      key={t}
                                      type="button"
                                      onClick={() => setDepLink(c.id, t)}
                                      style={{
                                        fontSize: 11.5, fontWeight: 600, padding: "3px 9px",
                                        borderRadius: 6, border: "1.5px solid",
                                        cursor: "pointer",
                                        background: activeType === t ? DEP_CHIP_STYLE[t].bg : "#f8fafc",
                                        color: activeType === t ? DEP_CHIP_STYLE[t].color : "#64748b",
                                        borderColor: activeType === t ? DEP_CHIP_STYLE[t].border : "#e2e8f0",
                                      }}
                                    >
                                      {DEP_TYPE_LABELS[t]}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ── Section 6: Extra ──────────────────────────────── */}
          <div className="form-section" style={{ borderBottom: "none" }}>
            <SectionHeading icon="📎" title="Links & notes" />

            <div className="form-field">
              <FieldLabel hint="optional">Link (GitHub / doc / ticket)</FieldLabel>
              <input
                className="form-input"
                value={form.link || ""}
                onChange={(e) => set("link", e.target.value)}
                placeholder="https://…"
                type="url"
              />
            </div>

            <div className="form-field">
              <FieldLabel hint="optional">Notes</FieldLabel>
              <textarea
                className="form-input form-textarea"
                value={form.notes || ""}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Any additional context, blockers, or decisions…"
              />
            </div>

            <div className="form-field">
              <FieldLabel hint="set when completed">Completed date</FieldLabel>
              <input
                className="form-input"
                type="date"
                value={form.completedDate || ""}
                onChange={(e) => set("completedDate", e.target.value)}
              />
              <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 6 }}>
                Setting a date moves this item to History. Clear it to bring it back to the roadmap.
              </div>
            </div>
          </div>
        </div>

        {/* Sticky footer */}
        <div className="modal-actions">
          {!isNew
            ? <button className="btn danger" onClick={remove} disabled={saving}>Delete</button>
            : <span />}
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn" onClick={isNew ? onClose : () => setEdit(false)} disabled={saving}>
              Cancel
            </button>
            <button className="btn primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : isNew ? "Create initiative" : "Save changes"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
