import LoginForm from "@/components/Admin/LoginForm";
import { callbackErrorMessage } from "@/lib/login";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { error } = await searchParams;

  return (
    <>
      <h1 className="text-2xl font-semibold">Logga in</h1>
      <p className="text-sm text-foreground/70">
        Vi skickar en inloggningslänk till din e-post. Öppna den i samma webbläsare.
      </p>
      <LoginForm linkError={callbackErrorMessage(error)} />
    </>
  );
}
