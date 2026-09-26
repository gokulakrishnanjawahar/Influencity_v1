// ─────────────────────────────────────────────
// Export Contract ABIs for the Backend
// ─────────────────────────────────────────────
// Run with: npm run export:abis   (after `npx hardhat compile`)
//
// Why this exists:
// The server used to read ABIs straight out of artifacts/ at runtime. That works
// on a dev machine and nowhere else — artifacts/ is gitignored, so it is absent
// from every deployment, and the path escaped the server/ directory, so hosting
// server/ as its own project could not reach it either. The path was also built
// at runtime, which means bundlers cannot trace it even when the files do exist.
//
// This script snapshots the ABIs into a committed module that the server imports
// statically. Re-run it whenever a contract's external interface changes.
// ─────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ARTIFACTS = join(ROOT, "artifacts", "contracts");
const OUT_DIR = join(ROOT, "server", "src", "abis");
const OUT_FILE = join(OUT_DIR, "index.js");

// contract name → the contracts/ subdirectory it lives in
const CONTRACTS = {
  CampaignFactory: "core",
  CampaignEscrow: "core",
  ReputationToken: "core",
  MetricsConsumer: "oracle",
};

function readAbi(name, dir) {
  const path = join(ARTIFACTS, dir, `${name}.sol`, `${name}.json`);
  if (!existsSync(path)) {
    throw new Error(
      `Artifact missing for ${name} at ${path}\n` +
        "Run `npx hardhat compile` first."
    );
  }
  const artifact = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(artifact.abi)) {
    throw new Error(`Artifact for ${name} has no abi array`);
  }
  return artifact.abi;
}

function main() {
  const entries = Object.entries(CONTRACTS).map(([name, dir]) => {
    const abi = readAbi(name, dir);
    console.log(`  ✓ ${name.padEnd(18)} ${String(abi.length).padStart(3)} entries`);
    return [name, abi];
  });

  const body = entries
    .map(([name, abi]) => `export const ${name}ABI = ${JSON.stringify(abi, null, 2)};`)
    .join("\n\n");

  const map = entries.map(([name]) => `  ${name}: ${name}ABI,`).join("\n");

  const file = `// ─────────────────────────────────────────────
// GENERATED FILE — DO NOT EDIT BY HAND
// ─────────────────────────────────────────────
// Produced by scripts/exportAbis.js from the Hardhat artifacts.
// Regenerate after any change to a contract's external interface:
//
//   npx hardhat compile && npm run export:abis
//
// Committed deliberately: the server imports these statically so that hosting
// does not depend on artifacts/, which is gitignored and lives outside server/.
// ─────────────────────────────────────────────

${body}

/// @notice Lookup used by the blockchain service
export const ABIS = {
${map}
};
`;

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, file);

  const kb = (Buffer.byteLength(file) / 1024).toFixed(1);
  console.log(`\n  Wrote server/src/abis/index.js (${kb} KB)\n`);
}

main();
