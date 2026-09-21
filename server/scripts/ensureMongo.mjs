// Auto-starts the local dev MongoDB replica-set node if it isn't already running,
// so `npm run dev:server` works standalone without a separate manual mongod step.
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { existsSync, mkdirSync, openSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { MongoClient } from 'mongodb';

const HOST = '127.0.0.1';
const PORT = 27018;
const REPL_SET = 'rs0';
const ROOT_DIR = path.resolve(fileURLToPath(import.meta.url), '../../..');
const DB_PATH = path.join(ROOT_DIR, '.mongo-data-dev');
const MONGOD_CANDIDATES = [
  'C:/Program Files/MongoDB/Server/8.2/bin/mongod.exe',
  'C:/Program Files/MongoDB/Server/7.0/bin/mongod.exe',
  'C:/Program Files/MongoDB/Server/6.0/bin/mongod.exe',
  'mongod',
];

function isPortOpen(host, port, timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

function findMongod() {
  for (const candidate of MONGOD_CANDIDATES) {
    if (candidate === 'mongod' || existsSync(candidate)) return candidate;
  }
  return null;
}

async function waitFor(conditionFn, { intervalMs = 300, timeoutMs = 15000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await conditionFn()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

async function startMongod() {
  const mongodPath = findMongod();
  if (!mongodPath) {
    console.error(
      '[ensureMongo] Could not find mongod.exe. Install MongoDB Community Server or start ' +
        `mongod manually: mongod --dbpath "${DB_PATH}" --port ${PORT} --replSet ${REPL_SET} --bind_ip ${HOST}`,
    );
    process.exit(1);
  }

  mkdirSync(DB_PATH, { recursive: true });
  const logPath = path.join(DB_PATH, 'mongod.log');
  const out = openSync(logPath, 'a');
  const err = openSync(logPath, 'a');

  console.log(`[ensureMongo] Starting dev mongod on ${HOST}:${PORT} (dbpath: ${DB_PATH})`);
  const child = spawn(
    mongodPath,
    ['--dbpath', DB_PATH, '--port', String(PORT), '--replSet', REPL_SET, '--bind_ip', HOST],
    { detached: true, stdio: ['ignore', out, err] },
  );
  child.unref();

  const up = await waitFor(() => isPortOpen(HOST, PORT));
  if (!up) {
    console.error(`[ensureMongo] mongod did not come up on port ${PORT} in time. Check ${logPath}`);
    process.exit(1);
  }
}

async function ensureReplicaSetInitiated() {
  const client = new MongoClient(`mongodb://${HOST}:${PORT}/?directConnection=true`);
  try {
    await client.connect();
    const admin = client.db('admin').admin();
    try {
      await admin.command({ replSetGetStatus: 1 });
      return; // already initiated
    } catch {
      console.log('[ensureMongo] Initiating single-node replica set rs0...');
      await admin.command({
        replSetInitiate: {
          _id: REPL_SET,
          members: [{ _id: 0, host: `${HOST}:${PORT}` }],
        },
      });
      await waitFor(async () => {
        try {
          const status = await admin.command({ replSetGetStatus: 1 });
          return status.myState === 1; // PRIMARY
        } catch {
          return false;
        }
      });
    }
  } finally {
    await client.close();
  }
}

async function main() {
  const alreadyUp = await isPortOpen(HOST, PORT);
  if (!alreadyUp) {
    await startMongod();
  } else {
    console.log(`[ensureMongo] mongod already running on ${HOST}:${PORT}`);
  }
  await ensureReplicaSetInitiated();
  console.log('[ensureMongo] MongoDB dev replica set ready.');
}

main().catch((e) => {
  console.error('[ensureMongo] Failed:', e);
  process.exit(1);
});
