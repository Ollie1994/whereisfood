import { useState } from "react";
import { loginStatusFor, type LoginStatus } from "@/lib/login";
import { supabaseClient } from "@/lib/supabase-browser";

// The login form's state: the email, and what the last send did. One send at a time:
// each `signInWithOtp` writes a new PKCE code verifier to a cookie, and an earlier
// emailed link then fails its exchange (probed on the local stack, PR for IS #222).
export function useLogin(): {
  email: string;
  setEmail: (email: string) => void;
  status: LoginStatus;
  submit: () => Promise<void>;
} {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<LoginStatus>("idle");

  async function submit() {
    if (status === "sending") return;
    setStatus("sending");

    try {
      const { error } = await supabaseClient.auth.signInWithOtp({
        email: email.trim(),
        options: {
          // A link for an email with no auth user creates none (also refused by
          // `[auth] enable_signup = false`, plan step 2).
          shouldCreateUser: false,
          emailRedirectTo: new URL("/auth/callback", window.location.origin).href,
        },
      });
      setStatus(loginStatusFor(error));
    } catch {
      setStatus("failed");
    }
  }

  return { email, setEmail, status, submit };
}
