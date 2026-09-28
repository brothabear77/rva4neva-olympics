import { SUBMISSIONS_LOCKED_MESSAGE } from "@/lib/flags";
import { Banner } from "./ui";

export function LockedBanner() {
  return (
    <div className="mb-6">
      <Banner tone="locked">{SUBMISSIONS_LOCKED_MESSAGE}</Banner>
    </div>
  );
}
