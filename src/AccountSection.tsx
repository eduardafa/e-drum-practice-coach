import { useState } from "react";
import { PROVIDER_LABEL, signInUrl, type Account, type SignInResult } from "./account/account";
import { releasing } from "./releasing";

interface Props {
  account: Account;
  /** How the last sign-in went, when the app was just opened by its redirect. */
  signInResult: SignInResult | null;
  onSignOut: () => Promise<boolean>;
}

const RESULT_TEXT: Record<SignInResult, string> = {
  ok: "You're signed in.",
  failed: "Sign-in didn't work. Please try again.",
  cancelled: "Sign-in was cancelled. Nothing changed.",
  unavailable: "That sign-in option isn't set up yet.",
};

/** Signing in to sync history across devices, at the end of the History panel. */
export function AccountSection({ account, signInResult, onSignOut }: Props) {
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  // The sign-in message is about the redirect that opened the app; signing out makes it stale.
  const [resultShown, setResultShown] = useState(true);

  const signOut = async () => {
    setSigningOut(true);
    const ok = await onSignOut();
    setSigningOut(false);
    setSignOutFailed(!ok);
    if (ok) setResultShown(false);
  };

  return (
    <div className="account">
      <h3>Sync across devices</h3>
      {signInResult && resultShown && (
        <p className={`account-result ${signInResult === "ok" ? "" : "warn-note"}`} aria-live="polite">
          {RESULT_TEXT[signInResult]}
        </p>
      )}

      {account.status === "loading" && <p className="hint">Checking your account…</p>}

      {account.status === "unavailable" && (
        <p className="hint">
          Your history is saved in this browser only. Signing in isn't available right now (you may be offline, or on a
          test version of the app).
        </p>
      )}

      {account.status === "signed-out" && (
        <>
          <p className="hint">
            Your history is saved in this browser only. Sign in to keep it safe on the server and see it on your other
            devices. Syncing is coming soon: for now, signing in only sets up your account.
          </p>
          {account.providers.length === 0 ? (
            <p className="hint">Sign-in isn't set up yet.</p>
          ) : (
            <div className="account-providers">
              {account.providers.map((p) => (
                <a key={p} className="account-link" href={signInUrl(p)}>
                  Sign in with {PROVIDER_LABEL[p]}
                </a>
              ))}
            </div>
          )}
          <p className="hint">
            The app keeps only your account number from GitHub or Google: never your email or name.{" "}
            <a href="/privacy">Privacy</a>
          </p>
        </>
      )}

      {account.status === "signed-in" && (
        <>
          <p className="account-who">
            Signed in with {PROVIDER_LABEL[account.provider]}.{" "}
            <button className="link-button" disabled={signingOut} onClick={releasing(() => void signOut())}>
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </p>
          {signOutFailed && <p className="hint warn-note">Couldn't sign out. Check your connection and try again.</p>}
          <p className="hint">
            Syncing is coming soon. Until then, your history stays in this browser. <a href="/privacy">Privacy</a>
          </p>
        </>
      )}
    </div>
  );
}
