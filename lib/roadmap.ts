import { Initiative, Timeframe, AREA_ORDER, TIMEFRAMES } from "./types";

export interface Lane {
  key: string;
  label: string;
  shared?: boolean;
}

export interface AreaGroup {
  area: string;
  lanes: Lane[];
}

function laneKeyFor(i: Initiative): string {
  if (i.area === "Lockers") {
    if (i.spansPods) return "shared";
    if (i.pod === "Internal Lockers") return "Internal Lockers";
    if (i.pod === "3rd Party Lockers") return "3rd Party Lockers";
    return "Internal Lockers";
  }
  return i.area;
}

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

export function filterByAssignee(
  initiatives: Initiative[],
  assignee: string
): Initiative[] {
  if (!assignee || assignee === "All") return initiatives;
  return initiatives.filter((i) => {
    const primary = i.primaryAssignees.split(",").map((s) => s.trim()).filter(Boolean);
    const support = i.supportAssignees.split(",").map((s) => s.trim()).filter(Boolean);
    return primary.includes(assignee) || support.includes(assignee);
  });
}

export function getAllAssignees(initiatives: Initiative[]): string[] {
  const names = new Set<string>();
  for (const i of initiatives) {
    i.primaryAssignees.split(",").map((s) => s.trim()).filter(Boolean).forEach((n) => names.add(n));
    i.supportAssignees.split(",").map((s) => s.trim()).filter(Boolean).forEach((n) => names.add(n));
  }
  return Array.from(names).sort();
}

export { TIMEFRAMES };
