"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { signIn, signUp } from "@/lib/authActions";
import { MAX_USERNAME_LENGTH, MIN_PASSWORD_LENGTH, checkPassword, checkUsername, defaultUsername } from "@/lib/credentials";
import { MAX_NAME_LENGTH, normalizeName } from "@/lib/roster";
import { PasswordInput } from "./PasswordInput";
import { Banner } from "./ui";

type Message = { tone: "ok" | "error"; text: string } | null;

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<Message>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return setMessage({ tone: "error", text: "Enter your username." });
    startTransition(async () => {
      setMessage(null);
      const result = await signIn({ username, password });
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
        <label className="label" htmlFor="loginUsername">
          Username
        </label>
        <input
          id="loginUsername"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="field"
        />
      </div>
      <div>
        <label className="label" htmlFor="loginPassword">
          Password
        </label>
        <PasswordInput
          id="loginPassword"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <button type="submit" disabled={pending} className="btn">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", username: "", password: "", confirm: "" });
  // Until they type their own, the name suggests a username.
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [pending, startTransition] = useTransition();

  const set = (field: "password" | "confirm") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [field]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // The same checks the server runs (bar the name being taken), so a typo is caught before the round trip.
    if (normalizeName(form.name) === "") return setMessage({ tone: "error", text: "Enter your name." });
    const username = checkUsername(form.username);
    if (!username.ok) return setMessage({ tone: "error", text: username.error });
    const password = checkPassword(form.password, form.confirm);
    if (!password.ok) return setMessage({ tone: "error", text: password.error });

    startTransition(async () => {
      setMessage(null);
      const result = await signUp(form);
      if (!result.ok) return setMessage({ tone: "error", text: result.message });
      router.push("/profile");
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="registerName">
          Name
        </label>
        <input
          id="registerName"
          autoComplete="nickname"
          value={form.name}
          onChange={(e) => {
            const name = e.target.value;
            setForm({ ...form, name, username: usernameEdited ? form.username : defaultUsername(name) });
          }}
          maxLength={MAX_NAME_LENGTH * 2}
          className="field"
        />
        <p className="mt-1.5 text-xs text-muted">How you show up on the leaderboard. You can change it later.</p>
      </div>
      <div>
        <label className="label" htmlFor="registerUsername">
          Username
        </label>
        <input
          id="registerUsername"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={form.username}
          onChange={(e) => {
            setUsernameEdited(true);
            setForm({ ...form, username: e.target.value });
          }}
          maxLength={MAX_USERNAME_LENGTH}
          className="field"
        />
        <p className="mt-1.5 text-xs text-muted">What you type to sign in. Only you see it.</p>
      </div>
      <div>
        <label className="label" htmlFor="registerPassword">
          Password
        </label>
        <PasswordInput
          id="registerPassword"
          autoComplete="new-password"
          value={form.password}
          onChange={set("password")}
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        />
      </div>
      <div>
        <label className="label" htmlFor="registerConfirm">
          Password again
        </label>
        <PasswordInput id="registerConfirm" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} />
      </div>
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <button type="submit" disabled={pending} className="btn">
        {pending ? "Signing up…" : "Sign up"}
      </button>
    </form>
  );
}
