"use client";

import { useEffect, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase-client";

export default function AuthCallbackPage() {
  const [message, setMessage] = useState("Signing you in...");

  useEffect(() => {
    const client = getSupabaseClient();

    if (!client) {
      setMessage("Cloud login is not configured.");
      return;
    }

    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const tokenHash = url.searchParams.get("token_hash");
    const type = (url.searchParams.get("type") || "magiclink") as EmailOtpType;
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const urlError = url.searchParams.get("error_description") || hashParams.get("error_description");

    if (urlError) {
      setMessage(urlError);
      return;
    }

    const sessionPromise = code
      ? client.auth.exchangeCodeForSession(code)
      : accessToken && refreshToken
        ? client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        : tokenHash
          ? client.auth.verifyOtp({ token_hash: tokenHash, type })
          : client.auth.getSession();

    sessionPromise
      .then(({ data, error }) => {
        if (error) {
          setMessage(error.message);
          return;
        }

        if (!data.session && !("user" in data && data.user)) {
          setMessage("The sign-in link was not accepted. Request a fresh email and try again.");
          return;
        }

        window.location.replace("/");
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "Sign-in failed.");
      });
  }, []);

  return (
    <main className="auth-callback">
      <section>
        <h1>{message}</h1>
        <p>You can close this page if the app has already opened.</p>
      </section>
    </main>
  );
}
