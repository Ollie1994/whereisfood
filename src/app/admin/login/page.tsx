import LoginForm from "@/components/Admin/LoginForm";
import { LOGOUT_FAILED_ERROR, loginErrorMessage } from "@/lib/login";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { error } = await searchParams;
  const text = loginErrorMessage(error);
  // A failed logout's warning stays after a link is sent, since its text asks for a new login
  // (the owner, IS #385); a link error hides then. Its reach: `/auth/logout`'s limits.
  const logoutFailed = error === LOGOUT_FAILED_ERROR;

  return (
    <>
      <h1 className="text-2xl font-semibold">Logga in</h1>
      <p className="text-sm text-foreground/70">
        Vi skickar en inloggningslänk till din e-post. Öppna den i samma webbläsare.
      </p>
      <LoginForm linkError={logoutFailed ? null : text} logoutWarning={logoutFailed ? text : null} />
    </>
  );
}
