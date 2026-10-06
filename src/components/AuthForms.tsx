"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { requestClaim, signIn } from "@/lib/authActions";
import { MIN_PASSWORD_LENGTH, checkPassword, normalizePhone } from "@/lib/credentials";
import type { LoginChoice } from "@/lib/queries";
import { Banner } from "./ui";

type Message = { tone: "ok" | "error"; text: string } | null;

export function LoginForm({ choices, next }: { choices: LoginChoice[]; next: string }) {
  const router = useRouter();
  const [accountId, setAccountId] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<Message>(null);
  const [pending, startTransition] = useTransition();

  if (choices.length === 0) {
    return <p className="text-sm text-muted">Nobody has an account yet.</p>;
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId) return setMessage({ tone: "error", text: "Pick your name." });
    startTransition(async () => {
      setMessage(null);
      const result = await signIn({ accountId, password });
      if (!result.ok) {
        setMessage({ tone: "error", text: result.message });
        setPassword("");
        return;
      }
      router.push(next);
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="loginWho">
          Who are you?
        </label>
        <select id="loginWho" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="field">
          <option value="">Pick your name</option>
          {choices.map((c) => (
            <option key={c.accountId} value={c.accountId}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="loginPassword">
          Password
        </label>
        <input
          id="loginPassword"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field"
        />
      </div>
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <button type="submit" disabled={pending} className="btn">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export function ClaimForm({ athletes }: { athletes: Array<{ id: string; name: string }> }) {
  const [form, setForm] = useState({ athleteId: "", phone: "", password: "", confirm: "" });
  const [message, setMessage] = useState<Message>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done && message) {
    return (
      <div className="space-y-4">
        <Banner tone="ok">{message.text}</Banner>
        <Link href="/login" className="btn btn-ghost">
          Go to sign in
        </Link>
      </div>
    );
  }

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [field]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // The same checks the server runs, so a typo is caught before the round trip.
    if (!form.athleteId) return setMessage({ tone: "error", text: "Pick your name from the list." });
    const phone = normalizePhone(form.phone);
    if (!phone.ok) return setMessage({ tone: "error", text: phone.error });
    const password = checkPassword(form.password, form.confirm);
    if (!password.ok) return setMessage({ tone: "error", text: password.error });

    startTransition(async () => {
      setMessage(null);
      const result = await requestClaim(form);
      setMessage({ tone: result.ok ? "ok" : "error", text: result.message });
      if (result.ok) setDone(true);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="claimWho">
          Which athlete are you?
        </label>
        <select id="claimWho" value={form.athleteId} onChange={set("athleteId")} className="field">
          <option value="">Pick your name</option>
          {athletes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="claimPhone">
          Phone number
        </label>
        <input
          id="claimPhone"
          type="tel"
          autoComplete="tel"
          value={form.phone}
          onChange={set("phone")}
          placeholder="Only the admin sees it, and it's deleted once they decide"
          className="field"
        />
      </div>
      <div>
        <label className="label" htmlFor="claimPassword">
          Password
        </label>
        <input
          id="claimPassword"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={set("password")}
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          className="field"
        />
      </div>
      <div>
        <label className="label" htmlFor="claimConfirm">
          Password again
        </label>
        <input
          id="claimConfirm"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={set("confirm")}
          className="field"
        />
      </div>
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <button type="submit" disabled={pending} className="btn">
        {pending ? "Sending…" : "Send claim"}
      </button>
    </form>
  );
}
