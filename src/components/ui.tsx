import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
        <h1 className="font-display text-3xl font-bold uppercase tracking-[0.02em] text-paper sm:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className="card p-4">
      <p className="eyebrow">{label}</p>
      <p
        className={[
          "tnum mt-1 font-display text-2xl font-bold",
          emphasis ? "text-accent" : "text-paper",
        ].join(" ")}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 truncate text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="font-display text-lg font-semibold uppercase tracking-wide text-paper">{title}</p>
      {children ? <div className="max-w-md text-sm text-muted">{children}</div> : null}
    </div>
  );
}

/** Rank chip. First place gets the accent; everyone else stays quiet. */
export function RankBadge({ rank }: { rank: number }) {
  const isLeader = rank === 1;
  return (
    <span
      className={[
        "tnum inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold",
        isLeader
          ? "bg-accent text-ink"
          : rank <= 3
            ? "border border-[var(--edge-strong)] text-paper"
            : "text-muted",
      ].join(" ")}
    >
      {rank}
    </span>
  );
}

export function Banner({ tone, children }: { tone: "ok" | "error"; children: ReactNode }) {
  return (
    <div
      role="status"
      className={[
        "rounded-lg border px-4 py-3 text-sm",
        tone === "ok"
          ? "border-accent/40 bg-accent/10 text-accent"
          : "border-[var(--edge-strong)] bg-surface/40 text-paper",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function DayTag({ day }: { day: number }) {
  return (
    <span className="eyebrow rounded border border-[var(--edge)] px-2 py-1">Day {day}</span>
  );
}
