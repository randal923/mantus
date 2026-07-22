/**
 * Runs in the browser before any test module loads: the client source reads
 * process.env.NEXT_PUBLIC_* (inlined by Next in the real app), so the e2e
 * bundle needs a process shim pointing at the playtest game server.
 */
const globalWithProcess = globalThis as {
  process?: { env: Record<string, string | undefined> };
};
globalWithProcess.process ??= { env: {} };
globalWithProcess.process.env.NODE_ENV ??= "test";
globalWithProcess.process.env.NEXT_PUBLIC_WS_URL = "ws://127.0.0.1:4124";

export {};
