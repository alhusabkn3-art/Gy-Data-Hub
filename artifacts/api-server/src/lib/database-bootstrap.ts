import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

let initialized = false;
let initializing: Promise<void> | null = null;

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      'DATABASE_URL is required before database initialization.',
    );
  }

  return url;
}

async function readBootstrapSql(): Promise<string> {
  const currentFile = fileURLToPath(import.meta.url);

  const possiblePaths = [
    // Production:
    // /opt/render/project/src/artifacts/api-server/dist/...
    path.resolve(
      path.dirname(currentFile),
      '../../../db/bootstrap.sql',
    ),

    // Development/source:
    path.resolve(
      path.dirname(currentFile),
      '../../../../db/bootstrap.sql',
    ),

    // Render working directory:
    path.resolve(
      process.cwd(),
      '../../db/bootstrap.sql',
    ),

    // Project root when started from repository root:
    path.resolve(
      process.cwd(),
      'db/bootstrap.sql',
    ),
  ];

  for (const filePath of possiblePaths) {
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch {
      // Try the next known location.
    }
  }

  throw new Error(
    [
      'Unable to locate db/bootstrap.sql.',
      'Checked:',
      ...possiblePaths,
    ].join('\n'),
  );
}

async function runBootstrap(): Promise<void> {
  if (initialized) {
    return;
  }

  const databaseUrl = getDatabaseUrl();

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false,
    },
    max: 2,
  });

  try {
    const sql = await readBootstrapSql();

    if (!sql.trim()) {
      throw new Error(
        'db/bootstrap.sql is empty.',
      );
    }

    await pool.query(sql);

    initialized = true;
  } finally {
    await pool.end();
  }
}

export async function initializeDatabase(): Promise<void> {
  if (initialized) {
    return;
  }

  if (!initializing) {
    initializing = runBootstrap().finally(() => {
      initializing = null;
    });
  }

  await initializing;
}
