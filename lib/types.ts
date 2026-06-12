export type Timeframe = "This Week" | "Next Week" | "Future";

export type Status =
  | "In Flight"
  | "To Do"
  | "At Risk"
  | "Blocked"
  | "Done";

export type TShirtSize = "XS" | "S" | "M" | "L" | "XL";

export type Area =
  | "Lockers"
  | "Marketing"
  | "Finance"
  | "Engineering"
  | "Customer Success"
  | "Product";

export interface Comment {
  id: string;       // timestamp-based local id
  author: string;
  text: string;
  createdAt: string; // ISO string
}

export interface Initiative {
  id: string;
  name: string;
  description: string;
  team: string;
  area: string;
  pod: string;
  spansPods: boolean;
  timeframe: Timeframe;
  status: Status;
  primaryAssignees: string; // comma-separated names
  supportAssignees: string; // comma-separated names
  link: string;
  notes: string;
  order: number;
  tShirtSize: TShirtSize | "";
  durationWeeks: number; // 1 = single column, 2+ = spans columns
  tags: string[];        // e.g. ["delayed", "priority"]
  comments: Comment[];   // stored as JSON in Airtable long-text field
  layers: string[];      // ["Frontend", "Backend"]
  completedDate: string; // ISO date "YYYY-MM-DD" or "" if not completed
  priority: Priority | ""; // "High" | "Medium" | "Low" | ""
}

export type Priority = "High" | "Medium" | "Low";
export const PRIORITY_OPTIONS: Priority[] = ["High", "Medium", "Low"];

export function isCompleted(i: Initiative): boolean {
  return Boolean(i.completedDate);
}

export const TIMEFRAMES: Timeframe[] = ["This Week", "Next Week", "Future"];

export const AREA_ORDER: string[] = [
  "Lockers",
  "Marketing",
  "Product",
  "Engineering",
  "Customer Success",
  "Finance",
];

export const STATUS_COLORS: Record<string, string> = {
  "In Flight": "#2563eb",
  "To Do": "#6b7280",
  "At Risk": "#ea580c",
  Blocked: "#dc2626",
  Done: "#16a34a",
};

export const TIMEFRAME_ACCENT: Record<Timeframe, string> = {
  "This Week": "#16a34a",
  "Next Week": "#d97706",
  Future: "#64748b",
};

export const TEAM_OPTIONS = ["Host/Platform", "Customer"];

export const AREA_OPTIONS = [
  "Lockers",
  "Marketing",
  "Finance",
  "Engineering",
  "Customer Success",
  "Product",
];

// Pods available per area. An area NOT listed here is "its own pod" — the pod
// picker is hidden and the Pod field is left empty in Airtable.
export const AREA_PODS: Record<string, string[]> = {
  Lockers: ["Internal Lockers", "3rd Party Lockers"],
  Marketing: ["Organic Search"],
};

// Default pod to pre-select when an area is chosen (if it has pods).
export const AREA_DEFAULT_POD: Record<string, string> = {
  Lockers: "3rd Party Lockers",
  Marketing: "Organic Search",
};

// Only these areas can have an initiative that spans multiple pods.
export const SPANS_PODS_AREAS = ["Lockers"];

// Helpers
export function areaHasPods(area: string): boolean {
  return (AREA_PODS[area]?.length ?? 0) > 0;
}
export function podsForArea(area: string): string[] {
  return AREA_PODS[area] ?? [];
}

// Full flat list kept for any legacy callers.
export const POD_OPTIONS = [
  "Internal Lockers",
  "3rd Party Lockers",
  "Organic Search",
];
export const STATUS_OPTIONS: Status[] = [
  "In Flight",
  "To Do",
  "At Risk",
  "Blocked",
  "Done",
];
export const TSHIRT_OPTIONS: TShirtSize[] = ["XS", "S", "M", "L", "XL"];
export const LAYER_OPTIONS = ["Frontend", "Backend"] as const;
export type Layer = typeof LAYER_OPTIONS[number];

export const DEFAULT_TAGS = [
  "priority",
  "delayed",
  "blocked",
  "needs review",
  "quick win",
  "tech debt",
  "discovery",
  "dependencies",
];

// ─── Assignee colours ──────────────────────────────────────────────────────────
// Curated, visually distinct palette. Each entry is { bg, fg, border, accent }.
// accent is the strong colour used for the card's left border + legend dot.
export interface AssigneeColor {
  bg: string;
  fg: string;
  border: string;
  accent: string;
}

export const ASSIGNEE_PALETTE: AssigneeColor[] = [
  { bg: "#eef2ff", fg: "#3730a3", border: "#c7d2fe", accent: "#6366f1" }, // indigo
  { bg: "#ecfdf5", fg: "#065f46", border: "#a7f3d0", accent: "#10b981" }, // emerald
  { bg: "#fff7ed", fg: "#9a3412", border: "#fed7aa", accent: "#f97316" }, // orange
  { bg: "#fdf2f8", fg: "#9d174d", border: "#fbcfe8", accent: "#ec4899" }, // pink
  { bg: "#eff6ff", fg: "#1e40af", border: "#bfdbfe", accent: "#3b82f6" }, // blue
  { bg: "#f5f3ff", fg: "#5b21b6", border: "#ddd6fe", accent: "#8b5cf6" }, // violet
  { bg: "#fefce8", fg: "#854d0e", border: "#fef08a", accent: "#eab308" }, // amber
  { bg: "#f0fdfa", fg: "#115e59", border: "#99f6e4", accent: "#14b8a6" }, // teal
  { bg: "#fef2f2", fg: "#991b1b", border: "#fecaca", accent: "#ef4444" }, // red
  { bg: "#f7fee7", fg: "#3f6212", border: "#d9f99d", accent: "#84cc16" }, // lime
  { bg: "#f0f9ff", fg: "#075985", border: "#bae6fd", accent: "#0ea5ce" }, // sky
  { bg: "#fdf4ff", fg: "#86198f", border: "#f5d0fe", accent: "#d946ef" }, // fuchsia
];

const UNASSIGNED_COLOR: AssigneeColor = {
  bg: "#f8fafc", fg: "#475569", border: "#e2e8f0", accent: "#94a3b8",
};
export const UNASSIGNED_ASSIGNEE_COLOR = UNASSIGNED_COLOR;

// Named colours assignable to a person in the Airtable People table. Each maps
// to a full {bg, fg, border, accent} swatch. These are the distinct, curated
// colours a card adopts from its primary assignee.
export const NAMED_ASSIGNEE_COLORS: Record<string, AssigneeColor> = {
  Indigo:  { bg: "#eef2ff", fg: "#3730a3", border: "#c7d2fe", accent: "#6366f1" },
  Emerald: { bg: "#ecfdf5", fg: "#065f46", border: "#a7f3d0", accent: "#10b981" },
  Orange:  { bg: "#fff7ed", fg: "#9a3412", border: "#fed7aa", accent: "#f97316" },
  Pink:    { bg: "#fdf2f8", fg: "#9d174d", border: "#fbcfe8", accent: "#ec4899" },
  Blue:    { bg: "#eff6ff", fg: "#1e40af", border: "#bfdbfe", accent: "#3b82f6" },
  Violet:  { bg: "#f5f3ff", fg: "#5b21b6", border: "#ddd6fe", accent: "#8b5cf6" },
  Amber:   { bg: "#fefce8", fg: "#854d0e", border: "#fef08a", accent: "#eab308" },
  Teal:    { bg: "#f0fdfa", fg: "#115e59", border: "#99f6e4", accent: "#14b8a6" },
  Red:     { bg: "#fef2f2", fg: "#991b1b", border: "#fecaca", accent: "#ef4444" },
  Lime:    { bg: "#f7fee7", fg: "#3f6212", border: "#d9f99d", accent: "#84cc16" },
  Sky:     { bg: "#f0f9ff", fg: "#075985", border: "#bae6fd", accent: "#0ea5ce" },
  Fuchsia: { bg: "#fdf4ff", fg: "#86198f", border: "#f5d0fe", accent: "#d946ef" },
};

// Resolve a person's colour. If an explicit map is provided (from the People
// table's assigned colours), that wins; otherwise fall back to a stable hash so
// anyone not yet in the directory still gets a consistent colour.
export function colorForAssignee(
  name: string,
  overrides?: Record<string, AssigneeColor>
): AssigneeColor {
  const key = (name || "").trim().toLowerCase();
  if (!key) return UNASSIGNED_COLOR;
  if (overrides) {
    const hit = overrides[key];
    if (hit) return hit;
  }
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % ASSIGNEE_PALETTE.length;
  return ASSIGNEE_PALETTE[idx];
}

// The first primary assignee drives a card's colour.
export function primaryAssigneeOf(primaryAssignees: string): string {
  return (primaryAssignees || "").split(",").map((s) => s.trim()).filter(Boolean)[0] ?? "";
}
