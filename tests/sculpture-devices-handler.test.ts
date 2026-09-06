import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it, vi } from "vitest";
import {
  createSculptureDevicesHandler,
  readWledIdentity,
  type SculptureDevicesHandler,
} from "../scripts/sculpture-devices-handler.ts";
import type {
  SculptureDevicesSnapshot,
  SculpturePairing,
  WledDeviceIdentity,
} from "../src/hardware/WledDevices.ts";

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
const a: WledDeviceIdentity = {
  mac: "aabbcc112233",
  address: "192.168.8.20",
  name: "Same name",
  architecture: "esp32",
  version: "0.16",
  build: 2609061,
  ledCount: 2624,
};
const b = { ...a, mac: "aabbcc445566", address: "192.168.8.21" };
const pairing: SculpturePairing = {
  mac: a.mac,
  address: a.address,
  projectId: "sculpture-a",
  projectName: "First sculpture",
  fingerprint: "524500f5",
};

async function fixture(path?: string) {
  const directory = await mkdtemp(join(tmpdir(), "loo-devices-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const registryPath = path ?? join(directory, "devices.json");
  let time = 0;
  const live = new Map([a, b].map((d) => [d.address, d]));
  const inspect = vi.fn(async (address: string) => {
    const device = live.get(address);
    if (!device) throw new Error("Offline");
    return device;
  });
  const discovery = {
    scan: vi.fn(async () => [...live.keys()]),
    close: vi.fn(),
  };
  const handler = createSculptureDevicesHandler({
    registryPath,
    inspect,
    discovery,
    now: () => time,
    networks: () => [
      { name: "en0", address: "192.168.8.10", netmask: "255.255.255.0" },
    ],
  });
  const url = await serve(handler);
  const request = (body?: unknown, extra: Record<string, string> = {}) =>
    fetch(url, {
      method: body ? "POST" : "GET",
      headers: {
        "X-LOO-UME-Devices": "1",
        Origin: new URL(url).origin,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...extra,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  const scan = async (): Promise<SculptureDevicesSnapshot> => {
    time += 5000;
    await request();
    let snapshot: SculptureDevicesSnapshot;
    do {
      snapshot = (await (await request()).json()) as SculptureDevicesSnapshot;
    } while (snapshot.scanning);
    return snapshot;
  };
  return { registryPath, request, scan, live, inspect, discovery };
}
async function serve(handler: SculptureDevicesHandler): Promise<string> {
  const server: Server = createServer((req, res) => {
    void handler.handle(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(async () => {
    handler.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/sculpture-devices`;
}

it("discovers duplicate names read-only and keeps pairings through IP changes and restart", async () => {
  const f = await fixture();
  expect((await f.scan()).devices.map((d) => d.mac)).toEqual([a.mac, b.mac]);
  await expect(readFile(f.registryPath)).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect((await f.request({ action: "pair", pairing })).status).toBe(200);
  f.live.delete(a.address);
  f.live.set("192.168.8.80", { ...a, address: "192.168.8.80" });
  let found = (await f.scan()).devices.find((d) => d.mac === a.mac)!;
  expect(found.identity?.address).toBe("192.168.8.80");
  expect(found.pairing).toEqual(pairing);
  f.live.clear();
  found = (await f.scan()).devices[0]!;
  expect(found.status).toBe("offline");
  const restarted = await fixture(f.registryPath);
  restarted.live.clear();
  expect((await restarted.scan()).devices).toEqual([
    { mac: a.mac, status: "offline", pairing },
  ]);
});

it("rechecks identity before pairing and rejects duplicate MAC addresses", async () => {
  const f = await fixture();
  await f.scan();
  f.live.set(a.address, { ...b, address: a.address });
  expect((await f.request({ action: "pair", pairing })).status).toBe(400);
  await expect(readFile(f.registryPath)).rejects.toMatchObject({
    code: "ENOENT",
  });
  const result = await f.scan();
  expect(result.devices[0]?.status).toBe("conflict");
  expect(
    (await f.request({ action: "pair", pairing: { ...pairing, mac: b.mac } }))
      .status,
  ).toBe(400);
});

it("supports manual IP discovery when multicast is blocked and retains it during polls", async () => {
  const f = await fixture();
  f.discovery.scan.mockResolvedValue([]);
  expect(
    (await f.request({ action: "inspect", address: a.address })).status,
  ).toBe(200);
  expect((await f.scan()).devices[0]?.identity).toEqual(a);
  f.discovery.scan.mockRejectedValue(new Error("Multicast is blocked"));
  const fallback = await f.scan();
  expect(fallback.devices[0]?.identity).toEqual(a);
  expect(fallback.error).toBe("Multicast is blocked");
  expect(
    (await f.request({ action: "inspect", address: "192.168.9.20" })).status,
  ).toBe(400);
  expect(f.inspect).not.toHaveBeenCalledWith("192.168.9.20");
});

it("rejects external origins, public targets, malformed bodies and oversized requests", async () => {
  const f = await fixture();
  expect(
    (await f.request(undefined, { Origin: "https://example.com" })).status,
  ).toBe(403);
  expect(
    (await f.request({ action: "inspect", address: "8.8.8.8" })).status,
  ).toBe(400);
  expect(
    (
      await f.request({
        action: "pair",
        pairing: { ...pairing, fingerprint: "bad" },
      })
    ).status,
  ).toBe(400);
  expect(
    (await f.request({ action: "inspect", address: "x".repeat(3000) })).status,
  ).toBe(400);
  expect(f.inspect).not.toHaveBeenCalled();
});

it("serializes concurrent pairings and forgets only the selected identity", async () => {
  const f = await fixture();
  const second = {
    ...pairing,
    mac: b.mac,
    address: b.address,
    projectName: "Second sculpture",
  };
  await Promise.all([
    f.request({ action: "pair", pairing }),
    f.request({ action: "pair", pairing: second }),
  ]);
  expect(
    JSON.parse(await readFile(f.registryPath, "utf8")).pairings,
  ).toHaveLength(2);
  await f.request({ action: "forget", mac: a.mac });
  expect(JSON.parse(await readFile(f.registryPath, "utf8")).pairings).toEqual([
    second,
  ]);
});

it("does not overwrite a damaged registry", async () => {
  const f = await fixture();
  await writeFile(f.registryPath, "broken");
  const restarted = await fixture(f.registryPath);
  expect((await restarted.request({ action: "pair", pairing })).status).toBe(
    400,
  );
  expect(await readFile(f.registryPath, "utf8")).toBe("broken");
});

it("reads only bounded WLED identity JSON and rejects redirects and spoofed identity", async () => {
  const raw = {
    brand: "WLED",
    mac: "AA:BB:CC:11:22:33",
    ip: a.address,
    name: a.name,
    ver: a.version,
    arch: "esp32",
    vid: 2609061,
    leds: { count: 2624 },
  };
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(raw));
  expect(await readWledIdentity(a.address, fetcher)).toEqual(a);
  expect(fetcher).toHaveBeenCalledWith(
    `http://${a.address}/json/info`,
    expect.objectContaining({ redirect: "error" }),
  );
  await expect(readWledIdentity("example.com", fetcher)).rejects.toThrow(
    "private IPv4",
  );
  fetcher.mockResolvedValueOnce(Response.json({ ...raw, ip: b.address }));
  await expect(readWledIdentity(a.address, fetcher)).rejects.toThrow(
    "identity",
  );
  fetcher.mockResolvedValueOnce(new Response("x".repeat(65537)));
  await expect(readWledIdentity(a.address, fetcher)).rejects.toThrow(
    "too large",
  );
});
