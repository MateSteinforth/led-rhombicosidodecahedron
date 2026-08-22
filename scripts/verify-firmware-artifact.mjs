import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const [receiptPath, ...artifactPaths] = process.argv.slice(2);
if (!receiptPath || artifactPaths.length === 0) {
  throw new Error(
    "Usage: node scripts/verify-firmware-artifact.mjs <receipt.json> <firmware.bin> [...]",
  );
}

const root = resolve(import.meta.dirname, "..");
const [receiptBytes, override, requirements] = await Promise.all([
  readFile(receiptPath, "utf8"),
  readFile(resolve(root, "firmware/wled-platformio.ini")),
  readFile(resolve(root, "wled/upstream/requirements.txt")),
]);
const receipt = JSON.parse(receiptBytes);
const expectedTarget = {
  board: "ESP32-DevKitC V4",
  module: "ESP32-WROOM-32E-N4",
  platformioEnvironment: "orbital_esp32dev",
  upstreamEnvironment: "esp32dev",
  wledCommit: "d9b9a846561227351ad929e3109781daadb7bed2",
  platformioVersion: "6.1.18",
  platformVersion: "2026.02.30",
  frameworkVersion: "3.3.7+sha.b3b492ff",
  toolchainVersion: "15.1.0+20250607",
  esptoolVersion: "5.1.2",
};
if (
  receipt?.schemaVersion !== "1.0.0" ||
  receipt?.status !== "built-not-flashed" ||
  JSON.stringify(receipt?.target) !== JSON.stringify(expectedTarget) ||
  receipt?.inputs?.pipZipapp?.version !== "26.2.1" ||
  receipt?.inputs?.pipZipapp?.sha256 !==
    "91d5fd9f6f25549fd839c60536c6f1b945316ce3588d34a605635b6071c91526" ||
  receipt?.inputs?.uvVersion !== "0.12.5" ||
  receipt?.inputs?.platformioOverrideSha256 !==
    createHash("sha256").update(override).digest("hex") ||
  receipt?.inputs?.upstreamRequirementsSha256 !==
    createHash("sha256").update(requirements).digest("hex") ||
  receipt?.artifact?.name !== "wled-orbital-esp32dev.bin" ||
  !Number.isInteger(receipt?.artifact?.byteLength) ||
  !/^[0-9a-f]{64}$/.test(receipt?.artifact?.sha256 ?? "")
) {
  throw new Error("The firmware build receipt is invalid.");
}

for (const artifactPath of artifactPaths) {
  const artifact = await readFile(artifactPath);
  const sha256 = createHash("sha256").update(artifact).digest("hex");
  if (
    artifact.byteLength !== receipt.artifact.byteLength ||
    sha256 !== receipt.artifact.sha256
  ) {
    throw new Error(`${artifactPath} does not match the firmware build receipt.`);
  }
  console.log(`${artifactPath}: ${artifact.byteLength} bytes, ${sha256}`);
}
