import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const [binaryArgument, outputArgument] = process.argv.slice(2);
if (!binaryArgument || !outputArgument) {
  throw new Error(
    "Usage: node scripts/create-firmware-receipt.mjs <firmware.bin> <receipt.json>",
  );
}

const root = resolve(import.meta.dirname, "..");
const upstream = resolve(root, "wled/upstream");
const binaryPath = resolve(root, binaryArgument);
const outputPath = resolve(root, outputArgument);
const overridePath = resolve(root, "firmware/wled-platformio.ini");
const requirementsPath = resolve(upstream, "requirements.txt");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function packageVersion(relativePath) {
  const metadata = JSON.parse(await readFile(resolve(root, relativePath), "utf8"));
  if (typeof metadata.version !== "string") {
    throw new Error(`${relativePath} has no package version.`);
  }
  return metadata.version;
}

const [binary, override, requirements] = await Promise.all([
  readFile(binaryPath),
  readFile(overridePath),
  readFile(requirementsPath),
]);
if (!requirements.toString("utf8").includes("platformio==6.1.18")) {
  throw new Error("The pinned WLED requirements no longer select PlatformIO 6.1.18.");
}
const receipt = {
  schemaVersion: "1.0.0",
  status: "built-not-flashed",
  target: {
    board: "ESP32-DevKitC V4",
    module: "ESP32-WROOM-32E-N4",
    platformioEnvironment: "orbital_esp32dev",
    upstreamEnvironment: "esp32dev",
    wledCommit: "d9b9a846561227351ad929e3109781daadb7bed2",
    platformioVersion: "6.1.18",
    platformVersion: await packageVersion(
      "build/platformio-core/platforms/espressif32/platform.json",
    ),
    frameworkVersion: await packageVersion(
      "build/platformio-core/packages/framework-arduinoespressif32/package.json",
    ),
    toolchainVersion: await packageVersion(
      "build/platformio-core/packages/toolchain-xtensa-esp-elf/package.json",
    ),
    esptoolVersion: await packageVersion(
      "build/platformio-core/packages/tool-esptoolpy/package.json",
    ),
  },
  inputs: {
    pipZipapp: {
      version: "26.2.1",
      sha256: "91d5fd9f6f25549fd839c60536c6f1b945316ce3588d34a605635b6071c91526",
    },
    uvVersion: "0.12.5",
    platformioOverrideSha256: sha256(override),
    upstreamRequirementsSha256: sha256(requirements),
  },
  artifact: {
    name: basename(binaryPath),
    byteLength: binary.byteLength,
    sha256: sha256(binary),
  },
};

await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`Wrote ${outputArgument} for ${receipt.artifact.sha256}.`);
