import { listInitiatives } from "@/lib/airtable";
import HistoryView from "@/components/HistoryView";
import ErrorState from "@/components/ErrorState";
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

  if (error) return <ErrorState error={error} />;

  return <HistoryView initial={initiatives} />;
}
