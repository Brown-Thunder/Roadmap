"use client";

import { useEffect, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { ALLOWED_EMAIL_DOMAINS } from "@/lib/auth";

export default function NotAllowedPage() {
  const { signOut } = useClerk();
  const [signedOut, setSignedOut] = useState(false);

  // Don't leave a dangling session for a rejected account — sign them out on
  // arrival (without redirecting, so they can read the message).
  useEffect(() => {
    signOut({ redirectUrl: "/not-allowed" })
      .catch(() => {})
      .finally(() => setSignedOut(true));
  }, [signOut]);

  return (
    <div className="page">
      <div className="error-card">
        <div className="brand-lockup" style={{ marginBottom: 18 }}>
          <img src="/brand/stasher-logo-icon-blue.svg" alt="Stasher" width={32} height={29} />
          <div className="brand-titles">
            <span className="brand-product">Pulse</span>
          </div>
        </div>

        <h2 className="error-title">Access restricted</h2>
        <p className="error-msg">
          This tool is only available to Stasher team members. Please sign in with your
          Stasher Google account — accounts on these domains are allowed:
        </p>

        <div className="domain-list">
          {ALLOWED_EMAIL_DOMAINS.map((d) => (
            <span key={d} className="domain-chip">@{d}</span>
          ))}
        </div>

        <a href="/sign-in" className="btn primary" style={{ marginTop: 22, display: "inline-flex" }}>
          {signedOut ? "Back to sign in" : "Signing out…"}
        </a>
      </div>
    </div>
  );
}
