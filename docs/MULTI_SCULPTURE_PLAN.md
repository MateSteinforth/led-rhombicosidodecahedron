# Several sculptures on a portable network

Status: implementation started, 2026-09-06. `TASKS.md` owns task status.
Router settings below are setup instructions, not a record of changes made.
NET-034A adds discovery and local project pairing on its implementation branch.
Automatic and simultaneous multi-device playback remain planned. The operator's
Slate Plus firmware version and this network setup still need a physical test.

## Intended experience

Each sculpture has one power cable during normal use. It starts a local
audio-reactive animation using its own microphone. Network connection runs in
the background and must not delay local playback. When the laptop joins the
private network and opens LOO/UME, connected sculptures appear automatically.
Previously paired sculptures with a valid saved assignment start mirroring.
If the laptop or network disappears, they return to their local animation.

The first hardware target is the available ESP32-WROOM with INMP441 and the
separate AudioReactive firmware build 2609061. Its proposed microphone pins are
SD 32, WS 26, and SCK 27; they leave LED outputs 16, 17, 21, and 22 available.
The firmware branch has build evidence; local audio and four-output stability
still require physical evidence. DOMRAEM compatibility remains P1 (COMP-039).
USB may be used for initial setup or recovery; routine performance uses power
only. A fade between playback sources is desirable but needs its own test.

## Current implementation boundaries

- `scripts/wled-discovery.ts` browses `_wled._tcp.local` on private IPv4
  interfaces and verifies candidates through `/json/info`. The Devices panel
  lists separate MAC identities, current addresses, and firmware builds.
- `scripts/sculpture-devices-handler.ts` stores local project ID/name and mapping
  fingerprint associations. These do not contain project ZIPs, authorize output,
  or replace the old reconnect path. Discovery and pairing send no WLED writes.
- [The first hardware review](SCULPTURE_NETWORK_REVIEW.md) tests discovery,
  pairing, IP changes, and persistence before automatic playback is implemented.

- `web/src/Esp32Setup.ts` discovers the fixed name `loo-ume.local` and checks
  configuration for one loaded project. Reconnect can update its map.
- `web/src/WifiCredentialsClient.ts` stores one credential pair. Electron
  encrypts it separately from portable project files.
- `scripts/esp32-reconnect-authorization-handler.ts` saves one authorization
  flag and one startup project copy. It is not a durable device registry.
- `web/src/main.ts` owns one current hardware contract, device URL, simulator,
  and mirror queue. Multiple devices need independent runtime state.
- Art-Net input currently uses the physical order of the exported MadMapper
  fixtures. LOO/UME converts it to logical pixels; WLED applies its map once.
  Changing calibration can require a new MadMapper export. TouchDesigner DDP
  input already uses logical order.
- The Art-Net assembler accepts at most 2,624 LEDs for the current sculpture.
  Several sculptures require input routing and per-sculpture assembly, not
  only a list of discovered IP addresses.

## Existing WLED controllers without reflashing

Support two setup paths: the project's managed firmware and **Connect existing
WLED controller**. The existing-controller path must work without flashing.
Read its identity, installed firmware, available effects, and configuration
before offering changes. Back up configuration and presets locally. Preserve
the manufacturer's output pins, relay, microphone, and board settings; never
apply the prototype's GPIO layout as a default for another controller.

The first requested commercial target is the **DOMRAEM ESP32 four-channel WLED
controller with 16 A fuse, level shifter, and Sound-Sync**, from the operator's
[AliExpress listing 1005012368842127](https://de.aliexpress.com/item/1005012368842127.html).
The listing could not be fetched on 2026-09-06. Its selected variant, board
revision, microphone, and installed firmware remain unverified. Record these
from the delivered unit before assigning a supported device profile.
The operator supplied the listing description: it advertises four channels,
WLED Wi-Fi control, Sound-Sync, a 16 A fuse, and a level shifter. It does not
explicitly specify a built-in microphone or the installed WLED version.

A [related DOMRAEM family manual](https://www.domraem.ru/manuals/dom-wle-15-16-18p.html)
covers DOM-WLE-15P/16P/18P, documents 2.4 GHz setup, and identifies a built-in
microphone on the 18P. This does not establish which variant the listing sells.
Its microphone settings use GPIO 21 and 26, which illustrates why the current
prototype output assignments must not be copied to an unverified board.

Check capabilities separately and show their status per device:

| Capability | Required verification on the installed firmware |
| --- | --- |
| Discovery and pairing | Read WLED identity through JSON; discover despite default or duplicate names; allow manual IP entry |
| Mirroring | Receive unicast DDP and test the assigned pixel count across all four outputs |
| Standalone and streamed address parity | Upload, activate, and retain the generated ledmap; verify RGBW quadrants and Swap rows/columns in both playback paths |
| Local audio at power-on | Confirm a local microphone and audio processing; save a supported boot preset and test with router and laptop off |
| Automatic fallback | Stop DDP and confirm the saved local animation returns; repeat after restart |
| Recovery without flashing | Test Wi-Fi settings and the unit's recovery hotspot; use USB Improv only when this hardware and firmware support it |

WLED provides a [JSON API](https://kno.wled.ge/interfaces/json-api/) and
[DDP reception](https://kno.wled.ge/interfaces/ddp/); test the vendor build
rather than assuming it matches the pinned project firmware. Select presets
from its reported effect catalogue. Keep its audio fallback preset when a
mirror session starts. Do not require a firmware change for discovery; service
advertisement changes may be considered only for the managed firmware path.

Sound-Sync can receive audio from another device. It is not evidence of a local
microphone. [WLED audio documentation](https://kno.wled.ge/advanced/audio-reactive/)
distinguishes local inputs from network audio. A controller with no local audio
can qualify for mirroring and ordinary standalone playback, but does not meet
the full power-only audio requirement. If map upload is unavailable, laptop-side
mapping alone does not fix standalone parity; report that limitation explicitly.

NET-034 owns capability detection and device profiles; NET-035 owns recovery;
LIVE-036 owns parity and fallback tests; AUDIO-038 owns local audio evidence.
Acceptance includes one managed controller and the exact DOMRAEM unit on the
same Slate Plus, with independent projects and no reflash of the DOMRAEM unit.

## Configure the GL.iNet GL-A1300 Slate Plus

Use this as the dedicated local network at home and in the field. Internet is
optional. Menu locations vary across firmware 4.x; use the matching vendor
guide, rather than assuming newer model features exist on the Slate Plus.

1. Power the router using its supplied adapter. Its specified USB-C input is
   5 V / 3 A. Do not assume a laptop USB port supplies this. For battery use,
   select a compatible supply and test it under load. USB-C is the power
   connection; connect laptop data through Wi-Fi or a LAN Ethernet port.
2. Connect the laptop to one of the router's **LAN** ports, or join the Wi-Fi
   network using the SSID and key printed on the router. If already configured,
   use its existing credentials; do not reset a working router.
3. Open `http://192.168.8.1` in a browser, unless its LAN address was changed.
   Sign in, or create an administrator password during initial setup. Keep
   the administrator password distinct from the Wi-Fi password.
4. In **NETWORK → Network Mode**, keep **Router** mode. This provides the
   private network and address service independently of a venue network.
5. In **WIRELESS**, enable the main 2.4 GHz network. Suggested SSID:
   `LOOUME-Sculptures`. Choose a private password and WPA2-Personal/AES for
   the initial classic ESP32 test. Keep the SSID visible. These are project
   recommendations; verify compatibility with the installed firmware.
6. Enable the main 5 GHz network for the laptop, for example `LOOUME-Laptop`.
   Both main bands must reach the same LAN. Do not place either endpoint on
   an isolated guest or IoT network. Rejoin Wi-Fi after changing its name.
7. In **NETWORK → LAN**, leave DHCP enabled and AP isolation disabled. Keep
   the default `192.168.8.1/24` unless it conflicts with another active network.
   If changing the subnet, record the new router address and reconnect clients.
8. Leave the WAN cable disconnected for the first test. VPN, cloud services,
   port forwarding, and an internet connection are not needed for local output.
9. Save the router's network details in your password manager. Once devices
   are connected, **CLIENTS** provides their current addresses. Optional DHCP
   reservations make diagnosis easier; discovery must also work without them.

Vendor references: [Slate Plus specifications](https://www.gl-inet.com/en-us/products/gl-a1300),
[initial connection and administrator login](https://docs.gl-inet.com/router/en/4/faq/first_time_setup/),
[network modes](https://docs.gl-inet.com/router/en/4/interface_guide/network_mode/),
[wireless settings](https://docs.gl-inet.com/router/en/4/interface_guide/wireless/),
and [LAN, isolation, and DHCP](https://docs.gl-inet.com/router/en/4/interface_guide/lan/).

## Connect the laptop and sculptures

### One-time preparation

1. Save a project ZIP for each sculpture, including its measured installed
   address transforms and route. Associate it with a clear sculpture name.
2. Supply `LOOUME-Sculptures` and its Wi-Fi password to each controller. New
   boards use initial setup. Existing boards should use Wi-Fi provisioning
   without flashing; a dedicated LOO/UME action is part of NET-035 below.
   WLED supports [Improv Serial Wi-Fi provisioning](https://kno.wled.ge/interfaces/serial/).
3. Verify each sculpture appears in the router's **CLIENTS** list. Record its
   controller MAC and name. Give each controller a unique hostname during
   pairing, for example `loo-ume-a1b2c3`. Current LOO/UME relies on the fixed
   hostname, so do not rename existing controllers until NET-034 migrates it.
4. In the future Devices panel, identify each new sculpture, associate its
   saved project, and enable automatic mirroring once. Unknown devices appear
   automatically but stay in local playback until this first pairing.

### Each session, including in the field

1. Power the Slate Plus and the sculptures. Each sculpture should begin local
   playback before a laptop is present.
2. On the Mac, use the Wi-Fi menu or **System Settings → Wi-Fi** to join
   `LOOUME-Laptop` with its Wi-Fi password. Alternatively, connect a USB
   Ethernet adapter to a Slate Plus **LAN** port and use automatic DHCP.
   The laptop's USB Ethernet adapter and the router's USB-C power are separate.
3. Confirm the router page opens and **CLIENTS** lists the sculptures. With
   default settings the laptop should have a `192.168.8.x` address. A
   `169.254.x.x` address indicates DHCP did not provide an address.
4. Stay on this network even if the laptop reports no internet. If discovery
   fails, check that the laptop did not rejoin another saved Wi-Fi network.
5. Open LOO/UME. Allow Local Network access if macOS requests it. After NET-034,
   the Devices panel should list sculptures without entering IP addresses.
   After LIVE-036, valid paired assignments should resume automatically.
6. For MadMapper, keep Art-Net output on laptop loopback (`127.0.0.1:6454`).
   LOO/UME sends separate unicast DDP streams to the sculptures through the
   Slate Plus. The MadMapper patch design is still pending below.

On the NET-034A implementation branch, joining the router allows discovery and
local pairing in **Devices on this network**. It does not start a new playback
session. The router's **CLIENTS** list confirms network membership, not pairing.

## Implementation slices and acceptance

### NET-034: discover and pair device identities

Add a desktop discovery service and Devices panel. Prefer mDNS/DNS-SD browsing
on the active sculpture-network interface; first inspect and test what the
pinned WLED firmware actually advertises. Verify candidates through WLED JSON.
If needed for managed boards, add service advertisement in a separately
receipted firmware change. Existing-controller support must not require this.
Provide manual IP entry when multicast discovery is blocked. Do not require
GL.iNet administrator credentials, cloud access, or a router-specific API.

Persist a registry keyed by verified controller identity, with display name,
unique hostname, last address, project reference, deployment fingerprint, and
automatic-connect preference. Use MAC as a practical hardware identifier, not
cryptographic authentication. Separate identity from IP, SSID, and editable name.
Migrate the old single-device authorization only after identifying that device.
Handle multiple laptop interfaces, changed IPs, duplicate names, and network
changes. Keep offline devices visible with their last-seen state.

Discovery is read-only. Pairing offers **Identify** and **Assign project**.
Opening a different editor project must not replace any device's calibration.
Compare a candidate's identity, firmware, bus contract, map, and preset before
output. A mismatch offers a deliberate restore/adopt workflow and backup.

Acceptance: two controllers appear regardless of power-on order, including
two identical LED layouts. Pairing survives app/router restarts and IP changes.
No writes or frames reach an unknown controller. Both 2.4-to-5 GHz and
Ethernet-to-2.4 GHz discovery work with WAN disconnected. Proposed target:
appearance within ten seconds of receiving a LAN address; measure on hardware.

### NET-035: change Wi-Fi and recover devices

Expose Wi-Fi provisioning independently of flashing, with USB Improv recovery
and a documented WLED recovery-hotspot alternative. Test the selected firmware's
hotspot behavior and credentials rather than assuming stock defaults. Reuse
FIRM-018's serial timeout/board-change recovery work.

Keep credentials encrypted on the laptop and outside project ZIPs. Expand
storage to remembered network profiles, with explicit selection per device.
Reprovisioning must preserve routes, GPIOs, calibrated transforms, ledmaps,
presets, and identity. Verify the same device on the new network. Remembered
laptop networks do not imply the controller supports multiple saved networks.

Acceptance: move a controller from a different SSID to the Slate Plus without
reflashing or knowing the old password. Recover after an incorrect password or
interrupted provisioning; verify calibration and preset bytes afterward.

### LIVE-036: independent playback sessions and automatic takeover

Replace single global device state with a runtime session per device and
assigned sculpture project. Each has its own compiled mapping, source selection,
queue, retry state, configuration operations, and latest frame. Switching the
editor's selected sculpture does not retarget other streams. Keep one central
show document containing stable assignments and project references; Schema 2
projects remain the pose and calibration authority.

Known enabled devices resume a saved valid assignment when a source is ready.
New devices appear immediately but require their initial assignment. A stopped
or stale external source releases its affected device to native playback;
do not repeat its last frame forever and suppress fallback. One slow/offline
device must not block the other queues. Show input FPS and sent-frame status
separately; sending a UDP packet does not prove LED reception.

Preserve the current 2.5-second WLED realtime timeout and 10 FPS application
limit initially. Measure aggregate load before promising larger counts or
higher rates. Start with two sculptures, then three, with different mappings.
Clock-synchronous rendering across controllers is not provided by separate
DDP streams; coordinated content and exact frame synchronization are different
requirements.

Acceptance: native playback at boot, automatic paired takeover, per-device
disconnect/reconnect, app quit/crash, laptop sleep, router restart, and loss of
external input all behave without a reflash. Test address parity using distinct
RGBW patterns and row/column calibration on different controllers. First release
uses one controlling laptop per show. Detect competing LOO/UME sessions and stop
automatic takeover; a robust exclusive-controller lease may require firmware
support. Do not imply stock WLED arbitrates multiple senders reliably.

### MAD-037: show-level patch and input routing — discussion required

Recommended structure: one named fixture group per sculpture, one stable input
allocation per group, and one loopback Art-Net receiver in LOO/UME. Route each
allocation to the appropriate logical sculpture framebuffer and its device.
The laptop, rather than MadMapper, owns the controllers' changing IP addresses.
MadMapper supports fixture groups and address shifting; validate the actual SVG
import and patch workflow in the installed version before claiming automation.
[MadMapper fixture and Art-Net guidance](https://madmapper.com/madmapper/faq)

The visual choices are independent of network discovery:

| Mode | MadMapper behavior | LOO/UME requirement |
| --- | --- | --- |
| Same content on each sculpture | Groups sample the same media region | Independent output maps; shared raw pixel streams only for compatible logical layouts |
| Separate content | Each group has its own media/region | Independent named input routes |
| One composition across the installation | Groups sample different regions of one canvas | Saved placement/UV decisions across sculptures |

Keep addresses stable when a sculpture disappears or the discovery order changes.
Reserve offline allocations. Add new sculptures without repatching existing ones.
Reject overlaps and require a reviewed repatch if a sculpture outgrows its range.
Persist the show patch and export the complete show package. Suggested first
scope: named groups with separate ranges; the operator chooses whether their
sampling regions overlap. Spatial installation editing can follow later.

At 170 RGB pixels per universe, a 2,624-pixel sculpture needs 16 universes.
For three such sculptures, illustrative ranges are 1–16, 17–32, and 33–48.
These are planning labels, not confirmed MadMapper UI values. Explicitly record
the exact Art-Net packet universe and UI value in the exported manifest and
test the boundary, because numbering conventions can differ. The receiver
must assemble each range independently; one missing group must not stall all.

Proposed addressing change: version new exports to use a stable logical input
order per sculpture so a saved Swap rows/columns correction affects only its
output map. The existing logical-index tie-break includes panel addresses;
audit it before promising stability across calibration. Define a stable emitter
identity/order and test calibration-only changes. Pose, topology, or sampling
changes may still require a fresh export.

Keep old physical-order exports explicitly marked as legacy. Their input
conversion needs the corresponding original export map; never silently treat
them as new logical input. Art-Net packets carry no project fingerprint, so
bind the receiver to an explicitly selected/imported show manifest. Migration
must explain which fixtures to replace and prevent double mapping.

Acceptance after the visual choice is settled: import the complete show in
MadMapper, send distinct content to two sculptures, verify simulator/LED parity,
disconnect one without renumbering the other, restart both applications, and
repeat after an address-calibration change. Test shared content with different
installed calibrations. Preserve the existing single-sculpture import path.

### AUDIO-038: standalone microphone response

First test the available ESP32-WROOM with INMP441 and AudioReactive build 2609061.
Test its local audio input against all four active LED outputs,
a saved audio-reactive boot effect, and return from DDP to microphone-driven
playback. COMP-039 then checks the DOMRAEM unit's local audio capabilities on its
installed firmware without reflashing. Define
behavior during silence, microphone failure, and network reconnection. Network
loss must not stop audio processing. The DOMRAEM variant is a compatibility
target; no microphone pin assignment or firmware build is approved by this plan.

## Field diagnosis and release checks

| Observation | Check or recovery |
| --- | --- |
| No sculptures in router CLIENTS | Power, 2.4 GHz SSID/password, signal; provision through USB if needed |
| CLIENTS lists them but LOO/UME does not | Laptop LAN, Local Network permission, selected interface, isolation, multicast; try current IP |
| Device appears with wrong name or project | Identify it; verify device ID and pairing; do not overwrite automatically |
| Works on Ethernet but not laptop Wi-Fi | Main/guest network selection, isolation, band-to-LAN communication |
| Network change causes loss | Rediscover on the current interface; revalidate identity before sending |
| One sculpture freezes while others work | Its source freshness, independent queue, link state, and native fallback |
| All output fails after a laptop VPN starts | Local route and LAN access; temporarily disconnect VPN to isolate the cause |
| Forgotten laptop/router settings | Password-manager record, project/show backup, USB provisioning; reset only as a deliberate last recovery step |

Run focused registry, discovery, mapping, routing, migration, and browser tests
for each slice. Perform the field test with internet disconnected and at least
two sculptures. Record router firmware, controller receipts, application build,
network layout, project/show fingerprints, timings, and measured device count.
Do not store passwords in that report. Existing unrelated geometry test failures
are tracked in F-174 and must not be reported as a green full verification.

Before MAD-037 implementation, settle the initial visual mode with the operator.
NET-034 and NET-035 can proceed independently of that choice. This document
authorizes no firmware build, hardware mutation, or new implementation by itself.
