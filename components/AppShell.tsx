"use client";

import { useState, useEffect } from "react";
import RoadmapBoard from "./RoadmapBoard";
import ProductRoadmap from "./ProductRoadmap";
import StasherStrategy from "./StasherStrategy";
import ResearchRoadmap from "./ResearchRoadmap";
import UserMenu from "./UserMenu";
import { Initiative } from "@/lib/types";
import { RoadmapInitiative } from "@/lib/roadmap-initiatives";
import { ResearchTask } from "@/lib/research-tasks";
import { useViewMode } from "@/lib/useViewMode";

export type AppTab = "weekly" | "roadmap" | "research" | "strategy";

const TABS: { id: AppTab; label: string; shortLabel: string }[] = [
  { id: "weekly",   label: "Weekly Priorities", shortLabel: "Weekly" },
  { id: "roadmap",  label: "Product Roadmap",   shortLabel: "Roadmap" },
  { id: "research", label: "Research Roadmap",  shortLabel: "Research" },
  { id: "strategy", label: "Stasher Strategy",  shortLabel: "Strategy" },
];

// Persist the active tab so a refresh keeps the user where they were.
const TAB_STORAGE_KEY = "pulse.activeTab";
const VALID_TABS: AppTab[] = ["weekly", "roadmap", "research", "strategy"];

interface Props {
  initiatives: Initiative[];
  roadmapInitiatives: RoadmapInitiative[];
  researchTasks: ResearchTask[];
  canManageEditors?: boolean;
  readOnly?: boolean;
  roadmapPublished?: boolean;
  defaultTab?: AppTab;
}

export default function AppShell({
  initiatives,
  roadmapInitiatives,
  researchTasks,
  canManageEditors = false,
  readOnly = false,
  roadmapPublished = false,
  defaultTab = "weekly",
}: Props) {
  const [activeTab, setActiveTab] = useState<AppTab>(defaultTab);
  const { mode, isNarrow, override, setOverride } = useViewMode();
  const mobile = mode === "mobile";

  // Restore the last-viewed tab after mount (kept out of the initial state to
  // avoid an SSR/client hydration mismatch).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(TAB_STORAGE_KEY) as AppTab | null;
      if (stored && VALID_TABS.includes(stored)) setActiveTab(stored);
    } catch { /* localStorage unavailable */ }
  }, []);

  function selectTab(tab: AppTab) {
    setActiveTab(tab);
    try { localStorage.setItem(TAB_STORAGE_KEY, tab); } catch { /* noop */ }
  }

  // Viewers only see roadmap initiatives (and their links from the strategy chart)
  // once an editor has published the roadmap. Editors always see them.
  const hideRoadmapFromViewer = readOnly && !roadmapPublished;
  const strategyRoadmapInitiatives = hideRoadmapFromViewer ? [] : roadmapInitiatives;

  return (
    <div className="app-shell">
      {/* ── Tab bar ──────────────────────────────────────── */}
      <nav className="app-tabs" aria-label="Main navigation">
        {/* Brand lockup */}
        <div className="app-tabs-brand">
          <img className="brand-icon" src="/brand/stasher-logo-icon-blue.svg" alt="Stasher" width={32} height={29} />
          <span className="app-tabs-product">Pulse</span>
        </div>

        {/* Desktop pill tabs */}
        <div className="app-tabs-list" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`app-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => selectTab(tab.id)}
            >
              <span className="app-tab-full">{tab.label}</span>
              <span className="app-tab-short">{tab.shortLabel}</span>
            </button>
          ))}
        </div>

        {/* Mobile select */}
        <select
          className="app-tabs-select"
          value={activeTab}
          onChange={(e) => selectTab(e.target.value as AppTab)}
          aria-label="Select view"
        >
          {TABS.map((tab) => (
            <option key={tab.id} value={tab.id}>{tab.label}</option>
          ))}
        </select>

        <div className="app-tabs-right">
          {readOnly && <span className="readonly-badge">View only</span>}
          <UserMenu canManageEditors={canManageEditors} />
        </div>
      </nav>

      {/* On phones, let the user flip between the mobile-optimised layout and the
          full desktop layout. Only shown when the viewport is actually narrow. */}
      {isNarrow && (
        <div className="view-mode-bar">
          <span className="view-mode-label">
            {mobile ? "Mobile view" : "Desktop view"}
          </span>
          <button
            className="view-mode-toggle"
            onClick={() => setOverride(mobile ? "desktop" : "mobile")}
          >
            {mobile ? "Switch to desktop view" : "Switch to mobile view"}
          </button>
        </div>
      )}

      {/* ── Tab panels ───────────────────────────────────── */}
      <div style={activeTab !== "weekly" ? { display: "none" } : {}}>
        <RoadmapBoard
          initial={initiatives}
          canManageEditors={canManageEditors}
          readOnly={readOnly}
          inShell={true}
          mobile={mobile}
        />
      </div>

      <div style={activeTab !== "roadmap" ? { display: "none" } : {}}>
        <ProductRoadmap initial={roadmapInitiatives} readOnly={readOnly} published={roadmapPublished} mobile={mobile} />
      </div>

      <div style={activeTab !== "research" ? { display: "none" } : {}}>
        <ResearchRoadmap initial={researchTasks} readOnly={readOnly} mobile={mobile} />
      </div>

      <div style={activeTab !== "strategy" ? { display: "none" } : {}}>
        <StasherStrategy
          roadmapInitiatives={strategyRoadmapInitiatives}
          onNavigateToRoadmap={() => setActiveTab("roadmap")}
          mobile={mobile}
        />
      </div>
    </div>
  );
}
