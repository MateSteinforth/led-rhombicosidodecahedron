import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { isLoopbackHost } from "./editor-pipeline-handler.ts";
import {
  createWledDiscovery,
  sculptureNetworks,
  onSculptureNetwork,
  type WledDiscovery,
} from "./wled-discovery.ts";
import {
  normalizeDeviceMac,
  isPrivateDeviceAddress,
  parseSculpturePairing,
  parseWledIdentity,
  type SculptureNetwork,
  type SculpturePairing,
  type SculptureDevicesSnapshot,
  type WledDeviceIdentity,
} from "../src/hardware/WledDevices.ts";

const ENDPOINT = "/api/sculpture-devices";
const MAX_DEVICES = 32;

export interface SculptureDevicesHandler {
  handle(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
  close(): void;
}

export async function readWledIdentity(
  address: string,
  fetcher: typeof fetch = fetch,
): Promise<WledDeviceIdentity> {
  if (!isPrivateDeviceAddress(address))
    throw new Error("Use a private IPv4 device address.");
  const response = await fetcher(`http://${address}/json/info`, {
    redirect: "error",
    signal: AbortSignal.timeout(2000),
  });
  if (!response.ok || !response.body)
    throw new Error("WLED identity could not be read.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 64 * 1024) throw new Error("WLED identity is too large.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return parseWledIdentity(
    JSON.parse(Buffer.concat(chunks).toString("utf8")),
    address,
  );
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const data = Buffer.from(chunk);
    bytes += data.length;
    if (bytes > 2048) throw new Error("Device request is too large.");
    chunks.push(data);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createSculptureDevicesHandler(options: {
  registryPath: string;
  discovery?: WledDiscovery;
  networks?: () => SculptureNetwork[];
  inspect?: (address: string) => Promise<WledDeviceIdentity>;
  now?: () => number;
}): SculptureDevicesHandler {
  const discovery = options.discovery ?? createWledDiscovery();
  const inspect = options.inspect ?? readWledIdentity;
  const networks = options.networks ?? sculptureNetworks;
  const now = options.now ?? Date.now;
  let pairings: SculpturePairing[] = [];
  let observations: WledDeviceIdentity[] = [];
  const manualAddresses = new Set<string>();
  let scanRequest: Promise<void> | undefined;
  let lastScan = -Infinity;
  let error: string | undefined;
  let closed = false;
  let mutation: Promise<unknown> = Promise.resolve();
  const loaded = (async () => {
    try {
      const bytes = await readFile(options.registryPath, "utf8");
      if (bytes.length > 64 * 1024)
        throw new Error("Device registry is too large.");
      const value = JSON.parse(bytes) as {
        schemaVersion?: unknown;
        pairings?: unknown;
      };
      if (
        value.schemaVersion !== "1.0.0" ||
        !Array.isArray(value.pairings) ||
        value.pairings.length > MAX_DEVICES
      )
        throw new Error("Invalid device registry.");
      const parsed = value.pairings.map(parseSculpturePairing);
      if (new Set(parsed.map((p) => p.mac)).size !== parsed.length)
        throw new Error("Duplicate device registry identity.");
      pairings = parsed;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "ENOENT")
        throw new Error(
          "Device pairings could not be loaded. Restore the registry backup before changing pairings.",
        );
    }
  })();
  // Keep a malformed registry fail-closed without an unhandled rejection.
  void loaded.catch(() => undefined);

  const snapshot = (): SculptureDevicesSnapshot => {
    const ids = new Set([
      ...pairings.map((p) => p.mac),
      ...observations.map((p) => p.mac),
    ]);
    return {
      networks: networks(),
      scanning: !!scanRequest,
      error,
      devices: [...ids].sort().map((mac) => {
        const found = observations.filter((p) => p.mac === mac);
        return {
          mac,
          pairing: pairings.find((p) => p.mac === mac),
          identity: found.length === 1 ? found[0] : undefined,
          status:
            found.length > 1 ? "conflict" : found.length ? "online" : "offline",
        };
      }),
    };
  };

  const scan = (): void => {
    if (closed || scanRequest || now() - lastScan < 4000) return;
    lastScan = now();
    scanRequest = (async () => {
      const active = networks();
      let discoveryError: string | undefined;
      const advertised = await discovery
        .scan(active)
        .catch((cause: unknown) => {
          discoveryError =
            cause instanceof Error
              ? cause.message
              : "Multicast discovery failed. Use Find by IP.";
          return [];
        });
      const addresses = [
        ...new Set([
          ...advertised,
          ...manualAddresses,
          ...pairings.map((p) => p.address),
        ]),
      ]
        .filter((a) => onSculptureNetwork(a, active))
        .slice(0, MAX_DEVICES);
      const next: WledDeviceIdentity[] = [];
      // Four concurrent HTTP requests, with a two-second bound per request.
      let index = 0;
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          while (!closed && index < addresses.length) {
            const address = addresses[index++]!;
            try {
              next.push(await inspect(address));
            } catch {
              /* Unverified candidates never appear as WLED. */
            }
          }
        }),
      );
      if (!closed) observations = next;
      error = active.length
        ? discoveryError
        : "No private IPv4 network found. Connect the laptop to the sculpture router.";
    })()
      .catch((cause: unknown) => {
        observations = [];
        error =
          cause instanceof Error ? cause.message : "Device discovery failed.";
      })
      .finally(() => {
        scanRequest = undefined;
      });
  };

  const save = async (next: SculpturePairing[]): Promise<void> => {
    await mkdir(dirname(options.registryPath), { recursive: true });
    const temporary = `${options.registryPath}.${randomUUID()}.tmp`;
    try {
      await writeFile(
        temporary,
        JSON.stringify({ schemaVersion: "1.0.0", pairings: next }) + "\n",
        { mode: 0o600, flag: "wx" },
      );
      await rename(temporary, options.registryPath);
      pairings = next;
    } finally {
      await rm(temporary, { force: true });
    }
  };

  return {
    close() {
      closed = true;
      discovery.close();
    },
    async handle(request, response) {
      const path = new URL(request.url ?? "/", "http://localhost").pathname;
      if (path !== ENDPOINT) return false;
      const send = (status: number, value: unknown): void => {
        response.statusCode = status;
        response.setHeader("Content-Type", "application/json");
        response.setHeader("Cache-Control", "no-store");
        response.end(JSON.stringify(value));
      };
      if (
        !isLoopbackHost(request.headers.host) ||
        request.headers["x-loo-ume-devices"] !== "1" ||
        (request.headers.origin !== undefined &&
          request.headers.origin !== `http://${request.headers.host}`)
      ) {
        send(403, {
          error: "Device discovery accepts only local application requests.",
        });
        return true;
      }
      try {
        await loaded;
        if (request.method === "GET") {
          scan();
          send(200, snapshot());
          return true;
        }
        if (request.method !== "POST") {
          send(405, { error: "Use GET or POST." });
          return true;
        }
        if (
          request.headers.origin !== `http://${request.headers.host}` ||
          request.headers["content-type"] !== "application/json"
        ) {
          send(403, { error: "Device changes require a local JSON request." });
          return true;
        }
        const body = (await readBody(request)) as Record<string, unknown>;
        const run = async (): Promise<void> => {
          if (body.action === "forget") {
            const mac = normalizeDeviceMac(body.mac);
            await save(pairings.filter((p) => p.mac !== mac));
          } else if (body.action === "pair") {
            const pairing = parseSculpturePairing(body.pairing);
            if (!onSculptureNetwork(pairing.address, networks()))
              throw new Error("Connect to the device's local network first.");
            const current = await inspect(pairing.address);
            if (current.mac !== pairing.mac)
              throw new Error(
                "Device identity changed. Discover and select the controller again.",
              );
            if (
              snapshot().devices.find((d) => d.mac === pairing.mac)?.status ===
              "conflict"
            )
              throw new Error(
                "More than one address reports this identity. Resolve the conflict before pairing.",
              );
            const next = [
              ...pairings.filter((p) => p.mac !== pairing.mac),
              pairing,
            ];
            if (next.length > MAX_DEVICES)
              throw new Error("At most 32 devices can be paired.");
            await save(next);
          } else if (body.action === "inspect") {
            if (
              typeof body.address !== "string" ||
              !onSculptureNetwork(body.address, networks())
            )
              throw new Error(
                "Enter a private IPv4 address on the laptop's network.",
              );
            // Do not race a browse completion that would discard the manual result.
            await scanRequest;
            const identity = await inspect(body.address);
            if (
              manualAddresses.size >= MAX_DEVICES &&
              !manualAddresses.has(body.address)
            )
              throw new Error(
                "At most 32 manual addresses can be checked per session.",
              );
            manualAddresses.add(body.address);
            observations = [
              ...observations.filter((p) => p.address !== identity.address),
              identity,
            ].slice(-MAX_DEVICES);
          } else throw new Error("Unknown device action.");
        };
        const pending = mutation.then(run);
        mutation = pending.catch(() => undefined);
        await pending;
        send(200, snapshot());
      } catch (cause) {
        send(400, {
          error:
            cause instanceof Error ? cause.message : "Device request failed.",
        });
      }
      return true;
    },
  };
}
