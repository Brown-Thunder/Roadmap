import { Initiative, Timeframe, AREA_ORDER, TIMEFRAMES } from "./types";

export interface Lane {
  key: string;
  label: string;
  shared?: boolean; // spans Internal + 3rd Party lockers
}

export interface AreaGroup {
  area: string;
  lanes: Lane[];
}

// Decide which lane an initiative belongs to within its area.
function laneKeyFor(i: Initiative): string {
  if (i.area === "Lockers") {
    if (i.spansPods) return "shared";
    if (i.pod === "Internal Lockers") return "Internal Lockers";
    if (i.pod === "3rd Party Lockers") return "3rd Party Lockers";
    return "Internal Lockers"; // fallback
  }
  return i.area;
}

// Build the ordered area groups + lanes that actually contain data.
export function buildGroups(initiatives: Initiative[]): AreaGroup[] {
  const areas = Array.from(new Set(initiatives.map((i) => i.area).filter(Boolean)));
  areas.sort((a, b) => {
    const ia = AREA_ORDER.indexOf(a);
    const ib = AREA_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return areas.map((area) => {
    if (area === "Lockers") {
      const lanes: Lane[] = [];
      const hasThird = initiatives.some(
        (i) => i.area === area && !i.spansPods && i.pod === "3rd Party Lockers"
      );
      const hasInternal = initiatives.some(
        (i) => i.area === area && !i.spansPods && i.pod === "Internal Lockers"
      );
      const hasShared = initiatives.some((i) => i.area === area && i.spansPods);
      if (hasThird)
        lanes.push({ key: "3rd Party Lockers", label: "3rd Party Lockers" });
      if (hasInternal)
        lanes.push({ key: "Internal Lockers", label: "Internal Lockers" });
      if (hasShared)
        lanes.push({
          key: "shared",
          label: "Shared · Internal + 3rd Party",
          shared: true,
        });
      return { area, lanes };
    }
    return { area, lanes: [{ key: area, label: area }] };
  });
}

// Get the initiatives in a given area/lane/timeframe cell, sorted.
export function cellItems(
  initiatives: Initiative[],
  area: string,
  laneKey: string,
  timeframe: Timeframe
): Initiative[] {
  return initiatives
    .filter(
      (i) =>
        i.area === area &&
        laneKeyFor(i) === laneKey &&
        i.timeframe === timeframe
    )
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export function filterByTeam(
  initiatives: Initiative[],
  team: string
): Initiative[] {
  if (!team || team === "All") return initiatives;
  return initiatives.filter((i) => i.team === team);
}

export { TIMEFRAMES };
