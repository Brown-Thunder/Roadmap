import { readFileSync } from "fs";
import path from "path";
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
import { BRAND, TOKENS } from "@/lib/brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WIDTH = 1320;
const LANE_LABEL_W = 210;
// Official Stasher icon (brand logo file), inlined for Satori.
const LOGO_ICON = `data:image/svg+xml;base64,${readFileSync(
  path.join(process.cwd(), "public/brand/stasher-logo-icon-blue.svg"),
).toString("base64")}`;

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
          background: TOKENS.bgSurface,
          fontFamily: "sans-serif",
          color: TOKENS.textPrimary,
        }}
      >
        {/* ── Brand header band ── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "26px 32px 22px",
            background: TOKENS.bgMuted,
            borderBottom: `1px solid ${BRAND.gray[200]}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            {/* Stasher locker icon */}
            <img src={LOGO_ICON} width={38} height={34} alt="Stasher" />
            <div style={{ display: "flex", alignItems: "center", marginLeft: 12 }}>
              <div style={{ display: "flex", fontSize: 24, fontWeight: 700, color: TOKENS.brandPrimary }}>
                Weekly Priorities{team !== "All" ? ` · ${team}` : ""}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 16, color: TOKENS.textTertiary, fontWeight: 500 }}>{dateStr}</div>
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
                borderBottom: `2px solid ${TOKENS.borderDefault}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", fontSize: 18, fontWeight: 700 }}>
                <div style={{ display: "flex", width: 11, height: 11, borderRadius: 6, background: TIMEFRAME_ACCENT[tf], marginRight: 9 }} />
                {tf}
              </div>
              <div style={{ display: "flex", fontSize: 14, color: TOKENS.textTertiary, marginTop: 3, marginLeft: 20 }}>
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
                  fontWeight: 600,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  color: TOKENS.textTertiary,
                  padding: "14px 4px 4px",
                }}
              >
                {g.area}
              </div>
              {g.lanes.map((lane) => (
                <div key={lane.key} style={{ display: "flex", borderTop: `1px solid ${BRAND.gray[200]}`, minHeight: 96 }}>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      width: LANE_LABEL_W,
                      fontSize: 14,
                      fontWeight: 600,
                      color: TOKENS.textBody,
                      padding: "14px 12px",
                      justifyContent: "flex-start",
                      background: BRAND.gray[25],
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center" }}>
                      {lane.shared && (
                        <div style={{ display: "flex", width: 8, height: 8, borderRadius: 4, background: BRAND.yellow[500], marginRight: 7 }} />
                      )}
                      {lane.shared ? "Shared" : lane.label}
                    </div>
                    {lane.shared && (
                      <div style={{ display: "flex", fontSize: 12, color: TOKENS.textTertiary, marginTop: 2, marginLeft: 15 }}>
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
                          borderLeft: `1px solid ${TOKENS.borderSubtle}`,
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
                                      background: TOKENS.errorSolid,
                                      color: TOKENS.bgSurface,
                                      fontSize: 12,
                                      fontWeight: 600,
                                      marginRight: 6,
                                    }}
                                  >
                                    !
                                  </div>
                                )}
                                <div style={{ display: "flex", fontSize: 14, fontWeight: 700, lineHeight: 1.2, color: TOKENS.textPrimary }}>
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
                                      fontSize: 12,
                                      fontWeight: 600,
                                      color: BRAND.purple[800],
                                      background: BRAND.purple[100],
                                      borderRadius: 5,
                                      padding: "1px 6px",
                                      marginLeft: 7,
                                    }}
                                  >
                                    {it.tShirtSize}
                                  </div>
                                )}
                                {owner && (
                                  <div style={{ display: "flex", fontSize: 12, color: TOKENS.textTertiary, marginLeft: 7 }}>
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
            borderTop: `1px solid ${BRAND.gray[200]}`,
            fontSize: 14,
            color: TOKENS.textTertiary,
          }}
        >
          Cards are coloured by their primary assignee · stasher.com
        </div>
      </div>
    ),
    { width: WIDTH, height }
  );
}
