import { Initiative } from "./types";
import { filterByTeam } from "./roadmap";

export function appUrl(originFallback?: string): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return originFallback || "";
}

// Build the Slack initial_comment text that accompanies the image.
export function buildSummary(
  initiatives: Initiative[],
  team: string,
  origin?: string
): string {
  const list = filterByTeam(initiatives, team);
  const date = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const byTf = (tf: string) =>
    list
      .filter((i) => i.timeframe === tf)
      .sort((a, b) => a.order - b.order)
      .map((i) => i.name);

  const thisWeek = byTf("This Week");
  const nextWeek = byTf("Next Week");

  const teamLabel = team && team !== "All" ? ` (${team})` : "";
  const lines: string[] = [];
  lines.push(`*:world_map: Weekly Priorities${teamLabel} — week of ${date}*`);
  if (thisWeek.length)
    lines.push(`*This week:* ${thisWeek.join(", ")}`);
  if (nextWeek.length) lines.push(`*Next week:* ${nextWeek.join(", ")}`);
  const url = appUrl(origin);
  if (url) lines.push(`Explore the interactive board → ${url}`);
  return lines.join("\n");
}

// Decode a data URL (data:image/png;base64,....) into bytes.
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const buf = Buffer.from(b64, "base64");
  return new Uint8Array(buf);
}
