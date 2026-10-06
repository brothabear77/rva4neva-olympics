"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { renameAthlete } from "@/lib/authActions";
import { MAX_NAME_LENGTH, normalizeName } from "@/lib/roster";
import { Banner } from "./ui";

/**
 * Change the athlete's name on the profile page. It changes everywhere (the leaderboard,
 * the history, the sign-in list), so it says so. The server checks the account and the
 * name rules again, including that nobody else has the name.
 */
export function NameEditor({ athleteId, name }: { athleteId: string; name: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState(name);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();

  const unchanged = normalizeName(draft) === name;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    startSaving(async () => {
      setMessage(null);
      const result = await renameAthlete({ athleteId, name: draft });
      setMessage({ tone: result.ok ? "ok" : "error", text: result.message });
      if (result.ok) router.refresh();
    });
  };

  return (
    <form onSubmit={save} className="mb-6 space-y-3 border-b border-[var(--edge)] pb-6">
      <div>
        <label className="label" htmlFor="profileName">
          Name
        </label>
        <input
          id="profileName"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_NAME_LENGTH * 2}
          autoComplete="off"
          className="field"
        />
        <p className="mt-1.5 text-xs text-muted">
          Changes everywhere your name shows, your scores included. It&apos;s recorded in Change History.
        </p>
      </div>
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <button type="submit" disabled={saving || unchanged || normalizeName(draft) === ""} className="btn">
        {saving ? "Saving…" : "Change name"}
      </button>
    </form>
  );
}
