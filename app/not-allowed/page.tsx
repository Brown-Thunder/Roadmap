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
          <svg width="30" height="26" viewBox="0 0 122 104" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M105.793 26.3962H86.4293C85.253 13.2727 74.1686 2.95496 60.7769 2.95496C47.34 2.95496 36.3009 13.2727 35.1246 26.3962H15.7609C8.97452 26.3962 3.45496 31.9171 3.45496 38.7051V88.529C3.45496 95.3169 8.97452 100.838 15.7609 100.838H105.838C112.625 100.838 118.144 95.3169 118.144 88.529V38.7051C118.144 31.9171 112.579 26.3962 105.793 26.3962ZM49.8283 31.8266C51.1856 36.6234 55.5741 40.1079 60.7769 40.1079C65.9798 40.1079 70.3683 36.5782 71.7256 31.8266H80.8645C79.281 41.194 70.685 49.7016 61.6365 58.6618C61.3651 58.9333 61.0484 59.2048 60.7769 59.5216C60.5055 59.2501 60.1888 58.9785 59.9173 58.6618C50.8689 49.7016 42.2728 41.194 40.6894 31.8266H49.8283ZM54.8502 28.7493C54.8502 25.4911 57.5195 22.8212 60.7769 22.8212C64.0344 22.8212 66.7037 25.4911 66.7037 28.7493C66.7037 32.0076 64.0344 34.6775 60.7769 34.6775C57.5195 34.6775 54.8502 32.0076 54.8502 28.7493ZM56.117 62.5083C57.0218 63.4134 57.9719 64.3184 58.8768 65.2687C59.3744 65.7665 60.0983 66.0833 60.7769 66.0833C61.4556 66.0833 62.1795 65.8118 62.6771 65.2687C63.582 64.3637 64.532 63.4134 65.4369 62.5083C75.3902 52.6431 84.8458 43.2304 86.3388 31.8266H95.2968V95.4527H26.2571V31.8266H35.215C36.6628 43.2756 46.1184 52.6431 56.117 62.5083ZM60.7769 8.4306C71.1827 8.4306 79.8239 16.3047 80.955 26.4414H71.8613C70.7755 21.2825 66.206 17.436 60.7317 17.436C55.2574 17.436 50.6879 21.2825 49.6021 26.4414H40.5084C41.7299 16.3047 50.3712 8.4306 60.7769 8.4306ZM8.8388 88.5742V38.7051C8.8388 34.9038 11.9153 31.8266 15.7156 31.8266H20.828V95.4527H15.7156C11.9605 95.4527 8.8388 92.3755 8.8388 88.5742ZM112.715 88.5742C112.715 92.3755 109.639 95.4527 105.838 95.4527H100.726V31.8266H105.838C109.639 31.8266 112.715 34.9038 112.715 38.7051V88.5742Z" fill="#102A56"/>
          </svg>
          <div className="brand-titles">
            <span className="brand-wordmark">Stasher</span>
            <span className="brand-divider" />
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
