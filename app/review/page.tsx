"use client";

import { useState } from "react";

export default function ReviewPage() {
  const [team, setTeam] = useState("All");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [stamp, setStamp] = useState(Date.now());

  async function publish() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/slack/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team, draft: false }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Publish failed");
      setMsg({ text: "Published to #temp-roadmap ✓" });
    } catch (e: any) {
      setMsg({ text: e?.message || "Publish failed", err: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 1000 }}>
      <div className="topbar">
        <div>
          <h1>Review weekly snapshot</h1>
          <div className="sub">
            This is exactly what will be posted to the channel. Approve to publish.
          </div>
        </div>
        <div className="controls">
          <select
            className="select"
            value={team}
            onChange={(e) => {
              setTeam(e.target.value);
              setStamp(Date.now());
            }}
          >
            <option value="All">All teams</option>
            <option value="Host/Platform">Host/Platform</option>
            <option value="Customer">Customer</option>
          </select>
          <a className="btn" href="/">
            ← Back to board
          </a>
          <button className="btn primary" onClick={publish} disabled={busy}>
            {busy ? "Publishing…" : "Approve & post to #temp-roadmap"}
          </button>
        </div>
      </div>

      <div
        style={{
          border: "1px solid var(--line)",
          borderRadius: 14,
          overflow: "hidden",
          background: "#fff",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={stamp}
          src={`/api/og?team=${encodeURIComponent(team)}&t=${stamp}`}
          alt="Roadmap snapshot preview"
          style={{ width: "100%", display: "block" }}
        />
      </div>

      {msg && (
        <div className={`toast ${msg.err ? "err" : ""}`}>{msg.text}</div>
      )}
    </div>
  );
}
