import { Initiative, teamLabel } from "./types";
import { filterByTeam } from "./roadmap";

// The canonical public URL — always the production project, never a deployment preview.
const PROJECT_URL = "https://stasher-roadmap.vercel.app";

export function appUrl(_originFallback?: string): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  return PROJECT_URL;
}

function joinNatural(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `*${names[0]}*`;
  if (names.length === 2) return `*${names[0]}* and *${names[1]}*`;
  const last = names[names.length - 1];
  const rest = names.slice(0, -1).map((n) => `*${n}*`).join(", ");
  return `${rest} and *${last}*`;
}

// Build the Slack initial_comment text that accompanies the image.
export function buildSummary(
  initiatives: Initiative[],
  team: string,
  _origin?: string
): string {
  const list = filterByTeam(initiatives, team).filter((i) => !i.completedDate);

  const getMondayOf = (d: Date) => {
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const mon = new Date(d);
    mon.setDate(d.getDate() + diff);
    return mon;
  };
  const fmtShort = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  const today = new Date();
  const monday = getMondayOf(today);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const weekLabel = `${fmtShort(monday)} – ${fmtShort(friday)}`;

  const byTf = (tf: string) =>
    list
      .filter((i) => i.timeframe === tf)
      .sort((a, b) => a.order - b.order)
      .map((i) => i.name);

  const thisWeek = byTf("This Week");
  const nextWeek = byTf("Next Week");
  const future = byTf("Future");

  const teamSuffix = team && team !== "All" ? ` · ${teamLabel(team)}` : "";
  const lines: string[] = [];

  lines.push(`🗺️ *Weekly Priorities${teamSuffix} — ${weekLabel}*`);
  lines.push("");

  if (thisWeek.length) {
    lines.push(
      thisWeek.length === 1
        ? `🚀 *This week* we're focused on ${joinNatural(thisWeek)}.`
        : `🚀 *This week* we're working on ${joinNatural(thisWeek)}.`
    );
  }

  if (nextWeek.length) {
    lines.push(
      nextWeek.length === 1
        ? `📅 *Next week* we're picking up ${joinNatural(nextWeek)}.`
        : `📅 *Next week* we're moving on to ${joinNatural(nextWeek)}.`
    );
  }

  if (future.length) {
    lines.push(`🔭 *On the horizon:* ${joinNatural(future)}.`);
  }

  lines.push("");
  lines.push(`📌 See the full board → ${PROJECT_URL}`);

  return lines.join("\n");
}

// Decode a data URL (data:image/png;base64,....) into bytes.
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const buf = Buffer.from(b64, "base64");
  return new Uint8Array(buf);
}
