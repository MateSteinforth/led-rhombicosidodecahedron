import multicastDns from "multicast-dns";
import type { Answer, Packet, RecordType } from "dns-packet";
import { networkInterfaces } from "node:os";
import {
  isPrivateDeviceAddress,
  type SculptureNetwork,
} from "../src/hardware/WledDevices.ts";

export function sculptureNetworks(): SculptureNetwork[] {
  return Object.entries(networkInterfaces())
    .flatMap(([name, entries]) =>
      (entries ?? [])
        .filter(
          (entry) =>
            !entry.internal &&
            entry.family === "IPv4" &&
            isPrivateDeviceAddress(entry.address),
        )
        .map((entry) => ({
          name,
          address: entry.address,
          netmask: entry.netmask,
        })),
    )
    .slice(0, 8);
}

function ipv4Number(address: string): number {
  return (
    address
      .split(".")
      .reduce((result, value) => (result << 8) | Number(value), 0) >>> 0
  );
}

export function onSculptureNetwork(
  address: string,
  networks: SculptureNetwork[],
): boolean {
  return (
    isPrivateDeviceAddress(address) &&
    networks.some(
      (network) =>
        (ipv4Number(address) & ipv4Number(network.netmask)) ===
        (ipv4Number(network.address) & ipv4Number(network.netmask)),
    )
  );
}

export interface WledDiscovery {
  scan(networks: SculptureNetwork[]): Promise<string[]>;
  close(): void;
}

/** The pinned WLED advertises _wled._tcp on port 80, with a MAC TXT value.
 * A fresh bounded browse prevents stale DNS-SD address caches after DHCP changes.
 * TXT and service names are hints only; the caller verifies /json/info.
 */
export function createWledDiscovery(
  create: typeof multicastDns = multicastDns,
  durationMs = 1800,
): WledDiscovery {
  let cancel: (() => void) | undefined;
  return {
    scan(networks) {
      cancel?.();
      return new Promise((resolve, reject) => {
        const clients: multicastDns.MulticastDNS[] = [];
        const records = new Map<string, Answer>();
        const failures = new Set<multicastDns.MulticastDNS>();
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          clients.forEach((client) => client.destroy());
          cancel = undefined;
          if (clients.length && failures.size === clients.length) {
            reject(
              new Error(
                "Multicast discovery is unavailable. Use Find by IP and check local network permissions.",
              ),
            );
            return;
          }
          const services = new Set<string>();
          for (const record of records.values()) {
            if (
              record.type === "PTR" &&
              record.name.toLowerCase() === "_wled._tcp.local"
            )
              services.add(record.data.toLowerCase());
          }
          const hosts = new Set<string>();
          for (const record of records.values()) {
            if (
              record.type === "SRV" &&
              services.has(record.name.toLowerCase()) &&
              record.data.port === 80
            )
              hosts.add(record.data.target.toLowerCase());
          }
          const addresses = new Set<string>();
          for (const record of records.values()) {
            if (
              record.type === "A" &&
              hosts.has(record.name.toLowerCase()) &&
              onSculptureNetwork(record.data, networks)
            )
              addresses.add(record.data);
          }
          resolve([...addresses].slice(0, 32));
        };
        const timer = setTimeout(finish, durationMs);
        cancel = finish;
        for (const network of networks) {
          const client = create({
            interface: network.address,
            bind: "0.0.0.0",
            reuseAddr: true,
          });
          clients.push(client);
          client.on("error", () => {
            failures.add(client);
          });
          const queried = new Set<string>();
          const query = (name: string, type: RecordType): void => {
            const key = `${type}:${name.toLowerCase()}`;
            if (
              settled ||
              queried.has(key) ||
              queried.size >= 96 ||
              name.length > 253 ||
              !name.toLowerCase().endsWith(".local")
            )
              return;
            queried.add(key);
            client.query({ questions: [{ name, type }] }, (error) => {
              if (error) failures.add(client);
            });
          };
          client.on("response", (packet: Packet) => {
            if (settled) return;
            for (const record of [
              ...(packet.answers ?? []),
              ...(packet.additionals ?? []),
            ]) {
              if (
                (record.type !== "PTR" &&
                  record.type !== "SRV" &&
                  record.type !== "A") ||
                record.name.length > 253
              )
                continue;
              const key = `${record.type}:${record.name.toLowerCase()}:${JSON.stringify(record.data)}`;
              if (record.ttl === 0) {
                records.delete(key);
                continue;
              }
              if (records.size < 256) records.set(key, record);
              if (
                record.type === "PTR" &&
                record.name.toLowerCase() === "_wled._tcp.local"
              )
                query(record.data, "SRV");
              if (
                record.type === "SRV" &&
                record.name.toLowerCase().endsWith("._wled._tcp.local") &&
                record.data.port === 80
              )
                query(record.data.target, "A");
            }
          });
          query("_wled._tcp.local", "PTR");
        }
        if (networks.length === 0) finish();
      });
    },
    close() {
      cancel?.();
    },
  };
}
