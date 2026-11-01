import "server-only";
import { MongoClient } from "mongodb";

const g = globalThis as unknown as { _mvDb?: Promise<ReturnType<MongoClient["db"]>> };

async function connect() {
  const db = (await new MongoClient(process.env.MONGODB_URI!).connect()).db(process.env.MONGODB_DB);
  const days = Number(process.env.AUDIT_RETENTION_DAYS ?? 90);
  await Promise.all([
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db.collection("vaults").createIndex({ userId: 1 }, { unique: true }),
    db.collection("items").createIndex({ userId: 1, updatedAt: 1 }),
    db.collection("items").createIndex({ deletedAt: 1 }, { expireAfterSeconds: 30 * 86400 }), // trash purges itself after 30 days
    db.collection("sessions").createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection("sessions").createIndex({ absoluteExpiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("auditLogs").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("auditLogs").createIndex({ createdAt: 1 }, { expireAfterSeconds: days * 86400 }),
    db.collection("rateLimits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
  return db;
}

/** Cached across dev hot reloads. Indexes are created once per process. */
export const getDb = () => (g._mvDb ??= connect());
