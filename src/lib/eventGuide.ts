import type { GuideEvent } from "@/components/EventGuide";
import { EVENT_GUIDES } from "@/content/events";
import { mergeEventGuides, resolveMedia, scoreLadder } from "./profiles";
import { formatMeasurement, isScorable } from "./scoring";
import type { Event } from "./schema";

/**
 * Every event with its guide (src/content/events.ts) folded in: what the Event Guide
 * page shows and what the iOS app's guide endpoint returns, built once for both.
 */
export function buildGuideEvents(events: Event[]) {
  const merged = mergeEventGuides(events, EVENT_GUIDES);

  const guideEvents: GuideEvent[] = merged.rows.map(({ event, guide }) => {
    const unit = event.unitLabel ? ` ${event.unitLabel}` : "";
    const mark = (value: number) => `${formatMeasurement(value, event.decimals)}${unit}`;

    return {
      id: event.id,
      slug: event.slug,
      name: event.name,
      day: event.day,
      sortOrder: event.sortOrder,
      unitLabel: event.unitLabel,
      // What was written wins; otherwise the event's own one-line description.
      summary: guide?.summary?.trim() || event.description,
      rules: (guide?.rules ?? []).map((rule) => rule.trim()).filter(Boolean),
      media: resolveMedia(guide?.media),
      scale: isScorable(event)
        ? {
            top: mark(event.benchmarkStandard),
            zero: mark(event.benchmarkZero),
            ladder: scoreLadder(event, event.decimals, event.unitLabel),
          }
        : null,
    };
  });

  return { guideEvents, ...merged };
}
