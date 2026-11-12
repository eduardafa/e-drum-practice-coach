import { useCallback, useEffect, useState } from "react";
import { fetchAccount, signOut as postSignOut, type Account } from "./account";

/** The account, loaded once when the app opens, and a way to sign out. */
export function useAccount() {
  const [account, setAccount] = useState<Account>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetchAccount(controller.signal).then(setAccount, () => {}); // only rejects when aborted
    return () => controller.abort();
  }, []);

  /** Resolves false if the server couldn't be reached (still signed in). */
  const signOut = useCallback(async () => {
    try {
      await postSignOut();
    } catch (error) {
      console.warn("Couldn't sign out:", error);
      return false;
    }
    setAccount((a) => (a.status === "signed-in" ? { status: "signed-out", providers: a.providers } : a));
    return true;
  }, []);

  return { account, signOut };
}
