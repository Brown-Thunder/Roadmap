"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import {
  Initiative,
  TIMEFRAMES,
  STATUS_COLORS,
  TIMEFRAME_ACCENT,
  TEAM_OPTIONS,
  Timeframe,
} from "@/lib/types";
import {
  buildGroups,
  cellItems,
  filterByTeam,
  filterByAssignee,
  getAllAssignees,
} from "@/lib/roadmap";
import InitiativeModal from "./InitiativeModal";

function getMondayOf(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function getWeekRanges(): Record<Timeframe, string> {
  const today = new Date();
  const thisMonday = getMondayOf(today);
  const thisFriday = new Date(thisMonday);
  thisFriday.setDate(thisMonday.getDate() + 4);
  const nextMonday = new Date(thisMonday);
  nextMonday.setDate(thisMonday.getDate() + 7);
  const nextFriday = new Date(nextMonday);
  nextFriday.setDate(nextMonday.getDate() + 4);
  const futureMonday = new Date(nextMonday);
  futureMonday.setDate(nextMonday.getDate() + 7);
  return {
    "This Week": `${fmtShort(thisMonday)} – ${fmtShort(thisFriday)}`,
    "Next Week": `${fmtShort(nextMonday)} – ${fmtShort(nextFriday)}`,
    Future: `${fmtShort(futureMonday)} onwards`,
  };
}

function droppableId(area: string, laneKey: string, tf: Timeframe) {
  return `${area}|||${laneKey}|||${tf}`;
}

function parseDroppableId(id: string): { area: string; laneKey: string; timeframe: Timeframe } {
  const [area, laneKey, timeframe] = id.split("|||");
  return { area, laneKey, timeframe: timeframe as Timeframe };
}

const TF_INDEX: Record<Timeframe, number> = {
  "This Week": 0,
  "Next Week": 1,
  Future: 2,
};

// Status pill colours — bg / fg / border
const STATUS_PILL: Record<string, { bg: string; fg: string; border: string }> = {
  "In Flight": { bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe" },
  "To Do":     { bg: "#f1f5f9", fg: "#475569", border: "#e2e8f0" },
  "At Risk":   { bg: "#fff7ed", fg: "#c2410c", border: "#fed7aa" },
  Blocked:     { bg: "#fef2f2", fg: "#b91c1c", border: "#fecaca" },
  Done:        { bg: "#f0fdf4", fg: "#15803d", border: "#bbf7d0" },
};

export default function RoadmapBoard({
  initial,
  readOnly = false,
}: {
  initial: Initiative[];
  readOnly?: boolean;
}) {
  const [items, setItems] = useState<Initiative[]>(initial);
  const [team, setTeam] = useState<string>("All");
  const [assignee, setAssignee] = useState<string>("All");
  const [selected, setSelected] = useState<Initiative | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [extraAreas, setExtraAreas] = useState<string[]>([]);
  const [extraPods, setExtraPods] = useState<string[]>([]);
  const snapshotRef = useRef<HTMLDivElement>(null);

  const resizeRef = useRef<{
    id: string;
    startX: number;
    startDuration: number;
    cellWidth: number;
  } | null>(null);

  const weekRanges = useMemo(() => getWeekRanges(), []);
  const allAssignees = useMemo(() => getAllAssignees(items), [items]);
  const filtered = useMemo(
    () => filterByAssignee(filterByTeam(items, team), assignee),
    [items, team, assignee]
  );
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

  async function refreshData() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/initiatives");
      const data = await res.json();
      if (data.ok) setItems(data.initiatives);
      else throw new Error(data.error);
    } catch (e: any) {
      flash(e?.message || "Refresh failed", true);
    } finally {
      setRefreshing(false);
    }
  }

  function onSaved() {
    setSelected(null);
    setCreating(false);
    refreshData();
  }

  async function patchItem(id: string, patch: Partial<Initiative>) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it))
    );
    try {
      const res = await fetch(`/api/initiatives/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Update failed");
      }
    } catch (e: any) {
      flash(e?.message || "Update failed", true);
      setItems(initial);
    }
  }

  async function onDragEnd(result: DropResult) {
    if (!result.destination) return;

    const srcId = result.source.droppableId;
    const dstId = result.destination.droppableId;
    const { area: dstArea, laneKey: dstLane, timeframe: dstTf } = parseDroppableId(dstId);
    const draggedId = result.draggableId;

    const newItems = [...items];
    const draggedIdx = newItems.findIndex((i) => i.id === draggedId);
    if (draggedIdx === -1) return;

    const dragged = newItems[draggedIdx];

    let newPod = dragged.pod;
    let newArea = dragged.area;
    let newSpansPods = dragged.spansPods;

    if (dstArea === "Lockers") {
      if (dstLane === "shared") {
        newSpansPods = true;
        newPod = dragged.pod || "Internal Lockers";
      } else {
        newSpansPods = false;
        newPod = dstLane;
      }
      newArea = "Lockers";
    } else {
      newArea = dstArea;
      newPod = dstLane;
      newSpansPods = false;
    }

    const destCellItems = newItems
      .filter((i) => {
        if (i.id === draggedId) return false;
        if (i.area !== dstArea) return false;
        if (i.timeframe !== dstTf) return false;
        if (dstArea === "Lockers") {
          if (dstLane === "shared") return i.spansPods;
          return !i.spansPods && i.pod === dstLane;
        }
        return i.area === dstLane || i.pod === dstLane;
      })
      .sort((a, b) => a.order - b.order);

    destCellItems.splice(result.destination.index, 0, dragged);
    const patch: Partial<Initiative> = {
      area: newArea,
      pod: newPod,
      spansPods: newSpansPods,
      timeframe: dstTf,
      order: result.destination.index,
    };

    const orderUpdates: { id: string; order: number }[] = [];
    destCellItems.forEach((item, idx) => {
      const newOrder = idx * 10;
      if (item.id === draggedId) {
        patch.order = newOrder;
      } else {
        orderUpdates.push({ id: item.id, order: newOrder });
      }
    });

    setItems((prev) =>
      prev.map((it) => {
        if (it.id === draggedId) return { ...it, ...patch };
        const upd = orderUpdates.find((u) => u.id === it.id);
        if (upd) return { ...it, order: upd.order };
        return it;
      })
    );

    try {
      const res = await fetch(`/api/initiatives/${draggedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Update failed");
    } catch (e: any) {
      flash(e?.message || "Failed to save position", true);
      setItems(initial);
    }

    for (const upd of orderUpdates) {
      fetch(`/api/initiatives/${upd.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: upd.order }),
      }).catch(() => {});
    }
  }

  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent, id: string, currentDuration: number) => {
      e.stopPropagation();
      e.preventDefault();
      const cell = (e.currentTarget as HTMLElement)
        .closest(".cell") as HTMLElement | null;
      const cellWidth = cell ? cell.getBoundingClientRect().width : 200;
      resizeRef.current = { id, startX: e.clientX, startDuration: currentDuration, cellWidth };

      function onMouseMove(me: MouseEvent) {
        if (!resizeRef.current) return;
        const { startX, startDuration, cellWidth, id: rId } = resizeRef.current;
        const delta = me.clientX - startX;
        const addedCols = Math.round(delta / cellWidth);
        const newDuration = Math.max(1, Math.min(3, startDuration + addedCols));
        setItems((prev) =>
          prev.map((it) =>
            it.id === rId ? { ...it, durationWeeks: newDuration } : it
          )
        );
      }

      function onMouseUp(me: MouseEvent) {
        if (!resizeRef.current) return;
        const { startX, startDuration, cellWidth, id: rId } = resizeRef.current;
        const delta = me.clientX - startX;
        const addedCols = Math.round(delta / cellWidth);
        const newDuration = Math.max(1, Math.min(3, startDuration + addedCols));
        resizeRef.current = null;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        if (newDuration !== startDuration) {
          patchItem(rId, { durationWeeks: newDuration });
        }
      }

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    []
  );

  function buildSpanMap(allItems: Initiative[]) {
    const spanned = new Set<string>();
    for (const it of allItems) {
      if (it.durationWeeks <= 1) continue;
      const startIdx = TF_INDEX[it.timeframe];
      const laneKey = it.area === "Lockers"
        ? (it.spansPods ? "shared" : it.pod)
        : it.area;
      for (let d = 1; d < it.durationWeeks && startIdx + d < TIMEFRAMES.length; d++) {
        const tf = TIMEFRAMES[startIdx + d];
        spanned.add(`${it.area}|||${laneKey}|||${tf}|||${it.id}`);
      }
    }
    return spanned;
  }

  const spanMap = useMemo(() => buildSpanMap(filtered), [filtered]);

  // Simplified card — shows only: name, status pill, size badge, primary assignees
  function renderCard(it: Initiative, colSpan: number, drag: any, dragSnap: any) {
    const primaryList = it.primaryAssignees.split(",").map((s) => s.trim()).filter(Boolean);
    const pill = STATUS_PILL[it.status] ?? STATUS_PILL["To Do"];

    return (
      <div
        ref={drag?.innerRef}
        {...(drag?.draggableProps ?? {})}
        {...(!readOnly ? (drag?.dragHandleProps ?? {}) : {})}
        className={`card ${it.spansPods ? "shared" : ""} ${dragSnap?.isDragging ? "dragging" : ""}`}
        style={{
          borderLeftColor: STATUS_COLORS[it.status] || "#94a3b8",
          ...(colSpan > 1 ? { gridColumn: `span ${colSpan}`, position: "relative" } : {}),
          ...(drag?.draggableProps?.style ?? {}),
        }}
        onClick={() => setSelected(it)}
      >
        <div className="card-name">{it.name}</div>

        <div className="card-status-row">
          <span
            className="status-pill"
            style={{ background: pill.bg, color: pill.fg, borderColor: pill.border }}
          >
            <span
              className="status-dot"
              style={{ background: pill.fg, width: 6, height: 6 }}
            />
            {it.status}
          </span>
          {it.tShirtSize && (
            <span className="size-badge">{it.tShirtSize}</span>
          )}
        </div>

        {primaryList.length > 0 && (
          <div className="card-assignees">
            {primaryList.map((name) => (
              <span key={name} className="assignee-avatar">{name}</span>
            ))}
          </div>
        )}

        {!readOnly && (
          <div
            className="resize-handle"
            onMouseDown={(e) => onResizeMouseDown(e, it.id, it.durationWeeks)}
            title="Drag right edge to span weeks"
          />
        )}
      </div>
    );
  }

  function renderGroups() {
    return groups.map((g) => (
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
              const laneItems = cellItems(filtered, g.area, lane.key, tf);
              if (readOnly) {
                return (
                  <div className="cell" key={tf}>
                    {laneItems.length === 0 && <div className="empty">—</div>}
                    {laneItems.map((it) => {
                      const spanKey = `${g.area}|||${lane.key}|||${tf}|||${it.id}`;
                      if (spanMap.has(spanKey)) return null;
                      const colSpan = Math.min(it.durationWeeks, TIMEFRAMES.length - TF_INDEX[tf]);
                      return <div key={it.id}>{renderCard(it, colSpan, null, {})}</div>;
                    })}
                  </div>
                );
              }
              const dId = droppableId(g.area, lane.key, tf);
              return (
                <Droppable droppableId={dId} key={tf}>
                  {(provided, snapshot) => (
                    <div
                      className={`cell ${snapshot.isDraggingOver ? "cell-over" : ""}`}
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                    >
                      {laneItems.length === 0 && !snapshot.isDraggingOver && (
                        <div className="empty">—</div>
                      )}
                      {laneItems.map((it, idx) => {
                        const spanKey = `${g.area}|||${lane.key}|||${tf}|||${it.id}`;
                        if (spanMap.has(spanKey)) return null;
                        const colSpan = Math.min(it.durationWeeks, TIMEFRAMES.length - TF_INDEX[tf]);
                        return (
                          <Draggable key={it.id} draggableId={it.id} index={idx}>
                            {(drag, dragSnap) => renderCard(it, colSpan, drag, dragSnap)}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              );
            })}
          </div>
        ))}
      </div>
    ));
  }

  function renderBoard() {
    if (readOnly) return renderGroups();
    return <DragDropContext onDragEnd={onDragEnd}>{renderGroups()}</DragDropContext>;
  }

  return (
    <div className="page">
      {/* ── Top bar ────────────────────────────────────────── */}
      <div className="topbar">
        <div className="topbar-left">
          {/* Stasher brand lockup */}
          <div className="brand-lockup">
            {/* Icon */}
            <svg width="28" height="24" viewBox="0 0 122 104" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M105.793 26.3962H86.4293C85.253 13.2727 74.1686 2.95496 60.7769 2.95496C47.34 2.95496 36.3009 13.2727 35.1246 26.3962H15.7609C8.97452 26.3962 3.45496 31.9171 3.45496 38.7051V88.529C3.45496 95.3169 8.97452 100.838 15.7609 100.838H105.838C112.625 100.838 118.144 95.3169 118.144 88.529V38.7051C118.144 31.9171 112.579 26.3962 105.793 26.3962ZM49.8283 31.8266C51.1856 36.6234 55.5741 40.1079 60.7769 40.1079C65.9798 40.1079 70.3683 36.5782 71.7256 31.8266H80.8645C79.281 41.194 70.685 49.7016 61.6365 58.6618C61.3651 58.9333 61.0484 59.2048 60.7769 59.5216C60.5055 59.2501 60.1888 58.9785 59.9173 58.6618C50.8689 49.7016 42.2728 41.194 40.6894 31.8266H49.8283ZM54.8502 28.7493C54.8502 25.4911 57.5195 22.8212 60.7769 22.8212C64.0344 22.8212 66.7037 25.4911 66.7037 28.7493C66.7037 32.0076 64.0344 34.6775 60.7769 34.6775C57.5195 34.6775 54.8502 32.0076 54.8502 28.7493ZM56.117 62.5083C57.0218 63.4134 57.9719 64.3184 58.8768 65.2687C59.3744 65.7665 60.0983 66.0833 60.7769 66.0833C61.4556 66.0833 62.1795 65.8118 62.6771 65.2687C63.582 64.3637 64.532 63.4134 65.4369 62.5083C75.3902 52.6431 84.8458 43.2304 86.3388 31.8266H95.2968V95.4527H26.2571V31.8266H35.215C36.6628 43.2756 46.1184 52.6431 56.117 62.5083ZM60.7769 8.4306C71.1827 8.4306 79.8239 16.3047 80.955 26.4414H71.8613C70.7755 21.2825 66.206 17.436 60.7317 17.436C55.2574 17.436 50.6879 21.2825 49.6021 26.4414H40.5084C41.7299 16.3047 50.3712 8.4306 60.7769 8.4306ZM8.8388 88.5742V38.7051C8.8388 34.9038 11.9153 31.8266 15.7156 31.8266H20.828V95.4527H15.7156C11.9605 95.4527 8.8388 92.3755 8.8388 88.5742ZM112.715 88.5742C112.715 92.3755 109.639 95.4527 105.838 95.4527H100.726V31.8266H105.838C109.639 31.8266 112.715 34.9038 112.715 38.7051V88.5742Z" fill="#102A56"/>
            </svg>
            {/* Wordmark */}
            <span className="brand-wordmark">Stasher</span>
            {/* Divider + product label */}
            <span className="brand-divider" />
            <span className="brand-product">Roadmap</span>
          </div>
          <div className="sub">
            {readOnly
              ? "Click any card to view details."
              : "Drag cards to move them. Drag the right edge of a card to span multiple weeks."}
          </div>
        </div>

        <div className="controls">
          {/* Filters */}
          <div className="filter-group">
            <span className="filter-label">Team</span>
            <select
              className="select"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
            >
              <option value="All">All teams</option>
              {TEAM_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <span className="filter-label">Assignee</span>
            <select
              className="select"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              <option value="All">Everyone</option>
              {allAssignees.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <button
            className="btn icon-btn"
            onClick={refreshData}
            disabled={refreshing}
            title="Refresh data from Airtable"
            style={{ alignSelf: "flex-end", marginBottom: 0 }}
          >
            <span className={refreshing ? "spin" : ""}>↻</span>
          </button>

          {!readOnly && (
            <>
              <div className="controls-divider" />

              <button
                className="btn primary"
                onClick={() => setCreating(true)}
                style={{ alignSelf: "flex-end" }}
              >
                + Add initiative
              </button>

              <button
                className="btn"
                onClick={sendDraftForApproval}
                disabled={!!busy}
                title="Send a draft screenshot to your Slack DMs before sharing"
                style={{ alignSelf: "flex-end" }}
              >
                Send draft
              </button>
              <button
                className="btn"
                onClick={postToSlack}
                disabled={!!busy}
                style={{ alignSelf: "flex-end" }}
              >
                {busy || "Post to Slack"}
              </button>
            </>
          )}

          {readOnly && (
            <span className="readonly-badge" style={{ alignSelf: "flex-end" }}>
              View only
            </span>
          )}
        </div>
      </div>

      {/* ── Board ──────────────────────────────────────────── */}
      <div className="board-wrap">
        {/* Title bar inside snapshot region */}
        <div className="board-title-bar" ref={snapshotRef}>
          <div className="brand-lockup">
            <svg width="22" height="19" viewBox="0 0 122 104" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M105.793 26.3962H86.4293C85.253 13.2727 74.1686 2.95496 60.7769 2.95496C47.34 2.95496 36.3009 13.2727 35.1246 26.3962H15.7609C8.97452 26.3962 3.45496 31.9171 3.45496 38.7051V88.529C3.45496 95.3169 8.97452 100.838 15.7609 100.838H105.838C112.625 100.838 118.144 95.3169 118.144 88.529V38.7051C118.144 31.9171 112.579 26.3962 105.793 26.3962ZM49.8283 31.8266C51.1856 36.6234 55.5741 40.1079 60.7769 40.1079C65.9798 40.1079 70.3683 36.5782 71.7256 31.8266H80.8645C79.281 41.194 70.685 49.7016 61.6365 58.6618C61.3651 58.9333 61.0484 59.2048 60.7769 59.5216C60.5055 59.2501 60.1888 58.9785 59.9173 58.6618C50.8689 49.7016 42.2728 41.194 40.6894 31.8266H49.8283ZM54.8502 28.7493C54.8502 25.4911 57.5195 22.8212 60.7769 22.8212C64.0344 22.8212 66.7037 25.4911 66.7037 28.7493C66.7037 32.0076 64.0344 34.6775 60.7769 34.6775C57.5195 34.6775 54.8502 32.0076 54.8502 28.7493ZM56.117 62.5083C57.0218 63.4134 57.9719 64.3184 58.8768 65.2687C59.3744 65.7665 60.0983 66.0833 60.7769 66.0833C61.4556 66.0833 62.1795 65.8118 62.6771 65.2687C63.582 64.3637 64.532 63.4134 65.4369 62.5083C75.3902 52.6431 84.8458 43.2304 86.3388 31.8266H95.2968V95.4527H26.2571V31.8266H35.215C36.6628 43.2756 46.1184 52.6431 56.117 62.5083ZM60.7769 8.4306C71.1827 8.4306 79.8239 16.3047 80.955 26.4414H71.8613C70.7755 21.2825 66.206 17.436 60.7317 17.436C55.2574 17.436 50.6879 21.2825 49.6021 26.4414H40.5084C41.7299 16.3047 50.3712 8.4306 60.7769 8.4306ZM8.8388 88.5742V38.7051C8.8388 34.9038 11.9153 31.8266 15.7156 31.8266H20.828V95.4527H15.7156C11.9605 95.4527 8.8388 92.3755 8.8388 88.5742ZM112.715 88.5742C112.715 92.3755 109.639 95.4527 105.838 95.4527H100.726V31.8266H105.838C109.639 31.8266 112.715 34.9038 112.715 38.7051V88.5742Z" fill="#102A56"/>
            </svg>
            <span className="brand-wordmark" style={{ fontSize: 14 }}>Stasher</span>
            <span className="brand-divider" />
            <span className="brand-product" style={{ fontSize: 13 }}>
              Roadmap{team !== "All" && <span style={{ color: "#94a3b8", fontWeight: 500 }}> · {team}</span>}
            </span>
          </div>
          <span className="board-date">
            {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
          </span>
        </div>

        <div className="board">
          {/* Column headers */}
          <div className="grid">
            <div className="corner" />
            {TIMEFRAMES.map((tf) => (
              <div className="col-head" key={tf}>
                <div className="col-head-title">
                  <span className="pill" style={{ background: TIMEFRAME_ACCENT[tf] }} />
                  {tf}
                </div>
                <div className="col-head-date">{weekRanges[tf]}</div>
              </div>
            ))}
          </div>

          {renderBoard()}
        </div>

        {/* Status legend inside the board panel */}
        <div className="legend">
          <strong style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginRight: 4 }}>
            Status:
          </strong>
          {Object.entries(STATUS_COLORS).map(([s, c]) => (
            <div className="item" key={s}>
              <span className="status-dot" style={{ background: c }} />
              {s}
            </div>
          ))}
          <div className="item" style={{ marginLeft: 8, borderLeft: "1px solid #e2e8f0", paddingLeft: 12 }}>
            <span className="status-dot" style={{ background: "#f59e0b" }} />
            Amber card = spans both pods
          </div>
        </div>
      </div>

      {/* ── Modal ──────────────────────────────────────────── */}
      {(selected || (!readOnly && creating)) && (
        <InitiativeModal
          initiative={selected}
          onClose={() => {
            setSelected(null);
            setCreating(false);
          }}
          onSaved={onSaved}
          flash={flash}
          readOnly={readOnly}
          extraAreas={extraAreas}
          extraPods={extraPods}
          onAddArea={(a) => setExtraAreas((prev) => prev.includes(a) ? prev : [...prev, a])}
          onAddPod={(p) => setExtraPods((prev) => prev.includes(p) ? prev : [...prev, p])}
        />
      )}

      {toast && (
        <div className={`toast ${toast.err ? "err" : ""}`}>{toast.msg}</div>
      )}
    </div>
  );
}
