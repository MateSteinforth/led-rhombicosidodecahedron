#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: sh scripts/flash-wled-firmware.sh /dev/ttyUSB0" >&2
  exit 1
fi

serial_port=$1
case "$serial_port" in
  /dev/ttyUSB*|/dev/ttyACM*) ;;
  *)
    echo "The flash port must be an explicit /dev/ttyUSB* or /dev/ttyACM* path." >&2
    exit 1
    ;;
esac
if [ ! -c "$serial_port" ]; then
  echo "$serial_port is not an attached character device." >&2
  exit 1
fi

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
upstream_dir="$repo_root/wled/upstream"
expected_commit=d9b9a846561227351ad929e3109781daadb7bed2
actual_commit=$(git -C "$upstream_dir" rev-parse HEAD)
if [ "$actual_commit" != "$expected_commit" ]; then
  echo "WLED checkout is $actual_commit; expected $expected_commit." >&2
  exit 1
fi
if [ -n "$(git -C "$upstream_dir" status --short)" ]; then
  echo "WLED checkout must be clean before flashing." >&2
  exit 1
fi

sh "$repo_root/scripts/build-wled-firmware.sh"
node "$repo_root/scripts/verify-firmware-artifact.mjs" \
  "$repo_root/firmware/build-receipt.json" \
  "$repo_root/build/firmware/wled-orbital-esp32dev.bin" \
  "$upstream_dir/.pio/build/orbital_esp32dev/firmware.bin"

cp "$repo_root/firmware/wled-platformio.ini" \
  "$upstream_dir/platformio_override.ini"
trap 'rm -f "$upstream_dir/platformio_override.ini"' EXIT HUP INT TERM

PATH="$repo_root/.firmware-uv/bin:$repo_root/.firmware-python/bin:$PATH" \
PLATFORMIO_CORE_DIR="$repo_root/build/platformio-core" \
PLATFORMIO_BUILD_CACHE_DIR="$repo_root/build/platformio-cache" \
PYTHONPATH="$repo_root/.firmware-python" python3 -m platformio run \
  --project-dir "$upstream_dir" \
  --environment orbital_esp32dev \
  --target nobuild \
  --target upload \
  --upload-port "$serial_port"
