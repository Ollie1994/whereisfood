import { useState } from "react";
import { loginStatusFor, type LoginStatus } from "@/lib/login";
import { supabaseClient } from "@/lib/supabase-browser";

// The login form's state: the email, and what the last send did. One send at a time:
// each `signInWithOtp` writes a new PKCE code verifier to a cookie, even one Auth refuses
// (read in `@supabase/auth-js` 2.106.2), and an earlier emailed link then fails its
// exchange (probed on the local stack for a second send, PR #236).
export function useLogin(): {
  email: string;
  setEmail: (email: string) => void;
  status: LoginStatus;
  attempted: boolean;
  submit: () => Promise<void>;
  resend: () => void;
} {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<LoginStatus>("idle");
  // Whether a send has been tried on this page, so an old `?error=` alert isn't shown
  // again when `resend` returns to "idle".
  const [attempted, setAttempted] = useState(false);

  async function submit() {
    // Not while sending, nor once sent: Enter in the email field submits the form even
    // with the send button hidden. A new link takes `resend` first.
    if (status === "sending" || status === "sent") return;
    setAttempted(true);
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

  // Back to the form after a link was sent. A send from there replaces that link, so it
  // takes this explicit step rather than a second tap on the same button.
  function resend() {
    setStatus("idle");
  }

  return { email, setEmail, status, attempted, submit, resend };
}
