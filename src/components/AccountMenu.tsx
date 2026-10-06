"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { initials } from "@/lib/profiles";
import { SignOutButton } from "./SignOutButton";

const ITEM =
  "block w-full px-4 py-2.5 text-left font-display text-sm font-medium uppercase tracking-[0.1em] text-paper transition-colors hover:bg-surface/50 focus:bg-surface/50 focus:outline-none disabled:opacity-40";

export interface AccountSummary {
  name: string;
  /** The athlete's photo (a public/ path), if they have one. Staff logins never do. */
  photo: string;
  /** Athlete accounts have a profile page; staff logins don't. */
  hasProfile: boolean;
  isAdmin: boolean;
}

/**
 * Who's signed in, at the right of the header: a round avatar (their photo, or their
 * initials) that opens a small menu with their profile, the admin page for the admin,
 * and signing out. Signed out, it's a plain "Sign in" link.
 */
export function AccountMenu({ account }: { account: AccountSummary | null }) {
  const pathname = usePathname();
  const menuId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [focusFirst, setFocusFirst] = useState(false);

  // Going to another page, from the menu or anywhere else, closes it.
  useEffect(() => setOpen(false), [pathname]);

  // A keyboard opener lands on the first item; a mouse click doesn't.
  useEffect(() => {
    if (open && focusFirst) wrapperRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open, focusFirst]);

  // While open, a press anywhere else closes it, and so does Escape wherever focus is
  // (after a mouse click it's still on the avatar, not in the menu).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      if (wrapperRef.current?.contains(document.activeElement)) buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!account) {
    return (
      <Link href="/login" className="btn btn-ghost shrink-0">
        Sign in
      </Link>
    );
  }

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(at + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(at - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Account menu for ${account.name}`}
        onClick={(e) => {
          setFocusFirst(e.detail === 0);
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setFocusFirst(true);
            setOpen(true);
          }
        }}
        className={[
          "flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 bg-surface transition-colors",
          open ? "border-accent" : "border-[var(--edge-strong)] hover:border-accent",
        ].join(" ")}
      >
        <Avatar name={account.name} photo={account.photo} />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full z-50 mt-2 w-[200px] overflow-hidden rounded-lg border border-[var(--edge-strong)] bg-ink py-1 shadow-lg"
        >
          <p className="truncate border-b border-[var(--edge)] px-4 pb-2.5 pt-2 text-xs text-muted">
            Signed in as <span className="text-paper">{account.name}</span>
          </p>
          {account.hasProfile ? (
            <Link href="/profile" role="menuitem" className={ITEM}>
              Profile
            </Link>
          ) : null}
          {account.isAdmin ? (
            <Link href="/admin" role="menuitem" className={ITEM}>
              Admin
            </Link>
          ) : null}
          <SignOutButton role="menuitem" className={ITEM} />
        </div>
      ) : null}
    </div>
  );
}

/** The photo, cropped to the circle, or the initials if there's none or it won't load. */
function Avatar({ name, photo }: { name: string; photo: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photo]);

  if (photo && !failed) {
    // A plain <img>: a public/ file at a fixed small size, like AthletePhoto.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt="" onError={() => setFailed(true)} className="h-full w-full object-cover" />;
  }
  return (
    <span aria-hidden="true" className="font-display text-sm font-bold text-paper">
      {initials(name)}
    </span>
  );
}
