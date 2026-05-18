"use client";

import { useEffect, useState } from "react";
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

    const sessionPromise = code ? client.auth.exchangeCodeForSession(code) : client.auth.getSession();

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
