import type { PrismaClient, XAccount } from "@prisma/client";

export type ManagedAccount = Pick<XAccount, "id" | "userId" | "username" | "displayName" | "avatarUrl" | "writeEnabled" | "lastSyncedAt" | "analyticsLastSyncedAt"> & {
  owner: { id: string; name: string | null; email: string };
  isOwner: boolean;
};

export async function listManagedAccounts(prisma: PrismaClient, userId: string): Promise<ManagedAccount[]> {
  const accounts = await prisma.xAccount.findMany({
    where: { managers: { some: { userId } } },
    orderBy: { username: "asc" },
    select: {
      id: true, userId: true, username: true, displayName: true, avatarUrl: true,
      writeEnabled: true, lastSyncedAt: true, analyticsLastSyncedAt: true,
      user: { select: { id: true, name: true, email: true } }
    }
  });
  return accounts.map((account) => ({ ...account, owner: account.user, isOwner: account.userId === userId }));
}

export async function requireManagedAccount(prisma: PrismaClient, userId: string, accountId?: string): Promise<XAccount> {
  if (!accountId) throw new Error("Select a managed X account before changing content");
  const access = await prisma.managedAccountAccess.findUnique({
    where: { userId_xAccountId: { userId, xAccountId: accountId } },
    include: { xAccount: true }
  });
  if (!access) throw new Error("managed_x_account_not_found");
  return access.xAccount;
}

export async function ownAccount(prisma: PrismaClient, userId: string): Promise<XAccount | null> {
  return prisma.xAccount.findUnique({ where: { userId } });
}

// A second private member may connect after the migration has run. Ensure the
// small approved member set can immediately manage that new account too.
export async function grantPrivateMembersAccess(prisma: PrismaClient, xAccountId: string) {
  const users = await prisma.user.findMany({ select: { id: true } });
  await Promise.all(users.map((user) => prisma.managedAccountAccess.upsert({
    where: { userId_xAccountId: { userId: user.id, xAccountId } },
    create: { userId: user.id, xAccountId },
    update: {}
  })));
}
