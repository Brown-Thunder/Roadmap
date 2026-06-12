"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import RoadmapBoard, { RoadmapBoardHandle } from "@/components/RoadmapBoard";
import UserMenu from "@/components/UserMenu";
import { Initiative } from "@/lib/types";

export default function ReviewClient({ initial }: { initial: Initiative[] }) {
  const boardRef = useRef<RoadmapBoardHandle>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);

  async function publish() {
    setBusy(true);
    setMsg(null);
    try {
      const image = await boardRef.current?.capturePng();
      if (!image) throw new Error("Could not capture board snapshot");
      const team = boardRef.current?.getTeam() ?? "All";

      const res = await fetch("/api/slack/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team, draft: false, image }),
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
    <div className="page">
      <div className="topbar">
        <div className="topbar-row topbar-row-main">
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Review weekly snapshot</h1>
            <div className="sub">
              This is exactly what will be posted to the channel. Approve to publish.
            </div>
          </div>
          <nav className="topbar-actions">
            <UserMenu />
            <Link href="/" className="btn btn-soft">
              ← Back to board
            </Link>
            <button className="btn slack" onClick={publish} disabled={busy}>
              {busy ? "Publishing…" : "Approve & post to #temp-roadmap"}
            </button>
          </nav>
        </div>
      </div>

      <RoadmapBoard ref={boardRef} initial={initial} readOnly />

      {msg && (
        <div className={`toast ${msg.err ? "err" : ""}`}>{msg.text}</div>
      )}
    </div>
  );
}
