/** Discovery metadata is not a verified output or audio contract. */
export interface WledDeviceIdentity {
  mac: string;
  name: string;
  address: string;
  version: string;
  build: number;
  architecture: string;
  ledCount: number;
}

export interface SculpturePairing {
  mac: string;
  address: string;
  projectId: string;
  projectName: string;
  fingerprint: string;
}

export interface SculptureDevice {
  mac: string;
  status: "online" | "offline" | "conflict";
  identity?: WledDeviceIdentity;
  pairing?: SculpturePairing;
}

export interface SculptureNetwork {
  name: string;
  address: string;
  netmask: string;
}

export interface SculptureDevicesSnapshot {
  devices: SculptureDevice[];
  networks: SculptureNetwork[];
  scanning: boolean;
  error?: string;
}

export function normalizeDeviceMac(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^(?:[\da-f]{12}|(?:[\da-f]{2}:){5}[\da-f]{2})$/i.test(value)
  ) {
    throw new Error("WLED did not provide a valid device MAC address.");
  }
  return value.replaceAll(":", "").toLowerCase();
}

export function isPrivateDeviceAddress(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(value)
  )
    return false;
  const p = value.split(".").map(Number);
  return (
    p.every((v) => v <= 255) &&
    (p[0] === 10 ||
      (p[0] === 172 && p[1]! >= 16 && p[1]! <= 31) ||
      (p[0] === 192 && p[1] === 168))
  );
}

export function parseWledIdentity(
  value: unknown,
  address: string,
): WledDeviceIdentity {
  if (!value || typeof value !== "object" || !isPrivateDeviceAddress(address))
    throw new Error("Invalid WLED response.");
  const info = value as Record<string, unknown>;
  const leds = info.leds as { count?: unknown } | undefined;
  if (
    info.brand !== "WLED" ||
    info.ip !== address ||
    typeof info.ver !== "string" ||
    info.ver.length > 80 ||
    typeof info.name !== "string" ||
    info.name.length > 128 ||
    typeof info.arch !== "string" ||
    info.arch.length > 40 ||
    !Number.isSafeInteger(info.vid) ||
    !Number.isSafeInteger(leds?.count) ||
    Number(leds?.count) < 1 ||
    Number(leds?.count) > 65535
  ) {
    throw new Error("This address did not return a supported WLED identity.");
  }
  return {
    mac: normalizeDeviceMac(info.mac),
    name: info.name,
    address,
    version: info.ver,
    build: Number(info.vid),
    architecture: info.arch,
    ledCount: Number(leds!.count),
  };
}

export function parseSculpturePairing(value: unknown): SculpturePairing {
  if (!value || typeof value !== "object")
    throw new Error("Invalid sculpture pairing.");
  const p = value as Record<string, unknown>;
  const mac = normalizeDeviceMac(p.mac);
  if (
    !isPrivateDeviceAddress(p.address) ||
    typeof p.projectId !== "string" ||
    p.projectId.length < 1 ||
    p.projectId.length > 200 ||
    typeof p.projectName !== "string" ||
    p.projectName.length < 1 ||
    p.projectName.length > 200 ||
    typeof p.fingerprint !== "string" ||
    !/^[\da-f]{8}$/.test(p.fingerprint)
  )
    throw new Error("Invalid sculpture pairing.");
  return {
    mac,
    address: p.address,
    projectId: p.projectId,
    projectName: p.projectName,
    fingerprint: p.fingerprint,
  };
}
