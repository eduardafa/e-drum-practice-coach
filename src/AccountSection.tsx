import { useState } from "react";
import { PROVIDER_LABEL, signInUrl, type Account, type SignInResult } from "./account/account";
import { releasing } from "./releasing";
import { ProviderLogo } from "./account/ProviderLogo";
import { Avatar } from "./account/Avatar";
import type { SyncStatus } from "./history/useSync";

interface Props {
  account: Account;
  /** How the last sign-in went, when the app was just opened by its redirect. */
  signInResult: SignInResult | null;
  syncStatus: SyncStatus;
  onSignOut: () => Promise<boolean>;
  onSignOutAndRemove: () => Promise<boolean>;
  onDeleteAccount: () => Promise<boolean>;
}

/** How syncing is going, in a few words. */
function syncText(status: SyncStatus): string {
  switch (status.state) {
    case "syncing":
      return "Syncing your history…";
    case "synced":
      return `History synced at ${status.at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}. It appears on any device where you sign in.`;
    case "offline":
      return "You're offline. Your history will sync when you're back online.";
    case "error":
      return "Couldn't sync just now. It'll try again in a minute.";
    case "full":
      return "Your synced history is full. New sessions stay in this browser.";
    case "off":
      return "History syncs while you're signed in.";
  }
}

const RESULT_TEXT: Record<SignInResult, string> = {
  ok: "You're signed in.",
  failed: "Sign-in didn't work. Please try again.",
  canceled: "Sign-in was canceled. Nothing changed.",
  unavailable: "That sign-in option isn't set up yet.",
};

/** Signing in to sync history across devices: the account menu's content. */
export function AccountSection({ account, signInResult, syncStatus, onSignOut, onSignOutAndRemove, onDeleteAccount }: Props) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  // The sign-in message is about the redirect that opened the app; signing out makes it stale.
  const [resultShown, setResultShown] = useState(true);

  /** Runs an account action, with a busy state and a message if it fails. */
  const act = async (action: () => Promise<boolean>, failure: string, after?: () => void) => {
    setBusy(true);
    const ok = await action();
    setBusy(false);
    setFailed(ok ? null : failure);
    if (ok) {
      setResultShown(false);
      after?.();
    }
  };
  const offline = "Check your connection and try again.";

  return (
    <div className="account">
      <h3>Sync across devices</h3>
      {/* The signed-in card already says "Signed in", so "ok" only shows if that didn't stick. */}
      {signInResult && resultShown && !(signInResult === "ok" && account.status === "signed-in") && (
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
          {deleted && (
            <p className="account-result" aria-live="polite">
              Your account and its synced history were deleted.
            </p>
          )}
          <p className="hint">
            Your history is saved in this browser only. Sign in to keep it safe and see it on your other devices.
          </p>
          {account.providers.length === 0 ? (
            <p className="hint">Sign-in isn't set up yet.</p>
          ) : (
            <div className="signin-buttons">
              {account.providers.map((p) => (
                <a key={p} className={`signin-button ${p}`} href={signInUrl(p)}>
                  <ProviderLogo provider={p} />
                  <span>Sign in with {PROVIDER_LABEL[p]}</span>
                </a>
              ))}
            </div>
          )}
          <p className="hint">
            The app keeps your account number, name and picture from GitHub or Google, never your email.{" "}
            <a href="/privacy">Privacy</a>
          </p>
        </>
      )}

      {account.status === "signed-in" && (
        <>
          <div className="account-card">
            <span className={`account-badge ${account.provider} ${account.avatarUrl ? "has-picture" : ""}`}>
              <Avatar provider={account.provider} url={account.avatarUrl} size={40} />
            </span>
            <span className="account-text">
              <strong>{account.name ?? `Signed in with ${PROVIDER_LABEL[account.provider]}`}</strong>
              {account.name && (
                <span className="account-provider">
                  <ProviderLogo provider={account.provider} size={12} /> Signed in with {PROVIDER_LABEL[account.provider]}
                </span>
              )}
              <span className={`sync-status ${syncStatus.state}`} aria-live="polite">
                {syncText(syncStatus)}
              </span>
            </span>
            <button
              className="secondary"
              disabled={busy}
              onClick={releasing(() => void act(onSignOut, `Couldn't sign out. ${offline}`))}
            >
              Sign out
            </button>
          </div>
          {failed && <p className="hint warn-note">{failed}</p>}

          <div className="account-more">
            {/* For a computer that isn't yours: your synced sessions don't stay behind. */}
            <button
              className="secondary"
              disabled={busy}
              onClick={releasing(() => void act(onSignOutAndRemove, `Couldn't sign out. ${offline}`))}
            >
              Sign out and remove your history from this browser
            </button>
            {confirmingDelete ? (
              <div className="account-delete">
                <p>
                  Delete your account and all the history synced to it, on every device? History saved in this browser
                  stays here. This can't be undone.
                </p>
                <div className="calibration-actions">
                  <button
                    className="primary danger"
                    disabled={busy}
                    onClick={releasing(
                      () => void act(onDeleteAccount, `Couldn't delete your account. ${offline}`, () => setDeleted(true)),
                    )}
                  >
                    Delete account
                  </button>
                  <button className="secondary" disabled={busy} onClick={releasing(() => setConfirmingDelete(false))}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button className="secondary danger" disabled={busy} onClick={releasing(() => setConfirmingDelete(true))}>
                Delete my account
              </button>
            )}
          </div>
          <p className="hint">
            <a href="/privacy">Privacy</a>
          </p>
        </>
      )}
    </div>
  );
}
