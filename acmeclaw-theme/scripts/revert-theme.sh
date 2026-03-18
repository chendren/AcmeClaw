#!/bin/bash
# AcmeClaw Theme Reverter
# Restores original OpenClaw branding from backup.

set -euo pipefail

OPENCLAW_PATH="${1:-/opt/homebrew/lib/node_modules/openclaw}"
THEME_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONTROL_UI="${OPENCLAW_PATH}/dist/control-ui"
BACKUP_DIR="${THEME_DIR}/.backup"

if [ ! -d "${BACKUP_DIR}" ]; then
  echo "No backup found at ${BACKUP_DIR}. Nothing to revert."
  exit 1
fi

echo "Reverting AcmeClaw theme..."
cp "${BACKUP_DIR}/control-ui/"* "${CONTROL_UI}/"
rm -f "${CONTROL_UI}/acmeclaw-theme.css"
rm -f "${CONTROL_UI}/acmeclaw-logo.png"
echo "Original OpenClaw branding restored."
echo "Restart your OpenClaw gateway to see changes."
