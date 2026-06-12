"use client";

import { useUser, useClerk } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";

export default function UserMenu() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!user) return null;

  const initials = [user.firstName, user.lastName]
    .filter(Boolean)
    .map((n) => n![0].toUpperCase())
    .join("") || user.primaryEmailAddress?.emailAddress[0].toUpperCase() || "?";

  const displayName = user.fullName || user.primaryEmailAddress?.emailAddress || "";
  const email = user.primaryEmailAddress?.emailAddress || "";
  const avatar = user.imageUrl;

  return (
    <div className="um" ref={ref}>
      <button className="um-trigger" onClick={() => setOpen((o) => !o)} aria-label="User menu">
        {avatar
          ? <img src={avatar} alt={displayName} className="um-avatar" />
          : <span className="um-initials">{initials}</span>
        }
      </button>

      {open && (
        <div className="um-dropdown">
          <div className="um-user">
            {avatar
              ? <img src={avatar} alt={displayName} className="um-avatar um-avatar-lg" />
              : <span className="um-initials um-initials-lg">{initials}</span>
            }
            <div className="um-user-info">
              {displayName && <span className="um-name">{displayName}</span>}
              <span className="um-email">{email}</span>
            </div>
          </div>

          <div className="um-divider" />

          <button
            className="um-item um-item-danger"
            onClick={() => signOut({ redirectUrl: "/sign-in" })}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
