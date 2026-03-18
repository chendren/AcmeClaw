#!/bin/bash
# AcmeClaw Theme Applicator
# Copyright 2026 Chad Hendren. All Rights Reserved.
#
# Applies AcmeClaw branding to a local OpenClaw installation.
# Usage: ./apply-theme.sh [openclaw-path]
#
# This script:
#   1. Backs up original assets
#   2. Replaces favicon and icons with AcmeClaw mascot
#   3. Injects AcmeClaw CSS theme into the control UI
#   4. Updates page titles and branding text
#   5. Generates PNG favicons from SVG

set -euo pipefail

OPENCLAW_PATH="${1:-/opt/homebrew/lib/node_modules/openclaw}"
THEME_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONTROL_UI="${OPENCLAW_PATH}/dist/control-ui"
BACKUP_DIR="${THEME_DIR}/.backup"

echo "AcmeClaw Theme Applicator"
echo "========================="
echo "OpenClaw path: ${OPENCLAW_PATH}"
echo "Theme path:    ${THEME_DIR}"
echo ""

# Verify OpenClaw installation
if [ ! -f "${CONTROL_UI}/index.html" ]; then
  echo "ERROR: OpenClaw control-ui not found at ${CONTROL_UI}"
  echo "Pass the OpenClaw installation path as the first argument."
  exit 1
fi

# Create backup of originals (only if not already backed up)
if [ ! -d "${BACKUP_DIR}" ]; then
  echo "[1/5] Backing up original assets..."
  mkdir -p "${BACKUP_DIR}/control-ui"
  cp "${CONTROL_UI}/index.html" "${BACKUP_DIR}/control-ui/"
  cp "${CONTROL_UI}/favicon.svg" "${BACKUP_DIR}/control-ui/"
  [ -f "${CONTROL_UI}/favicon-32.png" ] && cp "${CONTROL_UI}/favicon-32.png" "${BACKUP_DIR}/control-ui/"
  [ -f "${CONTROL_UI}/favicon.ico" ] && cp "${CONTROL_UI}/favicon.ico" "${BACKUP_DIR}/control-ui/"
  [ -f "${CONTROL_UI}/apple-touch-icon.png" ] && cp "${CONTROL_UI}/apple-touch-icon.png" "${BACKUP_DIR}/control-ui/"
  echo "  Backup saved to ${BACKUP_DIR}"
else
  echo "[1/5] Backup already exists, skipping..."
fi

# Replace favicon
echo "[2/5] Replacing favicon and icons..."
cp "${THEME_DIR}/assets/favicon.svg" "${CONTROL_UI}/favicon.svg"

# Generate PNG favicons from SVG if rsvg-convert or sips available
if command -v rsvg-convert &>/dev/null; then
  rsvg-convert -w 32 -h 32 "${THEME_DIR}/assets/favicon.svg" -o "${CONTROL_UI}/favicon-32.png"
  rsvg-convert -w 180 -h 180 "${THEME_DIR}/assets/favicon.svg" -o "${CONTROL_UI}/apple-touch-icon.png"
  echo "  Generated PNG favicons via rsvg-convert"
elif command -v sips &>/dev/null; then
  # macOS fallback: copy mascot image and resize
  if [ -f "${THEME_DIR}/../mascot.png" ]; then
    sips -z 32 32 "${THEME_DIR}/../mascot.png" --out "${CONTROL_UI}/favicon-32.png" &>/dev/null
    sips -z 180 180 "${THEME_DIR}/../mascot.png" --out "${CONTROL_UI}/apple-touch-icon.png" &>/dev/null
    echo "  Generated PNG favicons via sips (from mascot.png)"
  fi
else
  echo "  WARNING: No PNG conversion tool found. SVG favicon applied, PNGs unchanged."
fi

# Copy AcmeClaw mascot as avatar
if [ -f "${THEME_DIR}/../mascot.png" ]; then
  cp "${THEME_DIR}/../mascot.png" "${CONTROL_UI}/acmeclaw-logo.png"
  echo "  Copied mascot as acmeclaw-logo.png"
fi

# Inject CSS theme
echo "[3/5] Injecting AcmeClaw CSS theme..."
cp "${THEME_DIR}/css/acmeclaw-theme.css" "${CONTROL_UI}/acmeclaw-theme.css"

# Add CSS link to index.html if not already present
if ! grep -q "acmeclaw-theme.css" "${CONTROL_UI}/index.html"; then
  sed -i.tmp 's|</head>|    <link rel="stylesheet" href="./acmeclaw-theme.css">\n  </head>|' "${CONTROL_UI}/index.html"
  rm -f "${CONTROL_UI}/index.html.tmp"
  echo "  CSS injected into index.html"
else
  echo "  CSS already injected, skipping..."
fi

# Update title
echo "[4/5] Updating page titles..."
sed -i.tmp 's|<title>OpenClaw Control</title>|<title>AcmeClaw Control</title>|g' "${CONTROL_UI}/index.html"
rm -f "${CONTROL_UI}/index.html.tmp"

# Update canvas-host if present
CANVAS_HOST="${OPENCLAW_PATH}/dist/canvas-host"
if [ -f "${CANVAS_HOST}/a2ui/index.html" ]; then
  cp "${THEME_DIR}/assets/favicon.svg" "${CANVAS_HOST}/a2ui/favicon.svg" 2>/dev/null || true
fi

# Update export template if present
EXPORT_HTML="${OPENCLAW_PATH}/dist/export-html"
if [ -f "${EXPORT_HTML}/template.html" ]; then
  if ! grep -q "AcmeClaw" "${EXPORT_HTML}/template.html"; then
    sed -i.tmp 's|OpenClaw|AcmeClaw|g' "${EXPORT_HTML}/template.html"
    rm -f "${EXPORT_HTML}/template.html.tmp"
    echo "  Updated export template branding"
  fi
fi

echo "[5/5] Done!"
echo ""
echo "AcmeClaw theme applied successfully."
echo "Restart your OpenClaw gateway to see changes."
echo ""
echo "To revert: ./revert-theme.sh"
echo ""
echo "Copyright 2026 Chad Hendren. All Rights Reserved."
echo "Tool Up. Build On."
