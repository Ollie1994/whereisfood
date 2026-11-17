import { MFA_TEXTS } from "@/lib/login";

// The enroll's QR code and its key, for an app that can't scan. The QR is the `data:` URL
// Auth's enroll answers (`data:image/svg+xml;utf-8,…`, local stack, the PR for IS #382), so
// it is drawn with no request.
export default function MfaEnroll({ qrCode, secret }: { qrCode: string | null; secret: string | null }) {
  if (!qrCode) return null;
  return (
    <div className="flex flex-col items-center gap-3">
      {/* A `data:` URL: `next/image` would only pass it through unoptimized. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qrCode} alt={MFA_TEXTS.qrAlt} width={200} height={200} className="rounded-md bg-white p-2" />
      {secret && (
        <p className="text-sm text-foreground/70">
          {MFA_TEXTS.secretNote}{" "}
          <code className="break-all font-mono text-foreground">{secret}</code>
        </p>
      )}
    </div>
  );
}
