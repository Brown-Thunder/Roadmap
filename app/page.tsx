import { listInitiatives } from "@/lib/airtable";
import RoadmapBoard from "@/components/RoadmapBoard";
import { Initiative } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  let initiatives: Initiative[] = [];
  let error: string | null = null;
  try {
    initiatives = await listInitiatives();
  } catch (e: any) {
    error = e?.message || "Failed to load initiatives.";
  }

  if (error) {
    return (
      <div className="page">
        <h1>Team Roadmap</h1>
        <p style={{ color: "#b91c1c" }}>
          Could not load data from Airtable: {error}
        </p>
        <p style={{ color: "#64748b" }}>
          Check the <code>AIRTABLE_API_KEY</code>, <code>AIRTABLE_BASE_ID</code>{" "}
          and <code>AIRTABLE_TABLE_NAME</code> environment variables.
        </p>
      </div>
    );
  }

  return <RoadmapBoard initial={initiatives} />;
}
