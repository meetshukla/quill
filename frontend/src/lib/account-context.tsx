"use client";

import * as React from "react";
import { api } from "./api";
import type { XAccount } from "./types";

type AccountContextValue = {
  account: XAccount | null;
  loading: boolean;
  /** null = unknown yet, true/false = reachable or not */
  online: boolean | null;
  error: string | null;
  refresh: () => Promise<void>;
};

const AccountContext = React.createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = React.useState<XAccount | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [online, setOnline] = React.useState<boolean | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { account } = await api.getAccount();
      setAccount(account);
      setOnline(true);
    } catch (err) {
      setOnline(false);
      setAccount(null);
      setError(err instanceof Error ? err.message : "Failed to load account");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = React.useMemo(
    () => ({ account, loading, online, error, refresh }),
    [account, loading, online, error, refresh],
  );

  return (
    <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
  );
}

export function useAccount() {
  const ctx = React.useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used within AccountProvider");
  return ctx;
}
