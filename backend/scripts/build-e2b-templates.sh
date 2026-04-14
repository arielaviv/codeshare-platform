#!/usr/bin/env bash
set -euo pipefail

# Prevent MSYS/MSYS2 on Git Bash from rewriting "/usr/bin/..." args into
# Windows-style "C:/Program Files/Git/usr/bin/..." paths, which breaks the
# start command inside the E2B Linux sandbox.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"

cd "$(dirname "$0")/.."

if ! command -v e2b >/dev/null 2>&1; then
  echo "E2B CLI not found. Install with: npm i -g @e2b/cli"
  exit 1
fi

echo "==> Building mr8-compute (Python + data/docs libs)"
e2b template create mr8-compute \
  --path e2b-templates/mr8-compute \
  --dockerfile e2b.Dockerfile \
  --cpu-count 2 \
  --memory-mb 4096

echo ""
echo "==> Building mr8-desktop (Chromium + Playwright)"
# No --cmd/--ready-cmd: let the e2bdev/desktop base image's default entrypoint
# boot Xvfb + display services. Chromium is launched on-demand by the backend's
# browser-handler.ts via desktop.commands.run(...).
e2b template create mr8-desktop \
  --path e2b-templates/mr8-desktop \
  --dockerfile e2b.Dockerfile \
  --cpu-count 4 \
  --memory-mb 4096

echo ""
echo "==> Done. Copy the template IDs printed above into backend/.env:"
echo "    E2B_COMPUTE_TEMPLATE_ID=<compute id>"
echo "    E2B_DESKTOP_TEMPLATE_ID=<desktop id>"
