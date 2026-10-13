"use client";

import { useSignIn } from "@clerk/nextjs";

export default function SignInPage() {
  const { signIn, isLoaded } = useSignIn();

  async function handleGoogleSignIn() {
    if (!isLoaded) return;
    const origin = window.location.origin;
    await signIn.authenticateWithRedirect({
      strategy: "oauth_google",
      redirectUrl: `${origin}/sso-callback`,
      redirectUrlComplete: `${origin}/view`,
    });
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Brand lockup */}
        <div className="auth-brand">
          <img src="/brand/stasher-logo-icon-blue.svg" alt="Stasher" width={40} height={36} />
          <div className="auth-brand-text">
            <span className="brand-product">Pulse</span>
          </div>
        </div>

        <h1 className="auth-title">Sign in to your account</h1>
        <p className="auth-subtitle">Use your Stasher Google account to continue</p>

        <button
          className="auth-google-btn"
          onClick={handleGoogleSignIn}
          disabled={!isLoaded}
        >
          <GoogleIcon />
          Sign in with Google
        </button>

        <p className="auth-hint">
          Access is restricted to Stasher team members.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  );
}
