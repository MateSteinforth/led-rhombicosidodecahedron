#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
upstream_dir="$repo_root/wled/upstream"
tools_dir="$repo_root/.firmware-tools"
python_packages_dir="$repo_root/.firmware-python"
uv_dir="$repo_root/.firmware-uv"
output_dir="$repo_root/build/firmware"
expected_commit=d9b9a846561227351ad929e3109781daadb7bed2
pip_url=https://bootstrap.pypa.io/pip/pip.pyz
pip_sha256=91d5fd9f6f25549fd839c60536c6f1b945316ce3588d34a605635b6071c91526

actual_commit=$(git -C "$upstream_dir" rev-parse HEAD)
if [ "$actual_commit" != "$expected_commit" ]; then
  echo "WLED checkout is $actual_commit; expected $expected_commit." >&2
  exit 1
fi
if [ -n "$(git -C "$upstream_dir" status --short)" ]; then
  echo "WLED checkout must be clean before a production build." >&2
  exit 1
fi

mkdir -p "$tools_dir"
pip_zip="$tools_dir/pip.pyz"
if [ ! -f "$pip_zip" ]; then
  curl --fail --location --silent --show-error "$pip_url" --output "$pip_zip"
fi
actual_pip_sha256=$(sha256sum "$pip_zip" | cut -d ' ' -f 1)
if [ "$actual_pip_sha256" != "$pip_sha256" ]; then
  echo "pip.pyz hash is $actual_pip_sha256; expected $pip_sha256." >&2
  exit 1
fi
if [ ! -x "$python_packages_dir/bin/pio" ]; then
  python3 "$pip_zip" install --disable-pip-version-check \
    --target "$python_packages_dir" -r "$upstream_dir/requirements.txt"
fi
if [ ! -x "$uv_dir/bin/uv" ]; then
  python3 "$pip_zip" install --disable-pip-version-check \
    --target "$uv_dir" uv==0.12.5
fi
actual_platformio=$(PYTHONPATH="$python_packages_dir" \
  python3 -m platformio --version)
if [ "$actual_platformio" != "PlatformIO Core, version 6.1.18" ]; then
  echo "Local $actual_platformio; expected PlatformIO Core, version 6.1.18." >&2
  exit 1
fi
actual_uv=$("$uv_dir/bin/uv" --version)
case "$actual_uv" in
  "uv 0.12.5"*) ;;
  *)
    echo "Local $actual_uv; expected uv 0.12.5." >&2
    exit 1
    ;;
esac

platformio_python="$repo_root/build/platformio-core/penv/bin/python"
if [ ! -x "$platformio_python" ]; then
  "$uv_dir/bin/uv" venv --python "$(command -v python3)" \
    "$repo_root/build/platformio-core/penv"
fi
platformio_uv=$("$platformio_python" -m uv --version 2>/dev/null || true)
case "$platformio_uv" in
  "uv 0.12.5"*) ;;
  *) "$uv_dir/bin/uv" pip install uv==0.12.5 --python "$platformio_python" ;;
esac

cp "$repo_root/firmware/wled-platformio.ini" \
  "$upstream_dir/platformio_override.ini"
trap 'rm -f "$upstream_dir/platformio_override.ini"' EXIT HUP INT TERM

npm --prefix "$upstream_dir" ci
npm --prefix "$upstream_dir" run build
PATH="$uv_dir/bin:$python_packages_dir/bin:$PATH" \
PLATFORMIO_CORE_DIR="$repo_root/build/platformio-core" \
PLATFORMIO_BUILD_CACHE_DIR="$repo_root/build/platformio-cache" \
PYTHONPATH="$python_packages_dir" python3 -m platformio run \
  --project-dir "$upstream_dir" \
  --environment orbital_esp32dev

firmware_source=$(find "$upstream_dir/build_output/release" -maxdepth 1 \
  -type f -name 'WLED_*_ESP32.bin' -print | sort | tail -n 1)
if [ -z "$firmware_source" ]; then
  echo "The WLED build did not publish an ESP32 firmware binary." >&2
  exit 1
fi

mkdir -p "$output_dir"
firmware_output="$output_dir/wled-orbital-esp32dev.bin"
cp "$firmware_source" "$firmware_output"
node "$repo_root/scripts/create-firmware-receipt.mjs" \
  "build/firmware/wled-orbital-esp32dev.bin" \
  "firmware/build-receipt.json"
