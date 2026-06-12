import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { listInitiatives } from "@/lib/airtable";
import { buildGroups, cellItems, filterByTeam, activeInitiatives } from "@/lib/roadmap";
import { colourMap } from "@/lib/people";
import {
  TIMEFRAMES,
  TIMEFRAME_ACCENT,
  colorForAssignee,
  primaryAssigneeOf,
  NAMED_ASSIGNEE_COLORS,
  AssigneeColor,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WIDTH = 1320;
const LANE_LABEL_W = 210;
const NAVY = "#102A56";
const GREEN = "#00A969";

// Friendly Mon–Fri week ranges for the three columns (mirrors the board).
function mondayOf(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}
function short(d: Date) {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
function weekRanges(): Record<string, string> {
  const mon = mondayOf(new Date());
  const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
  const nMon = new Date(mon); nMon.setDate(mon.getDate() + 7);
  const nFri = new Date(nMon); nFri.setDate(nMon.getDate() + 4);
  const fMon = new Date(nMon); fMon.setDate(nMon.getDate() + 7);
  return {
    "This Week": `${short(mon)} – ${short(fri)}`,
    "Next Week": `${short(nMon)} – ${short(nFri)}`,
    Future: `${short(fMon)} onwards`,
  };
}

export async function GET(req: NextRequest) {
  const team = req.nextUrl.searchParams.get("team") || "All";
  const [allRaw, colours] = await Promise.all([listInitiatives(), colourMap().catch(() => ({}))]);
  // Resolve named colours (e.g. "Violet") to full swatches for lookup.
  const swatches: Record<string, AssigneeColor> = {};
  for (const [name, c] of Object.entries(colours)) {
    if (NAMED_ASSIGNEE_COLORS[c]) swatches[name] = NAMED_ASSIGNEE_COLORS[c];
  }

  let initiatives = activeInitiatives(allRaw); // completed items never appear
  initiatives = filterByTeam(initiatives, team);
  const groups = buildGroups(initiatives);
  const ranges = weekRanges();

  // Height estimate
  let laneCount = 0;
  groups.forEach((g) => (laneCount += g.lanes.length));
  const height = 170 + groups.length * 40 + laneCount * 104 + 60;

  const dateStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height,
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          fontFamily: "sans-serif",
          color: "#0f172a",
        }}
      >
        {/* ── Brand header band ── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "26px 32px 22px",
            background: "#f8fafc",
            borderBottom: `1px solid #e2e8f0`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            {/* Stasher locker icon */}
            <svg width="34" height="29" viewBox="0 0 122 104" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M105.793 26.3962H86.4293C85.253 13.2727 74.1686 2.95496 60.7769 2.95496C47.34 2.95496 36.3009 13.2727 35.1246 26.3962H15.7609C8.97452 26.3962 3.45496 31.9171 3.45496 38.7051V88.529C3.45496 95.3169 8.97452 100.838 15.7609 100.838H105.838C112.625 100.838 118.144 95.3169 118.144 88.529V38.7051C118.144 31.9171 112.579 26.3962 105.793 26.3962ZM49.8283 31.8266C51.1856 36.6234 55.5741 40.1079 60.7769 40.1079C65.9798 40.1079 70.3683 36.5782 71.7256 31.8266H80.8645C79.281 41.194 70.685 49.7016 61.6365 58.6618C61.3651 58.9333 61.0484 59.2048 60.7769 59.5216C60.5055 59.2501 60.1888 58.9785 59.9173 58.6618C50.8689 49.7016 42.2728 41.194 40.6894 31.8266H49.8283ZM54.8502 28.7493C54.8502 25.4911 57.5195 22.8212 60.7769 22.8212C64.0344 22.8212 66.7037 25.4911 66.7037 28.7493C66.7037 32.0076 64.0344 34.6775 60.7769 34.6775C57.5195 34.6775 54.8502 32.0076 54.8502 28.7493ZM56.117 62.5083C57.0218 63.4134 57.9719 64.3184 58.8768 65.2687C59.3744 65.7665 60.0983 66.0833 60.7769 66.0833C61.4556 66.0833 62.1795 65.8118 62.6771 65.2687C63.582 64.3637 64.532 63.4134 65.4369 62.5083C75.3902 52.6431 84.8458 43.2304 86.3388 31.8266H95.2968V95.4527H26.2571V31.8266H35.215C36.6628 43.2756 46.1184 52.6431 56.117 62.5083ZM60.7769 8.4306C71.1827 8.4306 79.8239 16.3047 80.955 26.4414H71.8613C70.7755 21.2825 66.206 17.436 60.7317 17.436C55.2574 17.436 50.6879 21.2825 49.6021 26.4414H40.5084C41.7299 16.3047 50.3712 8.4306 60.7769 8.4306ZM8.8388 88.5742V38.7051C8.8388 34.9038 11.9153 31.8266 15.7156 31.8266H20.828V95.4527H15.7156C11.9605 95.4527 8.8388 92.3755 8.8388 88.5742ZM112.715 88.5742C112.715 92.3755 109.639 95.4527 105.838 95.4527H100.726V31.8266H105.838C109.639 31.8266 112.715 34.9038 112.715 38.7051V88.5742Z" fill={NAVY}/>
            </svg>
            <div style={{ display: "flex", alignItems: "center", marginLeft: 14 }}>
              <div style={{ display: "flex", fontSize: 26, fontWeight: 800, color: NAVY, letterSpacing: -0.5 }}>Stasher</div>
              <div style={{ display: "flex", width: 1, height: 22, background: "#cbd5e1", margin: "0 14px" }} />
              <div style={{ display: "flex", fontSize: 24, fontWeight: 700, color: GREEN }}>
                Weekly Priorities{team !== "All" ? ` · ${team}` : ""}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 16, color: "#64748b", fontWeight: 500 }}>{dateStr}</div>
        </div>

        {/* ── Column headers ── */}
        <div style={{ display: "flex", padding: "0 32px", marginTop: 6 }}>
          <div style={{ display: "flex", width: LANE_LABEL_W }} />
          {TIMEFRAMES.map((tf) => (
            <div
              key={tf}
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                padding: "14px 12px 10px",
                borderBottom: "2px solid #cbd5e1",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", fontSize: 17, fontWeight: 700 }}>
                <div style={{ display: "flex", width: 11, height: 11, borderRadius: 6, background: TIMEFRAME_ACCENT[tf], marginRight: 9 }} />
                {tf}
              </div>
              <div style={{ display: "flex", fontSize: 13, color: "#94a3b8", marginTop: 3, marginLeft: 20 }}>
                {ranges[tf]}
              </div>
            </div>
          ))}
        </div>

        {/* ── Groups ── */}
        <div style={{ display: "flex", flexDirection: "column", padding: "0 32px" }}>
          {groups.map((g) => (
            <div key={g.area} style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  display: "flex",
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  color: "#94a3b8",
                  padding: "14px 4px 4px",
                }}
              >
                {g.area}
              </div>
              {g.lanes.map((lane) => (
                <div key={lane.key} style={{ display: "flex", borderTop: "1px solid #e2e8f0", minHeight: 96 }}>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      width: LANE_LABEL_W,
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#334155",
                      padding: "14px 12px",
                      justifyContent: "flex-start",
                      background: "#fafbfc",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center" }}>
                      {lane.shared && (
                        <div style={{ display: "flex", width: 8, height: 8, borderRadius: 4, background: "#f59e0b", marginRight: 7 }} />
                      )}
                      {lane.shared ? "Shared" : lane.label}
                    </div>
                    {lane.shared && (
                      <div style={{ display: "flex", fontSize: 11, color: "#94a3b8", marginTop: 2, marginLeft: 15 }}>
                        Internal + 3rd Party
                      </div>
                    )}
                  </div>
                  {TIMEFRAMES.map((tf) => {
                    const items = cellItems(initiatives, g.area, lane.key, tf);
                    return (
                      <div
                        key={tf}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          flex: 1,
                          gap: 7,
                          padding: "9px 9px",
                          borderLeft: "1px solid #eef2f6",
                        }}
                      >
                        {items.map((it) => {
                          const owner = primaryAssigneeOf(it.primaryAssignees);
                          const ac = colorForAssignee(owner, swatches);
                          return (
                            <div
                              key={it.id}
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                border: `1px solid ${ac.border}`,
                                borderLeft: `4px solid ${ac.accent}`,
                                borderRadius: 9,
                                padding: "8px 10px",
                                background: ac.bg,
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center" }}>
                                {it.priority === "High" && (
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      width: 16,
                                      height: 16,
                                      borderRadius: 8,
                                      background: "#dc2626",
                                      color: "#fff",
                                      fontSize: 11,
                                      fontWeight: 800,
                                      marginRight: 6,
                                    }}
                                  >
                                    !
                                  </div>
                                )}
                                <div style={{ display: "flex", fontSize: 14, fontWeight: 700, lineHeight: 1.2, color: "#0f172a" }}>
                                  {it.name}
                                </div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", marginTop: 5 }}>
                                <div style={{ display: "flex", fontSize: 12, color: ac.fg, fontWeight: 600 }}>
                                  {it.status}
                                </div>
                                {it.tShirtSize && (
                                  <div
                                    style={{
                                      display: "flex",
                                      fontSize: 11,
                                      fontWeight: 800,
                                      color: "#5b21b6",
                                      background: "#ede9fe",
                                      borderRadius: 5,
                                      padding: "1px 6px",
                                      marginLeft: 7,
                                    }}
                                  >
                                    {it.tShirtSize}
                                  </div>
                                )}
                                {owner && (
                                  <div style={{ display: "flex", fontSize: 12, color: "#64748b", marginLeft: 7 }}>
                                    {owner}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* ── Footer ── */}
        <div
          style={{
            display: "flex",
            marginTop: "auto",
            padding: "16px 32px",
            borderTop: "1px solid #e2e8f0",
            fontSize: 13,
            color: "#94a3b8",
          }}
        >
          Cards are coloured by their primary assignee · stasher.com
        </div>
      </div>
    ),
    { width: WIDTH, height }
  );
}
