"use client";

import { useState } from "react";
import {
  Initiative,
  Comment,
  TEAM_OPTIONS,
  AREA_OPTIONS,
  POD_OPTIONS,
  STATUS_OPTIONS,
  TIMEFRAMES,
  TSHIRT_OPTIONS,
  LAYER_OPTIONS,
  DEFAULT_TAGS,
} from "@/lib/types";

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

  const allAreas = [...AREA_OPTIONS, ...(extraAreas ?? [])];
  const allPods = [...POD_OPTIONS, ...(extraPods ?? [])];

  function set<K extends keyof Initiative>(key: K, value: Initiative[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleTag(tag: string) {
    const current = form.tags ?? [];
    set("tags", current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]);
  }

  function formatAssignees(value: string) {
    return value.split(",").map((s) => s.trim()).filter(Boolean).join(", ");
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
    if (!isNew && initiative) {
      try {
        await fetch(`/api/initiatives/${initiative.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comments: updatedComments }),
        });
      } catch { /* non-fatal */ }
    }
    setCommentText("");
    setAddingComment(false);
  }

  function handleAddArea() {
    const trimmed = newAreaText.trim();
    if (!trimmed) return;
    onAddArea?.(trimmed);
    set("area", trimmed);
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

          {/* Details table */}
          <div className="modal-section">
            <div className="card-info-table">
              <div className="card-info-row">
                <div className="card-info-key">Timeframe</div>
                <div className="card-info-val">{initiative.timeframe}</div>
              </div>
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
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" onClick={onClose}>Close</button>
              {!readOnly && <button className="btn primary" onClick={() => setEdit(true)}>Edit</button>}
            </div>
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

        {/* Scrollable form body */}
        <div className="edit-form-body">

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
          </div>

          {/* ── Section 2: Placement ──────────────────────────── */}
          <div className="form-section">
            <SectionHeading icon="📍" title="Where does it live?" />

            <div className="form-row-2">
              <div className="form-field">
                <FieldLabel>Team</FieldLabel>
                <StyledSelect
                  value={form.team || ""}
                  onChange={(v) => set("team", v)}
                  options={TEAM_OPTIONS.map((o) => ({ value: o, label: o }))}
                />
              </div>
              <div className="form-field">
                <FieldLabel>Timeframe</FieldLabel>
                <StyledSelect
                  value={form.timeframe || ""}
                  onChange={(v) => set("timeframe", v as any)}
                  options={TIMEFRAMES.map((o) => ({ value: o, label: o }))}
                />
              </div>
            </div>

            <div className="form-row-2">
              {/* Area */}
              <div className="form-field">
                <FieldLabel>Area</FieldLabel>
                <div className="select-with-add">
                  <div style={{ position: "relative", flex: 1 }}>
                    <select value={form.area || ""} onChange={(e) => set("area", e.target.value)} className="styled-select">
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
              </div>

              {/* Pod */}
              <div className="form-field">
                <FieldLabel>Pod</FieldLabel>
                <div className="select-with-add">
                  <div style={{ position: "relative", flex: 1 }}>
                    <select value={form.pod || ""} onChange={(e) => set("pod", e.target.value)} className="styled-select">
                      {allPods.map((o) => <option key={o}>{o}</option>)}
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
            </div>

            {/* Spans both pods toggle */}
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
          </div>

          {/* ── Section 3: People ─────────────────────────────── */}
          <div className="form-section">
            <SectionHeading icon="👥" title="Who's involved?" />

            <div className="form-row-2">
              <div className="form-field">
                <FieldLabel hint="comma-separated">Primary assignee(s)</FieldLabel>
                <input
                  className="form-input"
                  value={form.primaryAssignees || ""}
                  onChange={(e) => set("primaryAssignees", e.target.value)}
                  onBlur={(e) => set("primaryAssignees", formatAssignees(e.target.value))}
                  placeholder="e.g. Alex, Jamie"
                />
                {form.primaryAssignees && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                    {formatAssignees(form.primaryAssignees).split(", ").filter(Boolean).map((n) => (
                      <span key={n} className="assignee-chip primary">{n}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="form-field">
                <FieldLabel hint="comma-separated">Support assignee(s)</FieldLabel>
                <input
                  className="form-input"
                  value={form.supportAssignees || ""}
                  onChange={(e) => set("supportAssignees", e.target.value)}
                  onBlur={(e) => set("supportAssignees", formatAssignees(e.target.value))}
                  placeholder="e.g. Sam, Jordan"
                />
                {form.supportAssignees && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                    {formatAssignees(form.supportAssignees).split(", ").filter(Boolean).map((n) => (
                      <span key={n} className="assignee-chip support">{n}</span>
                    ))}
                  </div>
                )}
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

          {/* ── Section 5: Extra ──────────────────────────────── */}
          <div className="form-section" style={{ borderBottom: "none" }}>
            <SectionHeading icon="🔗" title="Links & notes" />

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
