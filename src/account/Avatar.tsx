import { useState } from "react";
import type { Provider } from "./account";
import { ProviderLogo } from "./ProviderLogo";

/**
 * The drummer's profile picture from GitHub or Google, or the provider's
 * mark when there is none or it fails to load. Decorative: the name or the
 * button's label says who it is. No referrer is sent to the image server.
 */
export function Avatar({ provider, url, size }: { provider: Provider; url: string | null; size: number }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <ProviderLogo provider={provider} size={Math.round(size * 0.55)} />;
  return (
    <img
      className="avatar"
      src={url}
      alt=""
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
