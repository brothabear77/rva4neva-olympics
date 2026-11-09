"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changePassword, changeUsername } from "@/lib/authActions";
import { MAX_USERNAME_LENGTH, MIN_PASSWORD_LENGTH, checkPassword, checkUsername } from "@/lib/credentials";
import { PasswordInput } from "./PasswordInput";
import { Banner } from "./ui";

type Message = { tone: "ok" | "error"; text: string } | null;

/**
 * Change your own username and password, on your profile page. The username is what you
 * type to sign in; it isn't shown to anyone else. Both are checked again on the server.
 */
export function SignInDetails({ username }: { username: string }) {
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <UsernameForm username={username} />
      <PasswordForm />
    </div>
  );
}

function UsernameForm({ username }: { username: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState(username);
  const [message, setMessage] = useState<Message>(null);
  const [saving, startSaving] = useTransition();

  const unchanged = draft.trim().toLowerCase() === username;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const check = checkUsername(draft);
    if (!check.ok) return setMessage({ tone: "error", text: check.error });
    startSaving(async () => {
      setMessage(null);
      const result = await changeUsername({ username: draft });
      setMessage({ tone: result.ok ? "ok" : "error", text: result.message });
      if (result.ok) router.refresh();
    });
  };

  return (
    <form onSubmit={save} className="space-y-3">
      <div>
        <label className="label" htmlFor="accountUsername">
          Username
        </label>
        <input
          id="accountUsername"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_USERNAME_LENGTH}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="field"
        />
        <p className="mt-1.5 text-xs text-muted">What you type to sign in. Letters, numbers, dots, dashes and underscores.</p>
      </div>
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <button type="submit" disabled={saving || unchanged || draft.trim() === ""} className="btn">
        {saving ? "Saving…" : "Change username"}
      </button>
    </form>
  );
}

function PasswordForm() {
  const empty = { current: "", password: "", confirm: "" };
  const [form, setForm] = useState(empty);
  const [message, setMessage] = useState<Message>(null);
  const [saving, startSaving] = useTransition();

  const set = (field: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [field]: e.target.value });

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const check = checkPassword(form.password, form.confirm);
    if (!check.ok) return setMessage({ tone: "error", text: check.error });
    startSaving(async () => {
      setMessage(null);
      const result = await changePassword(form);
      setMessage({ tone: result.ok ? "ok" : "error", text: result.message });
      if (result.ok) setForm(empty);
    });
  };

  return (
    <form onSubmit={save} className="space-y-3">
      <div>
        <label className="label" htmlFor="currentPassword">
          Current password
        </label>
        <PasswordInput id="currentPassword" autoComplete="current-password" value={form.current} onChange={set("current")} />
      </div>
      <div>
        <label className="label" htmlFor="newPassword">
          New password
        </label>
        <PasswordInput
          id="newPassword"
          autoComplete="new-password"
          value={form.password}
          onChange={set("password")}
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        />
      </div>
      <div>
        <label className="label" htmlFor="confirmPassword">
          New password again
        </label>
        <PasswordInput id="confirmPassword" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} />
      </div>
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <button type="submit" disabled={saving || !form.current || !form.password} className="btn">
        {saving ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
