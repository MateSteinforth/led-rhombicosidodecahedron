import type {
  SculptureDevicesSnapshot,
  SculpturePairing,
} from "../../src/hardware/WledDevices.ts";

/** Pairing stores a local association. It does not configure WLED or start output. */
export function createSculptureDevicesController(options: {
  root: HTMLElement;
  getProject: () =>
    | Pick<SculpturePairing, "projectId" | "projectName" | "fingerprint">
    | undefined;
}): () => void {
  const root = options.root;
  root.innerHTML = `
    <p class="mapping-note">Pairing saves the current sculpture assignment on this laptop. Automatic playback is a later step.</p>
    <p class="mapping-note" data-networks></p>
    <p class="mapping-note" data-status role="status">Looking for WLED controllers…</p>
    <div data-devices></div>
    <label class="field"><span>Controller IP address</span><input data-address type="text" placeholder="192.168.8.123" maxlength="15" /></label>
    <button class="editor-button" data-inspect type="button">Find by IP</button>
    <button class="editor-button" data-refresh type="button">Refresh devices</button>`;
  const status = root.querySelector<HTMLElement>("[data-status]")!;
  const networkLabel = root.querySelector<HTMLElement>("[data-networks]")!;
  const list = root.querySelector<HTMLElement>("[data-devices]")!;
  const address = root.querySelector<HTMLInputElement>("[data-address]")!;
  let stopped = false;
  let busy = false;
  let snapshot: SculptureDevicesSnapshot | undefined;
  const abort = new AbortController();
  const render = (): void => {
    if (!snapshot || stopped) return;
    networkLabel.textContent = snapshot.networks
      .map((n) => `${n.name}: ${n.address}`)
      .join(" · ");
    list.replaceChildren();
    for (const device of snapshot.devices) {
      const card = document.createElement("div");
      card.className = "sculpture-device-card";
      card.dataset.mac = device.mac;
      const title = document.createElement("strong");
      title.textContent = `${device.identity?.name || device.pairing?.projectName || "WLED"} — ${device.status}`;
      const details = document.createElement("p");
      details.className = "mapping-note";
      details.textContent = device.identity
        ? `${device.identity.address} · MAC ${device.mac} · WLED ${device.identity.version} / build ${device.identity.build} · ${device.identity.ledCount} LEDs`
        : `MAC ${device.mac} · Last paired address: ${device.pairing?.address ?? "unknown"}`;
      const assignment = document.createElement("p");
      assignment.className = "mapping-note";
      const project = options.getProject();
      const matches =
        device.pairing &&
        project &&
        device.pairing.projectId === project.projectId &&
        device.pairing.fingerprint === project.fingerprint;
      assignment.textContent = device.pairing
        ? `Paired sculpture: ${device.pairing.projectName}${matches ? " · Matches current mapping" : " · Open its saved project to compare mapping"}`
        : "Not paired. Local playback stays unchanged.";
      const pair = document.createElement("button");
      pair.className = "editor-button";
      pair.type = "button";
      pair.textContent = device.pairing
        ? "Replace with current sculpture"
        : "Pair current sculpture";
      pair.disabled =
        busy || device.status !== "online" || !project || !!matches;
      pair.onclick = () => {
        const current = options.getProject();
        if (!current || !device.identity) return;
        if (
          device.pairing &&
          !window.confirm(
            `Replace the saved assignment for ${device.pairing.projectName} with ${current.projectName}?`,
          )
        )
          return;
        void request({
          action: "pair",
          pairing: {
            ...current,
            mac: device.mac,
            address: device.identity.address,
          },
        });
      };
      card.append(title, details, assignment, pair);
      if (device.pairing) {
        const forget = document.createElement("button");
        forget.className = "editor-button";
        forget.type = "button";
        forget.textContent = "Forget pairing";
        forget.disabled = busy;
        forget.onclick = () => {
          void request({ action: "forget", mac: device.mac });
        };
        card.append(forget);
      }
      list.append(card);
    }
  };
  const request = async (body?: unknown): Promise<void> => {
    if (busy || stopped) return;
    busy = true;
    render();
    try {
      const response = await fetch("/api/sculpture-devices", {
        method: body ? "POST" : "GET",
        headers: {
          "X-LOO-UME-Devices": "1",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(25000)]),
      });
      if (
        response.status === 404 ||
        !response.headers.get("content-type")?.includes("application/json")
      )
        throw new Error(
          "Device discovery needs the desktop app or a local LOO/UME server.",
        );
      const value = (await response.json()) as SculptureDevicesSnapshot;
      if (!response.ok)
        throw new Error(value.error ?? "Device request failed.");
      snapshot = value;
      status.textContent =
        value.error ??
        (value.scanning
          ? "Looking for WLED controllers…"
          : value.devices.length
            ? "Device list updated. Pairing does not start output."
            : "No WLED controllers found. Check the router's Clients list, or enter the controller IP.");
    } catch (error) {
      if (!stopped)
        status.textContent =
          error instanceof Error ? error.message : "Device request failed.";
    } finally {
      busy = false;
      render();
    }
  };
  root.querySelector<HTMLButtonElement>("[data-inspect]")!.onclick = () => {
    void request({ action: "inspect", address: address.value.trim() });
  };
  root.querySelector<HTMLButtonElement>("[data-refresh]")!.onclick = () => {
    void request();
  };
  void request();
  const timer = window.setInterval(() => {
    if (!document.hidden) void request();
  }, 2500);
  return () => {
    stopped = true;
    abort.abort();
    window.clearInterval(timer);
  };
}
