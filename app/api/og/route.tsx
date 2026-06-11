import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { listInitiatives } from "@/lib/airtable";
import { buildGroups, cellItems, filterByTeam } from "@/lib/roadmap";
import { TIMEFRAMES, STATUS_COLORS, TIMEFRAME_ACCENT } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WIDTH = 1280;
const LANE_LABEL_W = 200;

export async function GET(req: NextRequest) {
  const team = req.nextUrl.searchParams.get("team") || "All";
  let initiatives = await listInitiatives();
  initiatives = filterByTeam(initiatives, team);
  const groups = buildGroups(initiatives);

  // estimate height
  let laneCount = 0;
  groups.forEach((g) => (laneCount += g.lanes.length));
  const height = 150 + groups.length * 34 + laneCount * 92 + 40;

  const dateStr = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

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
        {/* Title bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "22px 28px 14px",
          }}
        >
          <div style={{ display: "flex", fontSize: 30, fontWeight: 800 }}>
            Team Roadmap{team !== "All" ? ` · ${team}` : ""}
          </div>
          <div style={{ display: "flex", fontSize: 18, color: "#64748b" }}>
            Week of {dateStr}
          </div>
        </div>

        {/* Column headers */}
        <div style={{ display: "flex", padding: "0 28px" }}>
          <div style={{ display: "flex", width: LANE_LABEL_W }} />
          {TIMEFRAMES.map((tf) => (
            <div
              key={tf}
              style={{
                display: "flex",
                flex: 1,
                alignItems: "center",
                fontSize: 18,
                fontWeight: 700,
                padding: "8px 10px",
                borderBottom: "3px solid #e2e8f0",
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  background: TIMEFRAME_ACCENT[tf],
                  marginRight: 8,
                }}
              />
              {tf}
            </div>
          ))}
        </div>

        {/* Groups */}
        <div style={{ display: "flex", flexDirection: "column", padding: "0 28px" }}>
          {groups.map((g) => (
            <div key={g.area} style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  display: "flex",
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  color: "#64748b",
                  padding: "10px 4px 2px",
                }}
              >
                {g.area}
              </div>
              {g.lanes.map((lane) => (
                <div
                  key={lane.key}
                  style={{
                    display: "flex",
                    borderTop: "1px solid #e2e8f0",
                    minHeight: 84,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      width: LANE_LABEL_W,
                      fontSize: 14,
                      fontWeight: 600,
                      padding: "12px 10px",
                      alignItems: "flex-start",
                      background: lane.shared ? "#fef9c3" : "#fcfcfd",
                      borderLeft: lane.shared ? "4px solid #f59e0b" : "none",
                    }}
                  >
                    {lane.label}
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
                          gap: 6,
                          padding: "8px 8px",
                          borderLeft: "1px solid #eef2f6",
                        }}
                      >
                        {items.map((it) => (
                          <div
                            key={it.id}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              border: "1px solid #e2e8f0",
                              borderLeft: `4px solid ${
                                STATUS_COLORS[it.status] || "#94a3b8"
                              }`,
                              borderRadius: 8,
                              padding: "6px 8px",
                              background: it.spansPods ? "#fffdf3" : "#ffffff",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                fontSize: 14,
                                fontWeight: 600,
                                lineHeight: 1.2,
                              }}
                            >
                              {it.name}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                fontSize: 11,
                                color: "#64748b",
                                marginTop: 3,
                              }}
                            >
                              {it.status}
                              {it.primaryAssignees ? ` · ${it.primaryAssignees}` : ""}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
    { width: WIDTH, height }
  );
}
