export type Timeframe = "This Week" | "Next Week" | "Future";

export type Status =
  | "In Flight"
  | "To Do"
  | "At Risk"
  | "Blocked"
  | "Done";

export type Area = "Lockers" | "Partnerships" | "Engineering" | "Organic Search";

export interface Initiative {
  id: string;
  name: string;
  description: string;
  team: string; // "Host/Platform" | "Customer"
  area: string;
  pod: string;
  spansPods: boolean;
  timeframe: Timeframe;
  status: Status;
  owner: string;
  ownerSlackIds: string; // comma-separated
  link: string;
  notes: string;
  order: number;
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

// Editable field option lists (kept in sync with the Airtable base schema)
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
