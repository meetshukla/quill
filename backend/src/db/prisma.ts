import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

// WAL lets the API and the worker process read/write the SQLite file
// concurrently without SQLITE_BUSY errors. journal_mode persists in the
// database file; busy_timeout is per-connection, so writers wait instead of
// failing if the other process holds the write lock.
await prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL;");
await prisma.$queryRawUnsafe("PRAGMA busy_timeout=5000;");
