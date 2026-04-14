#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v e2b >/dev/null 2>&1; then
  echo "E2B CLI not found. Install with: npm i -g @e2b/cli"
  exit 1
fi

echo "==> Building mr8-compute"
pushd e2b-templates/mr8-compute >/dev/null
e2b template build --name mr8-compute
popd >/dev/null

echo ""
echo "==> Building mr8-desktop"
pushd e2b-templates/mr8-desktop >/dev/null
e2b template build --name mr8-desktop
popd >/dev/null

echo ""
echo "==> Done. Copy the template IDs printed above into backend/.env:"
echo "    E2B_COMPUTE_TEMPLATE_ID=<compute id>"
echo "    E2B_DESKTOP_TEMPLATE_ID=<desktop id>"
