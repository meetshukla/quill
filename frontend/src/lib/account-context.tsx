"use client";

import * as React from "react";
import { api, getSelectedAccountId, setSelectedAccountId } from "./api";
import type { ManagedAccount, XAccount } from "./types";

type AccountContextValue = {
  account: XAccount | null;
  accounts: ManagedAccount[];
  selectedAccount: ManagedAccount | null;
  selectAccount: (accountId: string) => void;
  loading: boolean;
  /** null = unknown yet, true/false = reachable or not */
  online: boolean | null;
  error: string | null;
  refresh: () => Promise<void>;
};

const AccountContext = React.createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = React.useState<XAccount | null>(null);
  const [accounts, setAccounts] = React.useState<ManagedAccount[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [online, setOnline] = React.useState<boolean | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ account }, managed] = await Promise.all([api.getAccount(), api.listManagedAccounts()]);
      setAccount(account);
      setAccounts(managed.accounts);
      const stored = getSelectedAccountId();
      const selected = managed.accounts.find((item) => item.id === stored) ?? managed.accounts.find((item) => item.isOwner) ?? managed.accounts[0];
      if (selected) setSelectedAccountId(selected.id);
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

  const selectAccount = React.useCallback((accountId: string) => {
    if (!accounts.some((candidate) => candidate.id === accountId)) return;
    setSelectedAccountId(accountId);
    setAccounts((current) => [...current]);
    window.dispatchEvent(new Event("quill-account-changed"));
  }, [accounts]);
  const selectedAccount = accounts.find((candidate) => candidate.id === getSelectedAccountId()) ?? null;
  const value = React.useMemo(
    () => ({ account, accounts, selectedAccount, selectAccount, loading, online, error, refresh }),
    [account, accounts, selectedAccount, selectAccount, loading, online, error, refresh],
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
