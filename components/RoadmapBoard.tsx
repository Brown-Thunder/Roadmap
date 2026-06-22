"use client";

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from "react";
import Link from "next/link";
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
  TIMEFRAME_ACCENT,
  TEAM_OPTIONS,
  Timeframe,
  colorForAssignee,
  primaryAssigneeOf,
  AssigneeColor,
  assignCardCodes,
  DEP_TYPE_LABELS,
} from "@/lib/types";
import {
  buildGroups,
  cellItems,
  filterByTeam,
  filterByAssignee,
  getAllAssignees,
} from "@/lib/roadmap";
import InitiativeModal from "./InitiativeModal";
import UserMenu from "./UserMenu";

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

// ── Dependency arrow overlay ─────────────────────────────────────────────────

function DepArrows({
  items,
  codeMap,
  blockedByMap,
  cardRefs,
  boardRef,
  hoveredId,
  showAll,
  traceChain,
}: {
  items: Initiative[];
  codeMap: Map<string, string>;
  blockedByMap: Map<string, string[]>;
  cardRefs: Record<string, HTMLElement | null>;
  boardRef: HTMLDivElement | null;
  hoveredId: string | null;
  showAll: boolean;
  traceChain: Set<string>;
}) {
  if (!boardRef) return null;
  const boardRect = boardRef.getBoundingClientRect();

  const arrows: React.ReactElement[] = [];

  for (const it of items) {
    const deps = blockedByMap.get(it.id) ?? [];
    if (deps.length === 0) continue;

    for (const blockerId of deps) {
      // In show-all mode: draw everything. In hover mode: draw if either end is in chain.
      if (!showAll && !(traceChain.has(it.id) && traceChain.has(blockerId))) continue;

      const fromEl = cardRefs[blockerId];
      const toEl = cardRefs[it.id];
      if (!fromEl || !toEl) continue;

      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();

      // Arrow from right edge of blocker → left edge of blocked
      const x1 = fromRect.right - boardRect.left;
      const y1 = fromRect.top - boardRect.top + fromRect.height / 2;
      const x2 = toRect.left - boardRect.left;
      const y2 = toRect.top - boardRect.top + toRect.height / 2;

      // Bezier curve handle length
      const dx = Math.abs(x2 - x1) * 0.4 + 30;
      const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
      const highlighted = hoveredId !== null && traceChain.has(it.id) && traceChain.has(blockerId);
      const color = highlighted ? "#6366f1" : "#94a3b8";
      const opacity = showAll && hoveredId !== null && !highlighted ? 0.2 : 0.7;

      arrows.push(
        <g key={`${blockerId}->${it.id}`}>
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={highlighted ? 2 : 1.5}
            strokeDasharray={highlighted ? undefined : "4 3"}
            opacity={opacity}
          />
          {/* Arrowhead at destination */}
          <polygon
            points={`${x2},${y2} ${x2 - 7},${y2 - 4} ${x2 - 7},${y2 + 4}`}
            fill={color}
            opacity={opacity}
          />
        </g>
      );
    }
  }

  if (arrows.length === 0) return null;

  return (
    <svg
      className="dep-overlay"
      style={{
        position: "absolute",
        top: 0, left: 0,
        width: boardRect.width,
        height: boardRect.height,
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      <defs>
        <marker id="arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <polygon points="0 0, 7 3.5, 0 7" fill="#6366f1" />
        </marker>
      </defs>
      {arrows}
    </svg>
  );
}

export type RoadmapBoardHandle = {
  capturePng: () => Promise<string>;
  getTeam: () => string;
};

const RoadmapBoard = forwardRef<
  RoadmapBoardHandle,
  { initial: Initiative[]; readOnly?: boolean; canManageEditors?: boolean }
>(function RoadmapBoard({ initial, readOnly = false, canManageEditors = false }, ref) {
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
  // Slack preview modal state
  const [slackDropdownOpen, setSlackDropdownOpen] = useState(false);
  const [slackPreview, setSlackPreview] = useState<{
    image: string;
    message: string;
    team: string;
  } | null>(null);
  const [editedMessage, setEditedMessage] = useState("");
  // During snapshot capture we temporarily override the team filter to match
  // what was selected in the Slack dropdown, without changing the visible UI.
  const [snapshotTeam, setSnapshotTeam] = useState<string | null>(null);
  const slackDropdownRef = useRef<HTMLDivElement>(null);
  // Dependency trace state
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showAllLinks, setShowAllLinks] = useState(false);
  // Card element refs for drawing dep arrows (id → DOM element)
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});
  const boardRef = useRef<HTMLDivElement>(null);
  // Live resize preview: while dragging the handle, track current visual duration
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [resizingDuration, setResizingDuration] = useState(1);
  // Measured heights of spanning cards, keyed by id — used to reserve space
  // in the columns a spanning card overlaps so other cards drop below it.
  const [spanHeights, setSpanHeights] = useState<Record<string, number>>({});
  // Per-person colours assigned in the People table (name lowercased → swatch).
  const [colourMap, setColourMap] = useState<Record<string, AssigneeColor>>({});
  const snapshotRef = useRef<HTMLDivElement>(null);

  const measureSpan = useCallback((id: string, el: HTMLElement | null) => {
    if (!el) return;
    const h = el.getBoundingClientRect().height;
    setSpanHeights((prev) => (prev[id] === h ? prev : { ...prev, [id]: h }));
  }, []);

  const resizeRef = useRef<{
    id: string;
    startX: number;
    startDuration: number;
    cellWidth: number;
  } | null>(null);

  // Warm the GitHub board cache in the background on mount so the issue picker
  // is ready by the time the user opens "Add initiative" (the first crawl is ~9s).
  useEffect(() => {
    if (readOnly) return;
    fetch("/api/github/issues").catch(() => {});
  }, [readOnly]);

  // Load per-person colours so cards/legend reflect each assignee's distinct colour.
  const loadColours = useCallback(() => {
    fetch("/api/people", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => { if (data.ok && data.colours) setColourMap(data.colours); })
      .catch(() => {});
  }, []);
  useEffect(() => { loadColours(); }, [loadColours]);

  // Close Slack dropdown when clicking outside it
  useEffect(() => {
    if (!slackDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (slackDropdownRef.current && !slackDropdownRef.current.contains(e.target as Node)) {
        setSlackDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [slackDropdownOpen]);

  const weekRanges = useMemo(() => getWeekRanges(), []);
  // Completed items live only in the History view, never on the board.
  const activeItems = useMemo(() => items.filter((i) => !i.completedDate), [items]);
  const allAssignees = useMemo(() => getAllAssignees(activeItems), [activeItems]);
  const filtered = useMemo(
    () => filterByAssignee(filterByTeam(activeItems, snapshotTeam ?? team), assignee),
    [activeItems, team, snapshotTeam, assignee]
  );
  const groups = useMemo(() => buildGroups(filtered), [filtered]);

  // Build a stable id→cardCode map from the full items list.
  const codeMap = useMemo(() => {
    const codes = assignCardCodes(items);
    return codes;
  }, [items]);

  // id → DepLinks going out from this initiative
  const depLinksMap = useMemo(() => {
    const m = new Map<string, typeof items[0]["depLinks"]>();
    for (const it of items) m.set(it.id, it.depLinks ?? []);
    return m;
  }, [items]);

  // id → list of {type, fromId} — what points AT this initiative (reverse links)
  const reverseDepMap = useMemo(() => {
    const m = new Map<string, { type: typeof items[0]["depLinks"][0]["type"]; fromId: string }[]>();
    for (const it of items) {
      for (const dep of (it.depLinks ?? [])) {
        if (!m.has(dep.id)) m.set(dep.id, []);
        m.get(dep.id)!.push({ type: dep.type, fromId: it.id });
      }
    }
    return m;
  }, [items]);

  // Keep blockedByMap as a flat id[] for arrow-drawing / trace compat
  const blockedByMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const it of items) m.set(it.id, (it.depLinks ?? []).map((d) => d.id));
    return m;
  }, [items]);

  const blocksMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const it of items) {
      for (const dep of (it.depLinks ?? [])) {
        if (!m.has(dep.id)) m.set(dep.id, []);
        m.get(dep.id)!.push(it.id);
      }
    }
    return m;
  }, [items]);

  // BFS from a hovered card — collect full transitive chain (both directions).
  const traceChain = useMemo((): Set<string> => {
    if (!hoveredId) return new Set();
    const visited = new Set<string>();
    const queue = [hoveredId];
    while (queue.length) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      for (const dep of (blockedByMap.get(id) ?? [])) queue.push(dep);
      for (const dep of (blocksMap.get(id) ?? [])) queue.push(dep);
    }
    return visited;
  }, [hoveredId, blockedByMap, blocksMap]);

  // Unique primary assignees among the visible cards — drives the colour key.
  const ownerKey = useMemo(() => {
    const names = new Set<string>();
    for (const it of filtered) {
      const owner = primaryAssigneeOf(it.primaryAssignees);
      if (owner) names.add(owner);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [filtered]);

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
      // Omit edit-only chrome so the Slack image matches the read-only board.
      filter: (node) =>
        !(node instanceof HTMLElement && node.classList.contains("resize-handle")),
    });
  }

  useImperativeHandle(ref, () => ({
    capturePng,
    getTeam: () => team,
  }), [team]);

  async function openSlackPreview(previewTeam: string) {
    setSlackDropdownOpen(false);
    setBusy("Generating preview…");
    // Apply the preview team filter to the board, wait for React to repaint,
    // then capture. Restore the filter afterwards regardless of outcome.
    setSnapshotTeam(previewTeam);
    try {
      // Two rAFs: first lets React flush state, second waits for the browser paint.
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const [image, previewRes] = await Promise.all([
        capturePng(),
        fetch("/api/slack/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ team: previewTeam }),
        }),
      ]);
      const data = await previewRes.json();
      if (!previewRes.ok || !data.ok) throw new Error(data.error || "Preview failed");
      setSlackPreview({ image, message: data.message, team: previewTeam });
      setEditedMessage(data.message);
    } catch (e: any) {
      flash(e?.message || "Failed to generate preview", true);
    } finally {
      setSnapshotTeam(null);
      setBusy(null);
    }
  }

  async function confirmPostToSlack() {
    if (!slackPreview) return;
    try {
      setBusy("Posting to Slack…");
      const res = await fetch("/api/slack/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: slackPreview.image,
          team: slackPreview.team,
          message: editedMessage,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Slack post failed");
      setSlackPreview(null);
      flash("Posted to Slack ✓");
    } catch (e: any) {
      flash(e?.message || "Failed to post to Slack", true);
    } finally {
      setBusy(null);
    }
  }

  async function refreshData() {
    setRefreshing(true);
    loadColours(); // also pull any new/changed assignee colours
    try {
      const res = await fetch("/api/initiatives", { cache: "no-store" });
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

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent, id: string, currentDuration: number) => {
      e.stopPropagation();
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      // Measure one column width from the lane-row grid
      const laneRow = (e.currentTarget as HTMLElement)
        .closest(".lane-row") as HTMLElement | null;
      const grid = laneRow ?? (e.currentTarget as HTMLElement).closest(".cell") as HTMLElement | null;
      // Each of the 3 timeframe columns is 1fr of (total - 180px label)
      const totalW = grid ? grid.getBoundingClientRect().width : 800;
      const cellWidth = (totalW - 180) / 3;

      resizeRef.current = { id, startX: e.clientX, startDuration: currentDuration, cellWidth };
      setResizingId(id);
      setResizingDuration(currentDuration);

      function onPointerMove(pe: PointerEvent) {
        if (!resizeRef.current) return;
        const { startX, startDuration, cellWidth } = resizeRef.current;
        const delta = pe.clientX - startX;
        const addedCols = Math.floor((delta + cellWidth * 0.25) / cellWidth);
        const newDuration = Math.max(1, Math.min(3, startDuration + addedCols));
        setResizingDuration(newDuration);
      }

      function onPointerUp(pe: PointerEvent) {
        if (!resizeRef.current) return;
        const { startX, startDuration, cellWidth, id: rId } = resizeRef.current;
        const delta = pe.clientX - startX;
        const addedCols = Math.floor((delta + cellWidth * 0.25) / cellWidth);
        const newDuration = Math.max(1, Math.min(3, startDuration + addedCols));
        resizeRef.current = null;
        setResizingId(null);
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
        if (newDuration !== startDuration) {
          patchItem(rId, { durationWeeks: newDuration });
        }
      }

      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
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

  // Simplified card — shows only: name, status pill, size badge, primary assignees.
  // The card is COLOURED by its first primary assignee.
  function renderCard(it: Initiative, colSpan: number, drag: any, dragSnap: any) {
    const pill = STATUS_PILL[it.status] ?? STATUS_PILL["To Do"];
    const owner = primaryAssigneeOf(it.primaryAssignees);
    const ac = colorForAssignee(owner, colourMap);
    const code = codeMap.get(it.id) ?? it.cardCode;
    const idToName = (bid: string) => items.find((i) => i.id === bid)?.name ?? "?";
    const outDeps = it.depLinks ?? [];
    const inDeps = reverseDepMap.get(it.id) ?? [];
    const hasDeps = outDeps.length > 0 || inDeps.length > 0;
    const isTracing = hoveredId !== null;
    const inTrace = isTracing && traceChain.has(it.id);

    return (
      <div
        ref={(el) => {
          if (drag?.innerRef) drag.innerRef(el);
          cardRefs.current[it.id] = el;
        }}
        {...(drag?.draggableProps ?? {})}
        {...(!readOnly ? (drag?.dragHandleProps ?? {}) : {})}
        className={`card ${it.spansPods ? "shared" : ""} ${dragSnap?.isDragging ? "dragging" : ""} ${colSpan > 1 ? "spanning" : ""} ${it.priority === "High" ? "has-priority-flag" : ""} ${inTrace ? "in-trace" : ""}`}
        style={{
          // Colour the card by its primary assignee
          borderLeftColor: ac.accent,
          background: ac.bg,
          ...(drag?.draggableProps?.style ?? {}),
        }}
        onClick={() => setSelected(it)}
        onMouseEnter={() => { if (hasDeps) setHoveredId(it.id); }}
        onMouseLeave={() => setHoveredId(null)}
      >
        {it.priority === "High" && (
          <span className="priority-flag" title="High priority" aria-label="High priority">!</span>
        )}

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
          {it.primaryAssignees && it.primaryAssignees.split(",").map((a) => a.trim()).filter(Boolean).map((a) => (
            <span
              key={a}
              className="card-assignee-chip"
              style={{ color: ac.fg, background: "transparent", borderColor: ac.border }}
            >
              <span className="card-assignee-initial" style={{ background: ac.border, color: ac.fg }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="12" cy="8" r="4"/>
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                </svg>
              </span>
              {a}
            </span>
          ))}
          {it.comments && it.comments.length > 0 && (
            <span className="comment-badge" title={`${it.comments.length} comment${it.comments.length === 1 ? "" : "s"}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {it.comments.length}
            </span>
          )}
        </div>

        {hasDeps && (
          <div className="dep-chip-row">
            {outDeps.map((dep) => {
              const name = idToName(dep.id);
              return (
                <span key={`out-${dep.id}`} className={`dep-chip dep-${dep.type}`} title={`${DEP_TYPE_LABELS[dep.type]}: ${name}`}>
                  {DEP_TYPE_LABELS[dep.type]}: {name}
                </span>
              );
            })}
            {inDeps.map((dep) => {
              const name = idToName(dep.fromId);
              return (
                <span key={`in-${dep.fromId}`} className="dep-chip dep-reverse" title={`${name} is ${DEP_TYPE_LABELS[dep.type].toLowerCase()} this`}>
                  blocks: {name}
                </span>
              );
            })}
          </div>
        )}

        {!readOnly && (
          <div
            className="resize-handle"
            onPointerDown={(e) => onResizePointerDown(e, it.id, it.durationWeeks)}
            title="Drag to extend across weeks"
            aria-label="Drag to extend across weeks"
          >
            <svg width="10" height="16" viewBox="0 0 10 16" fill="none" aria-hidden="true">
              <circle cx="2.5" cy="3" r="1.2" fill="currentColor" />
              <circle cx="7.5" cy="3" r="1.2" fill="currentColor" />
              <circle cx="2.5" cy="8" r="1.2" fill="currentColor" />
              <circle cx="7.5" cy="8" r="1.2" fill="currentColor" />
              <circle cx="2.5" cy="13" r="1.2" fill="currentColor" />
              <circle cx="7.5" cy="13" r="1.2" fill="currentColor" />
            </svg>
          </div>
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
        {g.lanes.map((lane) => {
          // For each timeframe column index, compute how much vertical space a
          // spanning card from an EARLIER column reserves at the top. This is
          // what pushes other cards down so nothing else has to move.
          // reservedTop[colIdx] = height (px) to insert as a spacer at the top.
          const reservedTop: Record<number, number> = {};
          for (let ci = 0; ci < TIMEFRAMES.length; ci++) {
            const startTf = TIMEFRAMES[ci];
            const starters = cellItems(filtered, g.area, lane.key, startTf).filter((it) => {
              const spanKey = `${g.area}|||${lane.key}|||${startTf}|||${it.id}`;
              return !spanMap.has(spanKey);
            });
            for (const it of starters) {
              const dur = it.id === resizingId ? resizingDuration : it.durationWeeks;
              const colSpan = Math.min(dur, TIMEFRAMES.length - ci);
              if (colSpan <= 1) continue;
              const h = spanHeights[it.id] ?? 64;
              // Reserve the band height in the columns it overflows INTO (not its
              // origin). The flex `gap` then separates it from cards below, matching
              // how the origin column stacks its own cards under the spanning card.
              for (let d = 1; d < colSpan; d++) {
                const overlapIdx = ci + d;
                reservedTop[overlapIdx] = Math.max(reservedTop[overlapIdx] ?? 0, h);
              }
            }
          }

          return (
            <div className="lane-row" key={lane.key} style={{ position: "relative" }}>
              <div className={`lane-label ${lane.shared ? "shared" : ""}`}>
                {lane.shared && <span className="shared-marker" aria-hidden />}
                {lane.shared ? (
                  <span>
                    Shared
                    <span className="shared-sub" style={{ display: "block" }}>
                      Internal + 3rd Party
                    </span>
                  </span>
                ) : (
                  lane.label
                )}
              </div>

              {/* Drop-target cells — always rendered so DnD works */}
              {TIMEFRAMES.map((tf, colIdx) => {
                const rawItems = cellItems(filtered, g.area, lane.key, tf).filter((it) => {
                  const spanKey = `${g.area}|||${lane.key}|||${tf}|||${it.id}`;
                  return !spanMap.has(spanKey);
                });
                // Float multi-week (spanning) cards to the top of their origin cell
                // so the spanning band aligns with the reserved spacers in the
                // columns it overflows into.
                const laneItems = [...rawItems].sort((a, b) => {
                  const da = (a.id === resizingId ? resizingDuration : a.durationWeeks) > 1 ? 0 : 1;
                  const db = (b.id === resizingId ? resizingDuration : b.durationWeeks) > 1 ? 0 : 1;
                  return da - db;
                });
                const reserved = reservedTop[colIdx] ?? 0;

                // Spacer to push this column's cards below an incoming spanning band
                const spacer = reserved > 0 ? (
                  <div style={{ height: reserved, flexShrink: 0 }} aria-hidden />
                ) : null;

                // Spanning cards stay IN NORMAL FLOW (so they keep their height
                // in the origin column and push origin siblings down) but widen to
                // overflow rightward across the columns they span.
                // Wrapper 100% = column content-box width (colWidth - 16px padding).
                // To span N columns we need: N*colWidth + (N-1) border - 16px padding,
                // which works out to N*100% + 17*(N-1)px.
                const spanWrapStyle = (colSpan: number, dragging: boolean): React.CSSProperties =>
                  colSpan > 1
                    ? {
                        position: "relative",
                        width: `calc(${colSpan * 100}% + ${17 * (colSpan - 1)}px)`,
                        zIndex: dragging ? 9999 : 3,
                      }
                    : {};

                if (readOnly) {
                  return (
                    <div className="cell" key={tf} style={{ position: "relative" }}>
                      {spacer}
                      {laneItems.length === 0 && reserved === 0 && <div className="empty">—</div>}
                      {laneItems.map((it) => {
                        const dur = it.id === resizingId ? resizingDuration : it.durationWeeks;
                        const colSpan = Math.min(dur, TIMEFRAMES.length - colIdx);
                        return (
                          <div
                            key={it.id}
                            ref={colSpan > 1 ? (el) => measureSpan(it.id, el) : undefined}
                            style={spanWrapStyle(colSpan, false)}
                          >
                            {renderCard(it, colSpan, null, {})}
                          </div>
                        );
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
                        style={{ position: "relative" }}
                      >
                        {spacer}
                        {laneItems.length === 0 && reserved === 0 && !snapshot.isDraggingOver && (
                          <div className="empty">—</div>
                        )}
                        {laneItems.map((it, idx) => {
                          const dur = it.id === resizingId ? resizingDuration : it.durationWeeks;
                          const colSpan = Math.min(dur, TIMEFRAMES.length - colIdx);
                          return (
                            <Draggable key={it.id} draggableId={it.id} index={idx}>
                              {(drag, dragSnap) => (
                                <div
                                  ref={colSpan > 1 ? (el) => measureSpan(it.id, el) : undefined}
                                  style={spanWrapStyle(colSpan, dragSnap.isDragging)}
                                >
                                  {renderCard(it, colSpan, drag, dragSnap)}
                                </div>
                              )}
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
          );
        })}
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
      <header className="topbar">
        {/* Row 1: brand + global nav/actions */}
        <div className="topbar-row topbar-row-main">
          <div className="brand-lockup">
            <svg className="brand-icon" width="30" height="26" viewBox="0 0 122 104" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M105.793 26.3962H86.4293C85.253 13.2727 74.1686 2.95496 60.7769 2.95496C47.34 2.95496 36.3009 13.2727 35.1246 26.3962H15.7609C8.97452 26.3962 3.45496 31.9171 3.45496 38.7051V88.529C3.45496 95.3169 8.97452 100.838 15.7609 100.838H105.838C112.625 100.838 118.144 95.3169 118.144 88.529V38.7051C118.144 31.9171 112.579 26.3962 105.793 26.3962ZM49.8283 31.8266C51.1856 36.6234 55.5741 40.1079 60.7769 40.1079C65.9798 40.1079 70.3683 36.5782 71.7256 31.8266H80.8645C79.281 41.194 70.685 49.7016 61.6365 58.6618C61.3651 58.9333 61.0484 59.2048 60.7769 59.5216C60.5055 59.2501 60.1888 58.9785 59.9173 58.6618C50.8689 49.7016 42.2728 41.194 40.6894 31.8266H49.8283ZM54.8502 28.7493C54.8502 25.4911 57.5195 22.8212 60.7769 22.8212C64.0344 22.8212 66.7037 25.4911 66.7037 28.7493C66.7037 32.0076 64.0344 34.6775 60.7769 34.6775C57.5195 34.6775 54.8502 32.0076 54.8502 28.7493ZM56.117 62.5083C57.0218 63.4134 57.9719 64.3184 58.8768 65.2687C59.3744 65.7665 60.0983 66.0833 60.7769 66.0833C61.4556 66.0833 62.1795 65.8118 62.6771 65.2687C63.582 64.3637 64.532 63.4134 65.4369 62.5083C75.3902 52.6431 84.8458 43.2304 86.3388 31.8266H95.2968V95.4527H26.2571V31.8266H35.215C36.6628 43.2756 46.1184 52.6431 56.117 62.5083ZM60.7769 8.4306C71.1827 8.4306 79.8239 16.3047 80.955 26.4414H71.8613C70.7755 21.2825 66.206 17.436 60.7317 17.436C55.2574 17.436 50.6879 21.2825 49.6021 26.4414H40.5084C41.7299 16.3047 50.3712 8.4306 60.7769 8.4306ZM8.8388 88.5742V38.7051C8.8388 34.9038 11.9153 31.8266 15.7156 31.8266H20.828V95.4527H15.7156C11.9605 95.4527 8.8388 92.3755 8.8388 88.5742ZM112.715 88.5742C112.715 92.3755 109.639 95.4527 105.838 95.4527H100.726V31.8266H105.838C109.639 31.8266 112.715 34.9038 112.715 38.7051V88.5742Z" fill="#102A56"/>
            </svg>
            <div className="brand-text">
              <div className="brand-titles">
                <span className="brand-wordmark">Stasher</span>
                <span className="brand-divider" />
                <span className="brand-product">Weekly Priorities</span>
                {readOnly && <span className="readonly-badge">View only</span>}
              </div>
              <div className="sub">
                {readOnly
                  ? "Click any card to view details."
                  : "Drag cards to move them · drag a card’s right edge to span weeks."}
              </div>
            </div>
          </div>

          <nav className="topbar-actions">
            <Link href="/history" className="btn btn-soft">History</Link>
            {canManageEditors && (
              <Link href="/admin" className="btn btn-soft">Manage editors</Link>
            )}
            <button
              className="btn icon-btn"
              onClick={refreshData}
              disabled={refreshing}
              title="Refresh data from Airtable"
              aria-label="Refresh"
            >
              <span className={refreshing ? "spin" : ""}>↻</span>
            </button>
            {!readOnly && (
              <button className="btn primary" onClick={() => setCreating(true)}>
                + Add initiative
              </button>
            )}
            <div className="topbar-user">
              <UserMenu />
            </div>
          </nav>
        </div>

        {/* Row 2: filters (left) + Slack actions (right) */}
        {!readOnly && (
          <div className="topbar-row topbar-row-tools">
            <div className="filter-cluster">
              <div className="filter-group">
                <span className="filter-label">Team</span>
                <select className="select" value={team} onChange={(e) => setTeam(e.target.value)}>
                  <option value="All">All teams</option>
                  {TEAM_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="filter-group">
                <span className="filter-label">Assignee</span>
                <select className="select" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="All">Everyone</option>
                  {allAssignees.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>

            <div className="slack-actions">
              <span className="slack-actions-label">Share to Slack:</span>
              <div className="slack-btn-wrap" ref={slackDropdownRef}>
                <button
                  className="btn slack"
                  onClick={() => setSlackDropdownOpen((v) => !v)}
                  disabled={!!busy}
                  aria-haspopup="true"
                  aria-expanded={slackDropdownOpen}
                >
                  {busy || (
                    <>
                      Post to Slack
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4, flexShrink: 0 }} aria-hidden="true">
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </>
                  )}
                </button>
                {slackDropdownOpen && (
                  <div className="slack-dropdown">
                    {(["All", "Host/Platform", "Customer"] as const).map((t) => (
                      <button
                        key={t}
                        className="slack-dropdown-item"
                        onClick={() => openSlackPreview(t)}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                        </svg>
                        {t === "All" ? "All teams" : `${t} view`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Read-only still gets filters */}
        {readOnly && (
          <div className="topbar-row topbar-row-tools">
            <div className="filter-cluster">
              <div className="filter-group">
                <span className="filter-label">Team</span>
                <select className="select" value={team} onChange={(e) => setTeam(e.target.value)}>
                  <option value="All">All teams</option>
                  {TEAM_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="filter-group">
                <span className="filter-label">Assignee</span>
                <select className="select" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="All">Everyone</option>
                  {allAssignees.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ── Dependency toolbar ─────────────────────────────── */}
      {items.some((it) => (it.depLinks?.length ?? 0) > 0) && (
        <div className="dep-toolbar">
          <button
            className={`dep-toggle ${showAllLinks ? "active" : ""}`}
            onClick={() => setShowAllLinks((v) => !v)}
            title={showAllLinks ? "Hide dependency arrows" : "Show all dependency arrows"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
            {showAllLinks ? "Hide links" : "Show all links"}
          </button>
          {!showAllLinks && (
            <span style={{ fontSize: 11.5, color: "#94a3b8" }}>Hover a card with dependencies to trace its chain</span>
          )}
        </div>
      )}

      {/* ── Board (snapshot region for Slack) ───────────────── */}
      <div className="board-wrap" ref={snapshotRef}>
        <div className="board-title-bar">
          <div className="brand-lockup">
            <svg width="20" height="17" viewBox="0 0 122 104" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M105.793 26.3962H86.4293C85.253 13.2727 74.1686 2.95496 60.7769 2.95496C47.34 2.95496 36.3009 13.2727 35.1246 26.3962H15.7609C8.97452 26.3962 3.45496 31.9171 3.45496 38.7051V88.529C3.45496 95.3169 8.97452 100.838 15.7609 100.838H105.838C112.625 100.838 118.144 95.3169 118.144 88.529V38.7051C118.144 31.9171 112.579 26.3962 105.793 26.3962ZM49.8283 31.8266C51.1856 36.6234 55.5741 40.1079 60.7769 40.1079C65.9798 40.1079 70.3683 36.5782 71.7256 31.8266H80.8645C79.281 41.194 70.685 49.7016 61.6365 58.6618C61.3651 58.9333 61.0484 59.2048 60.7769 59.5216C60.5055 59.2501 60.1888 58.9785 59.9173 58.6618C50.8689 49.7016 42.2728 41.194 40.6894 31.8266H49.8283ZM54.8502 28.7493C54.8502 25.4911 57.5195 22.8212 60.7769 22.8212C64.0344 22.8212 66.7037 25.4911 66.7037 28.7493C66.7037 32.0076 64.0344 34.6775 60.7769 34.6775C57.5195 34.6775 54.8502 32.0076 54.8502 28.7493ZM56.117 62.5083C57.0218 63.4134 57.9719 64.3184 58.8768 65.2687C59.3744 65.7665 60.0983 66.0833 60.7769 66.0833C61.4556 66.0833 62.1795 65.8118 62.6771 65.2687C63.582 64.3637 64.532 63.4134 65.4369 62.5083C75.3902 52.6431 84.8458 43.2304 86.3388 31.8266H95.2968V95.4527H26.2571V31.8266H35.215C36.6628 43.2756 46.1184 52.6431 56.117 62.5083ZM60.7769 8.4306C71.1827 8.4306 79.8239 16.3047 80.955 26.4414H71.8613C70.7755 21.2825 66.206 17.436 60.7317 17.436C55.2574 17.436 50.6879 21.2825 49.6021 26.4414H40.5084C41.7299 16.3047 50.3712 8.4306 60.7769 8.4306ZM8.8388 88.5742V38.7051C8.8388 34.9038 11.9153 31.8266 15.7156 31.8266H20.828V95.4527H15.7156C11.9605 95.4527 8.8388 92.3755 8.8388 88.5742ZM112.715 88.5742C112.715 92.3755 109.639 95.4527 105.838 95.4527H100.726V31.8266H105.838C109.639 31.8266 112.715 34.9038 112.715 38.7051V88.5742Z" fill="#102A56"/>
            </svg>
            <span className="board-title">
              Weekly Priorities{team !== "All" && <span style={{ fontWeight: 500, color: "#94a3b8" }}> · {team}</span>}
            </span>
          </div>
          <span className="board-date">
            {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
          </span>
        </div>

        <div className={`board ${hoveredId ? "tracing" : ""}`} ref={boardRef} style={{ position: "relative" }}>
          {/* Dependency arrows overlay */}
          {(showAllLinks || hoveredId !== null) && (
            <DepArrows
              items={items}
              codeMap={codeMap}
              blockedByMap={blockedByMap}
              cardRefs={cardRefs.current}
              boardRef={boardRef.current}
              hoveredId={hoveredId}
              showAll={showAllLinks}
              traceChain={traceChain}
            />
          )}
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

        {/* Assignee colour key — cards are coloured by their primary assignee */}
        {ownerKey.length > 0 && (
          <div className="legend">
            <strong style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginRight: 4 }}>
              Assignee:
            </strong>
            {ownerKey.map((name) => {
              const c = colorForAssignee(name, colourMap);
              return (
                <div className="item" key={name}>
                  <span
                    className="status-dot"
                    style={{ background: c.accent, width: 11, height: 11, borderRadius: 3 }}
                  />
                  {name}
                </div>
              );
            })}
          </div>
        )}

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
          onLocalUpdate={(id, patch) => {
            setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
            setSelected((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
          }}
          allInitiatives={activeItems}
        />
      )}

      {/* ── Slack preview modal ────────────────────────────────── */}
      {slackPreview && (
        <div className="overlay" onClick={() => setSlackPreview(null)}>
          <div className="modal slack-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-left">
                <h2>Preview Slack post</h2>
                <p className="modal-subtitle">
                  {slackPreview.team === "All" ? "All teams" : `${slackPreview.team} view`}
                  {" · Review the message and snapshot before posting."}
                </p>
              </div>
              <button className="modal-close-x" onClick={() => setSlackPreview(null)} aria-label="Close">✕</button>
            </div>

            <div className="slack-preview-body">
              {/* Editable message text */}
              <div className="slack-preview-message">
                <div className="slack-preview-label">Message <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0, color: "#94a3b8" }}>— edit before posting</span></div>
                <textarea
                  className="slack-preview-textarea"
                  value={editedMessage}
                  onChange={(e) => setEditedMessage(e.target.value)}
                  rows={8}
                  spellCheck={false}
                />
              </div>

              {/* Board snapshot */}
              <div>
                <div className="slack-preview-label">Snapshot</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={slackPreview.image} alt="Board snapshot" className="slack-preview-img" />
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-soft" onClick={() => setSlackPreview(null)}>
                Cancel
              </button>
              <button className="btn slack" onClick={confirmPostToSlack} disabled={!!busy}>
                {busy || "Post to Slack"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast ${toast.err ? "err" : ""}`}>{toast.msg}</div>
      )}
    </div>
  );
});

export default RoadmapBoard;
