import { useEffect, useRef } from "react";
import { PROVIDER_LABEL, type Account, type SignInResult } from "./account/account";
import { ProviderLogo } from "./account/ProviderLogo";
import { AccountSection } from "./AccountSection";

interface Props {
  account: Account;
  signInResult: SignInResult | null;
  open: boolean;
  onToggle: () => void;
  onSignOut: () => Promise<boolean>;
}

/**
 * The account button in the top bar and the menu it opens: signing in, and
 * (with sync) how syncing is going. Hidden while sign-in can't work here
 * (offline, a preview, local development). Closing follows the app's panel
 * rule: Esc, a press outside, or the button again.
 */
export function AccountMenu({ account, signInResult, open, onToggle, onSignOut }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDialogElement>(null);
  const wasOpen = useRef(false);

  // Focus moves into the menu when it opens, and back to the button when it
  // closes, unless the drummer has moved on to something else.
  useEffect(() => {
    if (open) menuRef.current?.focus();
    else if (wasOpen.current) {
      const active = document.activeElement;
      if (!active || active === document.body || menuRef.current?.contains(active)) buttonRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  if (account.status !== "signed-in" && account.status !== "signed-out") return null;
  const signedIn = account.status === "signed-in";

  return (
    <div className="account-menu-anchor">
      <button
        ref={buttonRef}
        className={`account-button ${signedIn ? `signed-in ${account.provider}` : "secondary"} ${open ? "selected" : ""}`}
        aria-expanded={open}
        aria-controls="account-menu"
        aria-label={signedIn ? `Account: signed in with ${PROVIDER_LABEL[account.provider]}` : undefined}
        title={signedIn ? `Signed in with ${PROVIDER_LABEL[account.provider]}` : undefined}
        onClick={onToggle}
      >
        {signedIn ? <ProviderLogo provider={account.provider} size={20} /> : "Sign in"}
      </button>
      {open && (
        // A non-modal <dialog>: the page stays usable, and a press outside closes it.
        <dialog ref={menuRef} open id="account-menu" className="account-menu" aria-label="Account" tabIndex={-1}>
          <AccountSection account={account} signInResult={signInResult} onSignOut={onSignOut} />
        </dialog>
      )}
    </div>
  );
}
