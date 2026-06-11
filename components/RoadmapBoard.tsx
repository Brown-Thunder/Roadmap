"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toPng } from "html-to-image";
import {
  Initiative,
  TIMEFRAMES,
  STATUS_COLORS,
  TIMEFRAME_ACCENT,
  TEAM_OPTIONS,
} from "@/lib/types";
import { buildGroups, cellItems, filterByTeam } from "@/lib/roadmap";
import InitiativeModal from "./InitiativeModal";

function weekLabel() {
  const d = new Date();
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function RoadmapBoard({ initial }: { initial: Initiative[] }) {
  const router = useRouter();
  const [team, setTeam] = useState<string>("All");
  const [selected, setSelected] = useState<Initiative | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const snapshotRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => filterByTeam(initial, team), [initial, team]);
  const groups = useMemo(() => buildGroups(filtered), [filtered]);

  function flash(msg: string, err = false) {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3500);
  }

  async function capturePng(): Promise<string> {
    if (!snapshotRef.current) throw new Error("Nothing to capture");
    return toPng(snapshotRef.current, {
      backgroundColor: "#ffffff",
      pixelRatio: 2,
      cacheBust: true,
    });
  }

  async function postToSlack() {
    try {
      setBusy("Generating snapshot…");
      const image = await capturePng();
      setBusy("Posting to Slack…");
      const res = await fetch("/api/slack/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, team }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Slack post failed");
      flash("Snapshot posted to #temp-roadmap ✓");
    } catch (e: any) {
      flash(e?.message || "Failed to post to Slack", true);
    } finally {
      setBusy(null);
    }
  }

  async function sendDraftForApproval() {
    try {
      setBusy("Generating snapshot…");
      const image = await capturePng();
      setBusy("Sending draft…");
      const res = await fetch("/api/slack/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, team, draft: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Draft send failed");
      flash("Draft sent to you on Slack for approval ✓");
    } catch (e: any) {
      flash(e?.message || "Failed to send draft", true);
    } finally {
      setBusy(null);
    }
  }

  function onSaved() {
    setSelected(null);
    setCreating(false);
    router.refresh();
  }

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <h1>Team Roadmap</h1>
          <div className="sub">
            This week · next week · future — grouped by pod. Click any card for
            detail.
          </div>
        </div>
        <div className="controls">
          <select
            className="select"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            aria-label="Filter by team"
          >
            <option value="All">All teams</option>
            {TEAM_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button className="btn" onClick={() => setCreating(true)}>
            + Add initiative
          </button>
          <button
            className="btn"
            onClick={sendDraftForApproval}
            disabled={!!busy}
            title="Send a draft snapshot to your Slack DMs to approve before posting"
          >
            Send draft for approval
          </button>
          <button className="btn primary" onClick={postToSlack} disabled={!!busy}>
            {busy || "Post snapshot to Slack"}
          </button>
        </div>
      </div>

      {/* Captured region for the Slack snapshot */}
      <div ref={snapshotRef} style={{ background: "#fff", borderRadius: 14 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            padding: "16px 18px 8px",
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 800 }}>
            Team Roadmap
            {team !== "All" ? (
              <span style={{ color: "#64748b", fontWeight: 600 }}> · {team}</span>
            ) : null}
          </div>
          <div style={{ color: "#64748b", fontSize: 13, fontWeight: 600 }}>
            Week of {weekLabel()}
          </div>
        </div>

        <div className="board">
          <div className="grid">
            <div className="corner" />
            {TIMEFRAMES.map((tf) => (
              <div className="col-head" key={tf}>
                <span
                  className="pill"
                  style={{ background: TIMEFRAME_ACCENT[tf] }}
                />
                {tf}
              </div>
            ))}
          </div>

          {groups.map((g) => (
            <div key={g.area}>
              <div className="area-row">
                <div className="area-label">{g.area}</div>
                <div className="area-span" />
              </div>
              {g.lanes.map((lane) => (
                <div className="lane-row" key={lane.key}>
                  <div className={`lane-label ${lane.shared ? "shared" : ""}`}>
                    {lane.label}
                  </div>
                  {TIMEFRAMES.map((tf) => {
                    const items = cellItems(filtered, g.area, lane.key, tf);
                    return (
                      <div className="cell" key={tf}>
                        {items.length === 0 ? (
                          <div className="empty">—</div>
                        ) : (
                          items.map((it) => (
                            <div
                              key={it.id}
                              className={`card ${it.spansPods ? "shared" : ""}`}
                              style={{
                                borderLeftColor:
                                  STATUS_COLORS[it.status] || "#94a3b8",
                              }}
                              onClick={() => setSelected(it)}
                            >
                              <div className="title">{it.name}</div>
                              <div className="meta">
                                <span
                                  className="status-dot"
                                  style={{
                                    background:
                                      STATUS_COLORS[it.status] || "#94a3b8",
                                  }}
                                />
                                <span>{it.status}</span>
                                {it.owner ? (
                                  <span className="owner-chip">{it.owner}</span>
                                ) : null}
                                {it.spansPods ? (
                                  <span className="span-tag">SPANS PODS</span>
                                ) : null}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="legend">
        {Object.entries(STATUS_COLORS).map(([s, c]) => (
          <div className="item" key={s}>
            <span className="status-dot" style={{ background: c }} /> {s}
          </div>
        ))}
        <div className="item">
          <span
            className="status-dot"
            style={{ background: "var(--shared-line)" }}
          />{" "}
          Shared lane = spans Internal + 3rd Party lockers
        </div>
      </div>

      {(selected || creating) && (
        <InitiativeModal
          initiative={selected}
          onClose={() => {
            setSelected(null);
            setCreating(false);
          }}
          onSaved={onSaved}
          flash={flash}
        />
      )}

      {toast && (
        <div className={`toast ${toast.err ? "err" : ""}`}>{toast.msg}</div>
      )}
    </div>
  );
}
