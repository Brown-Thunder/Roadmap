export type Timeframe = "This Week" | "Next Week" | "Future";

export type Status =
  | "In Flight"
  | "To Do"
  | "At Risk"
  | "Blocked"
  | "Done";

export type TShirtSize = "XS" | "S" | "M" | "L" | "XL";

export type Area = "Lockers" | "Partnerships" | "Engineering" | "Organic Search";

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
}

export const TIMEFRAMES: Timeframe[] = ["This Week", "Next Week", "Future"];

export const AREA_ORDER: string[] = [
  "Lockers",
  "Partnerships",
  "Engineering",
  "Organic Search",
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
export const AREA_OPTIONS = ["Lockers", "Partnerships", "Engineering", "Organic Search"];
export const POD_OPTIONS = [
  "Internal Lockers",
  "3rd Party Lockers",
  "Partnerships",
  "Engineering",
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
