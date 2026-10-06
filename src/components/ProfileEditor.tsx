"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateProfile } from "@/lib/authActions";
import { MAX_BIO_LENGTH, MAX_TAGLINE_LENGTH } from "@/lib/profiles";
import { Banner } from "./ui";

/**
 * The tagline and bio form on the profile page. The server checks again that the
 * signed-in account may edit this athlete when saving.
 */
export function ProfileEditor({
  athleteId,
  name,
  tagline,
  bio,
}: {
  athleteId: string;
  name: string;
  tagline: string;
  bio: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState({ tagline, bio });
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();

  const unchanged = draft.tagline === tagline && draft.bio === bio;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    startSaving(async () => {
      setMessage(null);
      const result = await updateProfile({ athleteId, ...draft });
      setMessage({ tone: result.ok ? "ok" : "error", text: result.message });
      if (result.ok) router.refresh();
    });
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <label className="label" htmlFor="profileTagline">
          Tagline
        </label>
        <input
          id="profileTagline"
          value={draft.tagline}
          onChange={(e) => setDraft({ ...draft, tagline: e.target.value })}
          maxLength={MAX_TAGLINE_LENGTH}
          placeholder={`One line under ${name}`}
          className="field"
        />
      </div>
      <div>
        <label className="label" htmlFor="profileBio">
          Bio
        </label>
        <textarea
          id="profileBio"
          value={draft.bio}
          onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
          maxLength={MAX_BIO_LENGTH}
          rows={8}
          placeholder="A blank line starts a new paragraph."
          className="field"
        />
      </div>
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving || unchanged} className="btn">
          {saving ? "Saving…" : "Save profile"}
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft({ tagline, bio });
            setMessage(null);
          }}
          disabled={saving || unchanged}
          className="btn btn-ghost"
        >
          Discard changes
        </button>
      </div>
    </form>
  );
}
