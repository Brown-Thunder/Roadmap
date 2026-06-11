import { listInitiatives } from "@/lib/airtable";
import HistoryView from "@/components/HistoryView";
import { Initiative } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
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
        <h1>History</h1>
        <p style={{ color: "#b91c1c" }}>Could not load data from Airtable: {error}</p>
      </div>
    );
  }

  return <HistoryView initial={initiatives} />;
}
