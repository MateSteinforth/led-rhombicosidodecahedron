# Pinned WLED firmware generation

This branch builds the minimum WLED target for the selected
ESP32-DevKitC V4 with ESP32-WROOM-32E-N4. It does not contain credentials and
does not flash hardware automatically.

The build uses WLED commit
`d9b9a846561227351ad929e3109781daadb7bed2`, the upstream pinned Python
requirements (including PlatformIO 6.1.18), and the `orbital_esp32dev`
environment in `wled-platformio.ini`. The environment extends upstream
`esp32dev`, removes default usermods, and disables deferred transports and 2D,
audio-related, infrared, and assistant features. The local WLED web interface,
JSON configuration, Wi-Fi, OTA update, and 1D effects remain available.

Run this only from the `generate/wled-firmware` branch:

```bash
git submodule update --init wled/upstream
sh scripts/build-wled-firmware.sh
```

The script verifies the pinned PyPA pip zipapp and installs the upstream pinned
PlatformIO requirements plus `uv` 0.12.5 in separate ignored repository-local
directories. PlatformIO's core, packages, and private Python environment also
stay under the ignored repository `build/` directory. The process does not use
`sudo`, a system package install, or the user Python environment. It then builds
the WLED web assets, compiles the exact target, and writes:

- ignored binary: `build/firmware/wled-orbital-esp32dev.bin`;
- tracked evidence: `firmware/build-receipt.json`.

The receipt records source, environment, compiler frontend, input hashes, and
the exact firmware byte length and SHA-256. Publish the binary as a CI or
release artifact. Do not merge the WLED checkout or Python toolchain into
`main`.

With all LED power disconnected, identify the controller serial port and flash
the verified build through the same pinned environment:

```bash
sh scripts/flash-wled-firmware.sh /dev/ttyUSB0
```

The flash script accepts only an existing `/dev/ttyUSB*` or `/dev/ttyACM*`
character device. It runs the pinned build, verifies both firmware copies and
all receipt target/input fields, then uses PlatformIO's no-build upload target.
The bytes checked immediately before upload are therefore the bytes written to
the controller.
