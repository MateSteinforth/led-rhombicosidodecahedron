import { expect, test } from "@playwright/test";
import type {
  SculptureDevicesSnapshot,
  SculpturePairing,
} from "../../src/hardware/WledDevices.ts";

test("pairs two same-name devices, preserves offline assignment, and never calls the WLED write broker", async ({
  page,
}) => {
  const snapshot: SculptureDevicesSnapshot = {
    networks: [
      { name: "en0", address: "192.168.8.10", netmask: "255.255.255.0" },
    ],
    scanning: false,
    devices: ["aabbcc112233", "aabbcc445566"].map((mac, i) => ({
      mac,
      status: "online",
      identity: {
        mac,
        address: `192.168.8.${20 + i}`,
        name: "WLED sculpture",
        version: "0.16",
        build: 2609061,
        architecture: "esp32",
        ledCount: 2624,
      },
    })),
  };
  const operations: string[] = [];
  const writes: string[] = [];
  page.on("request", (request) => {
    if (
      (request.url().includes("/api/esp32-device") ||
        request.url().includes("/api/esp32-frame")) &&
      request.method() !== "GET"
    )
      writes.push(request.url());
  });
  await page.route("**/api/sculpture-devices", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as {
        action: string;
        pairing?: SculpturePairing;
        mac?: string;
      };
      operations.push(body.action);
      if (body.action === "pair")
        snapshot.devices.find((d) => d.mac === body.pairing!.mac)!.pairing =
          body.pairing;
      if (body.action === "forget")
        delete snapshot.devices.find((d) => d.mac === body.mac)!.pairing;
    }
    await route.fulfill({ json: snapshot });
  });
  await page.goto("/");
  await page.locator("#sculpture-devices summary").click();
  const first = page.locator('[data-mac="aabbcc112233"]');
  const second = page.locator('[data-mac="aabbcc445566"]');
  await expect(first).toContainText("2609061");
  await expect(second).toContainText("192.168.8.21");
  await first
    .getByRole("button", { name: "Pair current sculpture", exact: true })
    .click();
  await second
    .getByRole("button", { name: "Pair current sculpture", exact: true })
    .click();
  await expect(first).toContainText("Matches current mapping");
  await expect(second).toContainText("Matches current mapping");
  snapshot.devices[0]!.status = "offline";
  delete snapshot.devices[0]!.identity;
  snapshot.devices[1]!.identity!.address = "192.168.8.90";
  await page.getByRole("button", { name: "Refresh devices" }).click();
  await expect(first).toContainText("offline");
  await expect(
    first.getByRole("button", { name: "Replace with current sculpture" }),
  ).toBeDisabled();
  await expect(second).toContainText("192.168.8.90");
  await page.reload();
  await page.locator("#sculpture-devices summary").click();
  await expect(first).toContainText("Paired sculpture:");
  await second.getByRole("button", { name: "Forget pairing" }).click();
  await expect(second).toContainText("Not paired");
  expect(operations).toEqual(["pair", "pair", "forget"]);
  expect(writes).toEqual([]);
});

test("offers manual IP recovery and displays controller names as text", async ({
  page,
}) => {
  await page.route("**/api/sculpture-devices", async (route) => {
    const manual = route.request().method() === "POST";
    if (manual)
      expect(route.request().postDataJSON()).toEqual({
        action: "inspect",
        address: "192.168.8.30",
      });
    await route.fulfill({
      json: {
        scanning: false,
        networks: [],
        devices: manual
          ? [
              {
                mac: "aabbcc112233",
                status: "online",
                identity: {
                  mac: "aabbcc112233",
                  name: '<img src=x onerror="window.injected=1">',
                  address: "192.168.8.30",
                  version: "0.16",
                  build: 2609061,
                  ledCount: 64,
                  architecture: "esp32",
                },
              },
            ]
          : [],
      },
    });
  });
  await page.goto("/");
  await page.locator("#sculpture-devices summary").click();
  await expect(page.locator("#sculpture-devices [data-status]")).toContainText(
    "No WLED controllers",
  );
  await page.getByLabel("Controller IP address").fill("192.168.8.30");
  await page.getByRole("button", { name: "Find by IP" }).click();
  await expect(page.locator(".sculpture-device-card")).toContainText("<img");
  await expect(page.locator(".sculpture-device-card img")).toHaveCount(0);
});
