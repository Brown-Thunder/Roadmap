import { listInitiatives } from "@/lib/airtable";
import RoadmapBoard from "@/components/RoadmapBoard";
import ErrorState from "@/components/ErrorState";
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

  if (error) return <ErrorState error={error} />;

  return <RoadmapBoard initial={initiatives} />;
}
