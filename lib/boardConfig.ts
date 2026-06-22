import { AREA_ORDER } from "./types";

const API_BASE = "https://api.airtable.com/v0";
const CONFIG_TABLE = "tbliTlq47KAvZX3OA";
const CONFIG_KEY = "board-layout";

export interface BoardConfig {
  // Ordered list of area names as they should appear on the board.
  areaOrder: string[];
  // Map of "area|||laneKey" → display label override. Only overrides are stored;
  // missing keys fall back to the laneKey itself.
  laneLabels: Record<string, string>;
}

export const DEFAULT_BOARD_CONFIG: BoardConfig = {
  areaOrder: [...AREA_ORDER],
  laneLabels: {},
};

function cfg() {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) throw new Error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID");
  return { apiKey, baseId };
}

function headers(apiKey: string) {
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

// Returns the Airtable record ID for the config row, or null if it doesn't exist yet.
async function findRecord(apiKey: string, baseId: string): Promise<string | null> {
  const url = `${API_BASE}/${baseId}/${CONFIG_TABLE}?filterByFormula=${encodeURIComponent(`{Key}="${CONFIG_KEY}"`)}`;
  const res = await fetch(url, { headers: headers(apiKey), cache: "no-store" });
  const data = await res.json();
  return data.records?.[0]?.id ?? null;
}

export async function getBoardConfig(): Promise<BoardConfig> {
  try {
    const { apiKey, baseId } = cfg();
    const recId = await findRecord(apiKey, baseId);
    if (!recId) return { ...DEFAULT_BOARD_CONFIG };
    const res = await fetch(`${API_BASE}/${baseId}/${CONFIG_TABLE}/${recId}`, {
      headers: headers(apiKey), cache: "no-store",
    });
    const data = await res.json();
    const raw = data.fields?.Value;
    if (!raw) return { ...DEFAULT_BOARD_CONFIG };
    const parsed = JSON.parse(raw) as Partial<BoardConfig>;
    return {
      areaOrder: parsed.areaOrder?.length ? parsed.areaOrder : [...AREA_ORDER],
      laneLabels: parsed.laneLabels ?? {},
    };
  } catch {
    return { ...DEFAULT_BOARD_CONFIG };
  }
}

export async function saveBoardConfig(config: BoardConfig): Promise<void> {
  const { apiKey, baseId } = cfg();
  const value = JSON.stringify(config);
  const recId = await findRecord(apiKey, baseId);
  if (recId) {
    await fetch(`${API_BASE}/${baseId}/${CONFIG_TABLE}/${recId}`, {
      method: "PATCH",
      headers: headers(apiKey),
      body: JSON.stringify({ fields: { Value: value } }),
    });
  } else {
    await fetch(`${API_BASE}/${baseId}/${CONFIG_TABLE}`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify({ fields: { Key: CONFIG_KEY, Value: value } }),
    });
  }
}
