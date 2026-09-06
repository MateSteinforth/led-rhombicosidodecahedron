import { EventEmitter } from "node:events";
import type multicastDns from "multicast-dns";
import type { Packet } from "dns-packet";
import { expect, it, vi } from "vitest";
import {
  createWledDiscovery,
  onSculptureNetwork,
} from "../scripts/wled-discovery.ts";

const network = [
  { name: "en0", address: "192.168.8.10", netmask: "255.255.255.0" },
];
function fixture() {
  const emitter = Object.assign(new EventEmitter(), {
    query: vi.fn(),
    destroy: vi.fn(),
  });
  const create = vi.fn(() => emitter as unknown as multicastDns.MulticastDNS);
  return { emitter, create, discovery: createWledDiscovery(create, 15) };
}

it("resolves split DNS-SD records, queries missing records, ignores other services and remote addresses", async () => {
  const { emitter, create, discovery } = fixture();
  const scan = discovery.scan(network);
  emitter.emit("response", {
    answers: [
      {
        name: "_wled._tcp.local",
        type: "PTR",
        data: "Lamp._wled._tcp.local",
        ttl: 120,
      },
    ],
  } satisfies Packet);
  emitter.emit("response", {
    answers: [
      {
        name: "Lamp._wled._tcp.local",
        type: "SRV",
        data: { port: 80, priority: 0, weight: 0, target: "lamp.local" },
        ttl: 120,
      },
    ],
  } satisfies Packet);
  emitter.emit("response", {
    additionals: [
      { name: "lamp.local", type: "A", data: "192.168.8.20", ttl: 120 },
      { name: "lamp.local", type: "A", data: "192.168.9.20", ttl: 120 },
      { name: "camera.local", type: "A", data: "192.168.8.22", ttl: 120 },
    ],
  } satisfies Packet);
  expect(await scan).toEqual(["192.168.8.20"]);
  expect(emitter.query).toHaveBeenCalledWith(
    { questions: [{ name: "lamp.local", type: "A" }] },
    expect.any(Function),
  );
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      interface: network[0]!.address,
      bind: "0.0.0.0",
    }),
  );
  expect(emitter.destroy).toHaveBeenCalledOnce();
});

it("reports multicast permission failures without an unhandled error", async () => {
  const { emitter, discovery } = fixture();
  const scan = discovery.scan(network);
  emitter.emit("error", new Error("EACCES"));
  await expect(scan).rejects.toThrow("Find by IP");
  expect(emitter.destroy).toHaveBeenCalledOnce();
});

it("closes pending discovery and does not retain an old address cache", async () => {
  const { emitter, discovery } = fixture();
  const scan = discovery.scan(network);
  discovery.close();
  expect(await scan).toEqual([]);
  expect(emitter.destroy).toHaveBeenCalledOnce();
  expect(await discovery.scan([])).toEqual([]);
});

it("restricts probes to the actual connected private subnet", () => {
  expect(onSculptureNetwork("192.168.8.20", network)).toBe(true);
  for (const address of [
    "192.168.9.20",
    "127.0.0.1",
    "8.8.8.8",
    "192.168.008.20",
    "loo-ume.local",
    "192.168.8.20:80",
  ])
    expect(onSculptureNetwork(address, network)).toBe(false);
});
