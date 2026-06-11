"use client";

import { useState } from "react";
import {
  Initiative,
  TEAM_OPTIONS,
  AREA_OPTIONS,
  POD_OPTIONS,
  STATUS_OPTIONS,
  TIMEFRAMES,
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
  owner: "",
  ownerSlackIds: "",
  link: "",
  notes: "",
};

export default function InitiativeModal({
  initiative,
  onClose,
  onSaved,
  flash,
}: {
  initiative: Initiative | null;
  onClose: () => void;
  onSaved: () => void;
  flash: (msg: string, err?: boolean) => void;
}) {
  const isNew = !initiative;
  const [edit, setEdit] = useState(isNew);
  const [form, setForm] = useState<Draft>(initiative ?? EMPTY);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof Initiative>(key: K, value: Initiative[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!form.name?.trim()) {
      flash("Name is required", true);
      return;
    }
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
      const res = await fetch(`/api/initiatives/${initiative.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Delete failed");
      flash("Deleted");
      onSaved();
    } catch (e: any) {
      flash(e?.message || "Delete failed", true);
    } finally {
      setSaving(false);
    }
  }

  // ---- View mode ----
  if (!edit && initiative) {
    return (
      <div className="overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>{initiative.name}</h2>
          <div style={{ color: "#64748b", fontSize: 13, marginBottom: 8 }}>
            {initiative.area}
            {initiative.pod ? ` · ${initiative.pod}` : ""} ·{" "}
            {initiative.timeframe} · {initiative.status}
            {initiative.spansPods ? " · spans Internal + 3rd Party" : ""}
          </div>
          {initiative.description && <p>{initiative.description}</p>}
          {initiative.owner && (
            <p>
              <strong>Owner:</strong> {initiative.owner}
            </p>
          )}
          {initiative.notes && (
            <p style={{ whiteSpace: "pre-wrap", color: "#334155" }}>
              {initiative.notes}
            </p>
          )}
          {initiative.link && (
            <p>
              <a
                className="link"
                href={initiative.link}
                target="_blank"
                rel="noreferrer"
              >
                Open linked work ↗
              </a>
            </p>
          )}
          <div className="modal-actions">
            <button className="btn ghost" onClick={remove} disabled={saving}>
              Delete
            </button>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" onClick={onClose}>
                Close
              </button>
              <button className="btn primary" onClick={() => setEdit(true)}>
                Edit
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Edit / create mode ----
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isNew ? "Add initiative" : "Edit initiative"}</h2>

        <div className="field">
          <label>Name</label>
          <input
            value={form.name || ""}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. OX Point integration"
          />
        </div>

        <div className="field">
          <label>Description</label>
          <textarea
            value={form.description || ""}
            onChange={(e) => set("description", e.target.value)}
            placeholder="What is it and why does it matter?"
          />
        </div>

        <div className="row2">
          <div className="field">
            <label>Team</label>
            <select
              value={form.team || ""}
              onChange={(e) => set("team", e.target.value)}
            >
              {TEAM_OPTIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Timeframe</label>
            <select
              value={form.timeframe || ""}
              onChange={(e) => set("timeframe", e.target.value as any)}
            >
              {TIMEFRAMES.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="row2">
          <div className="field">
            <label>Area (swimlane)</label>
            <select
              value={form.area || ""}
              onChange={(e) => set("area", e.target.value)}
            >
              {AREA_OPTIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Pod</label>
            <select
              value={form.pod || ""}
              onChange={(e) => set("pod", e.target.value)}
            >
              {POD_OPTIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="row2">
          <div className="field">
            <label>Status</label>
            <select
              value={form.status || ""}
              onChange={(e) => set("status", e.target.value as any)}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Owner</label>
            <input
              value={form.owner || ""}
              onChange={(e) => set("owner", e.target.value)}
              placeholder="e.g. Bowie Cao"
            />
          </div>
        </div>

        <div className="checkbox-row">
          <input
            id="spans"
            type="checkbox"
            checked={!!form.spansPods}
            onChange={(e) => set("spansPods", e.target.checked)}
          />
          <label htmlFor="spans" style={{ margin: 0, textTransform: "none" }}>
            Spans both pods (Internal + 3rd Party lockers)
          </label>
        </div>

        <div className="field">
          <label>Owner Slack IDs (comma-separated)</label>
          <input
            value={form.ownerSlackIds || ""}
            onChange={(e) => set("ownerSlackIds", e.target.value)}
            placeholder="U098WH18E14, U05DB7JFLBW"
          />
        </div>

        <div className="field">
          <label>Link (GitHub issue / doc)</label>
          <input
            value={form.link || ""}
            onChange={(e) => set("link", e.target.value)}
            placeholder="https://github.com/org/repo/issues/123"
          />
        </div>

        <div className="field">
          <label>Notes</label>
          <textarea
            value={form.notes || ""}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>

        <div className="modal-actions">
          {!isNew ? (
            <button className="btn ghost" onClick={remove} disabled={saving}>
              Delete
            </button>
          ) : (
            <span />
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="btn"
              onClick={isNew ? onClose : () => setEdit(false)}
              disabled={saving}
            >
              Cancel
            </button>
            <button className="btn primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
