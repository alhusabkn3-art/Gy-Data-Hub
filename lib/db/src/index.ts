import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

let poolInstance: pg.Pool | undefined;
let dbInstance: ReturnType<typeof drizzle> | undefined;
let initialized = false;

function ensureInitialized() {
  if (initialized) return;
  
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }
  
  poolInstance = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });
  dbInstance = drizzle(poolInstance, { schema });
  initialized = true;
}

export function getPool(): pg.Pool {
  ensureInitialized();
  return poolInstance!;
}

export function getDb(): ReturnType<typeof drizzle> {
  ensureInitialized();
  return dbInstance!;
}

// Lazy getters for backward compatibility with existing imports
export const pool = new Proxy({} as pg.Pool, {
  get(target, prop) {
    return (getPool() as any)[prop];
  },
  has(target, prop) {
    return prop in getPool();
  },
  ownKeys(target) {
    return Reflect.ownKeys(getPool());
  },
  getOwnPropertyDescriptor(target, prop) {
    return Reflect.getOwnPropertyDescriptor(getPool(), prop);
  },
});

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(target, prop) {
    return (getDb() as any)[prop];
  },
  has(target, prop) {
    return prop in getDb();
  },
  ownKeys(target) {
    return Reflect.ownKeys(getDb());
  },
  getOwnPropertyDescriptor(target, prop) {
    return Reflect.getOwnPropertyDescriptor(getDb(), prop);
  },
});

export * from "./schema";
