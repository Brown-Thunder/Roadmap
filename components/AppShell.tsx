"use client";

import { useState, useEffect } from "react";
import RoadmapBoard from "./RoadmapBoard";
import ProductRoadmap from "./ProductRoadmap";
import StasherStrategy from "./StasherStrategy";
import UserMenu from "./UserMenu";
import { Initiative } from "@/lib/types";
import { RoadmapInitiative } from "@/lib/roadmap-initiatives";
import { useViewMode } from "@/lib/useViewMode";

export type AppTab = "weekly" | "roadmap" | "strategy";

const TABS: { id: AppTab; label: string; shortLabel: string }[] = [
  { id: "weekly",   label: "Weekly Priorities", shortLabel: "Weekly" },
  { id: "roadmap",  label: "Product Roadmap",   shortLabel: "Roadmap" },
  { id: "strategy", label: "Stasher Strategy",  shortLabel: "Strategy" },
];

// Persist the active tab so a refresh keeps the user where they were.
const TAB_STORAGE_KEY = "pulse.activeTab";
const VALID_TABS: AppTab[] = ["weekly", "roadmap", "strategy"];

interface Props {
  initiatives: Initiative[];
  roadmapInitiatives: RoadmapInitiative[];
  canManageEditors?: boolean;
  readOnly?: boolean;
  roadmapPublished?: boolean;
  defaultTab?: AppTab;
}

export default function AppShell({
  initiatives,
  roadmapInitiatives,
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
          <svg className="brand-icon" width="26" height="22" viewBox="0 0 122 104" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M105.793 26.3962H86.4293C85.253 13.2727 74.1686 2.95496 60.7769 2.95496C47.34 2.95496 36.3009 13.2727 35.1246 26.3962H15.7609C8.97452 26.3962 3.45496 31.9171 3.45496 38.7051V88.529C3.45496 95.3169 8.97452 100.838 15.7609 100.838H105.838C112.625 100.838 118.144 95.3169 118.144 88.529V38.7051C118.144 31.9171 112.579 26.3962 105.793 26.3962ZM49.8283 31.8266C51.1856 36.6234 55.5741 40.1079 60.7769 40.1079C65.9798 40.1079 70.3683 36.5782 71.7256 31.8266H80.8645C79.281 41.194 70.685 49.7016 61.6365 58.6618C61.3651 58.9333 61.0484 59.2048 60.7769 59.5216C60.5055 59.2501 60.1888 58.9785 59.9173 58.6618C50.8689 49.7016 42.2728 41.194 40.6894 31.8266H49.8283ZM54.8502 28.7493C54.8502 25.4911 57.5195 22.8212 60.7769 22.8212C64.0344 22.8212 66.7037 25.4911 66.7037 28.7493C66.7037 32.0076 64.0344 34.6775 60.7769 34.6775C57.5195 34.6775 54.8502 32.0076 54.8502 28.7493ZM56.117 62.5083C57.0218 63.4134 57.9719 64.3184 58.8768 65.2687C59.3744 65.7665 60.0983 66.0833 60.7769 66.0833C61.4556 66.0833 62.1795 65.8118 62.6771 65.2687C63.582 64.3637 64.532 63.4134 65.4369 62.5083C75.3902 52.6431 84.8458 43.2304 86.3388 31.8266H95.2968V95.4527H26.2571V31.8266H35.215C36.6628 43.2756 46.1184 52.6431 56.117 62.5083ZM60.7769 8.4306C71.1827 8.4306 79.8239 16.3047 80.955 26.4414H71.8613C70.7755 21.2825 66.206 17.436 60.7317 17.436C55.2574 17.436 50.6879 21.2825 49.6021 26.4414H40.5084C41.7299 16.3047 50.3712 8.4306 60.7769 8.4306ZM8.8388 88.5742V38.7051C8.8388 34.9038 11.9153 31.8266 15.7156 31.8266H20.828V95.4527H15.7156C11.9605 95.4527 8.8388 92.3755 8.8388 88.5742ZM112.715 88.5742C112.715 92.3755 109.639 95.4527 105.838 95.4527H100.726V31.8266H105.838C109.639 31.8266 112.715 34.9038 112.715 38.7051V88.5742Z" fill="#102A56"/>
          </svg>
          <span className="app-tabs-wordmark">Stasher</span>
          <span className="app-tabs-divider" />
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
