import { listInitiatives } from "@/lib/airtable";
import ErrorState from "@/components/ErrorState";
import ReviewClient from "./ReviewClient";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  try {
    const initiatives = await listInitiatives();
    return <ReviewClient initial={initiatives} />;
  } catch (e: any) {
    return <ErrorState error={e?.message || "Failed to load initiatives."} />;
  }
}
