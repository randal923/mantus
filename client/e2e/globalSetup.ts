import { spawn } from "node:child_process";
import { once } from "node:events";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../server",
);

/**
 * Boots the real game server (playtest harness, local docker Postgres) for
 * the browser e2e tests and tears it down when the run ends.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  if (process.env.PLAYTEST_EXTERNAL_SERVER === "1") {
    return () => Promise.resolve();
  }
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/playtest/e2eServer.ts"],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        PLAYTEST_PORT: "4124",
        PLAYTEST_DATABASE: "playtest_e2e",
      },
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  let output = "";
  await new Promise<void>((resolve, reject) => {
    child.on("exit", (code) =>
      reject(new Error(`e2e game server exited with code ${String(code)}`)),
    );
    child.stdout.on("data", (chunk: Buffer) => {
      process.stdout.write(chunk);
      output += chunk.toString();
      if (output.includes("E2E_SERVER_READY")) resolve();
    });
  });
  return async () => {
    child.kill("SIGTERM");
    await once(child, "exit");
  };
}
