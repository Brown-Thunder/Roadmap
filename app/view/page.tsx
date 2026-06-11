import { listInitiatives } from "@/lib/airtable";
import RoadmapBoard from "@/components/RoadmapBoard";
import { Initiative } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ViewPage() {
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
        <p style={{ color: "#b91c1c" }}>Could not load data from Airtable: {error}</p>
      </div>
    );
  }

  return <RoadmapBoard initial={initiatives} readOnly={true} />;
}
