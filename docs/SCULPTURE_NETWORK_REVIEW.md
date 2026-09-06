# First sculpture network review

Target: NET-034A on `codex/sculpture-discovery`. This review tests discovery and
local pairing. Automatic takeover, project restoration per device, Wi-Fi
provisioning from the new panel, and simultaneous output are later slices.

## Available hardware

- GL.iNet GL-A1300 Slate Plus.
- ESP32-WROOM with an INMP441 module.
- Separate AudioReactive firmware build **2609061**, from FIRM-020 on
  `codex/firmware-audioreactive`. Its microphone defaults are SD 32, WS 26,
  and SCK 27. L/R goes to GND; VDD is 3.3 V. The firmware branch owns the exact
  receipt and installation instructions. Build success is not audio evidence.
- Existing four LED outputs: use the actual saved project GPIOs and calibration.
  The tested earlier output set was 16, 17, 21, and 22.

DOMRAEM is the next P1 commercial compatibility target, not a prerequisite for
this review. No firmware binary or bundled flash selection changes in NET-034A.

## Prepare the local network

1. Configure the router and laptop using
   [the Slate Plus steps](MULTI_SCULPTURE_PLAN.md#configure-the-glinet-gl-a1300-slate-plus).
   Use the main 2.4 GHz network for the ESP32 and main 5 GHz or LAN Ethernet for
   the laptop. Keep both on the same LAN; leave the WAN disconnected.
2. In the controller's existing WLED interface, open Wi-Fi settings and select
   the router's 2.4 GHz SSID. Save its password. This is a network configuration
   change; do not use **Flash and configure** for discovery.
3. If the controller is on an unknown network, use its tested recovery hotspot
   according to the firmware instructions. Do not assume that USB power means
   a serial provisioning connection is available. Do not reset saved calibration.
4. Open the router's **CLIENTS** list. Confirm the laptop and ESP32 appear.
   Note the ESP32 IP address and MAC for comparison in LOO/UME.
5. Use the reviewed implementation build. For a Mac checkout, use
   `npm run dev:electron` after setup, or `./bootstrap.sh review-electron` for a
   packaged review. See [development instructions](DEVELOPMENT.md). The separate
   review profile avoids using an installed app's old reconnect authorization.
   Load the saved calibrated sculpture ZIP into the review app.

For a downloaded review DMG, copy the app to Applications and close the normal
LOO/UME app. Start it with a separate, persistent review profile from Terminal:

```bash
LOO_UME_LOCAL_ELECTRON_REVIEW=1 \
LOO_UME_LOCAL_ELECTRON_REVIEW_DATA="$HOME/Library/Application Support/LOO-UME-NET-034A" \
"/Applications/LOO UME.app/Contents/MacOS/LOO UME"
```

Use this same command after restart. A normal launch can reuse the old
single-controller reconnect authorization and save its current animation onto
WLED. The separate profile starts without that authorization. During this
discovery review, use the Devices panel; do not run flash/setup or enable the
old playback connection. Firmware 2609061 stays installed on the controller.

## Check discovery and pairing

1. Open **Devices on this network** below **Set up ESP32**. A device should
   appear within about ten seconds on the small test LAN. Record the measured
   delay; this is a target, not a hardware result.
2. Compare the shown MAC and IP with the router's client list. Check that the
   firmware build is **2609061**. A different build must be recorded as such.
   A displayed build number does not prove the microphone works.
3. If no device appears, select **Find by IP** with the router's address for
   the ESP32. If that works, record a multicast discovery failure separately
   from WLED access. Check macOS Local Network permission and LAN isolation.
4. Select **Pair current sculpture**. Confirm the saved sculpture name appears.
   Pairing stores the project ID and mapping fingerprint on the laptop. Save
   the actual project ZIP separately. Pairing does not upload a map or start
   output; the device's animation should stay unchanged.
5. Power the ESP32 off. Keep LOO/UME open. The paired device should become
   **offline** and keep its assignment. Power it on and check the same MAC
   returns **online**. Record the timings.
6. Close and reopen the same review application. The pairing should remain.
   Load the same saved project ZIP to compare its mapping fingerprint. This
   first slice does not restore a separate project automatically for each device.
7. Repeat with the laptop on Ethernet, then on the main 5 GHz network. If DHCP
   gives the ESP32 a different address, confirm its pairing remains attached
   to the same MAC. Do not claim an IP-change test if its address stayed the same.
8. When a second controller is available, repeat with both powered on. Equal
   device names must still show separate MACs and assignments. Unplug one and
   confirm the other remains online. Software tests simulate two devices; one
   physical unit cannot prove the two-device network case.

## Check local audio separately

With the router and laptop off, power the sculpture and check that its saved
audio effect responds to sound and silence. Repeat with all four LED outputs
active. Record the exact preset and microphone settings. The discovery slice
does not create an audio boot preset or change one. Do not use its **paired**
state as proof of audio response, mapping parity, or DDP fallback.

Save router firmware, controller build, application commit/build, project
fingerprint, connection type, timing, and pass/fail for each performed step.
Keep passwords outside the report. Automatic takeover and DDP-to-audio return
are acceptance checks for LIVE-036 and AUDIO-038 after their implementation.
