#!/usr/bin/env bash
# =============================================================================
# generate-dev-certs.sh
# Generates a self-signed TLS certificate for LOCAL DEVELOPMENT ONLY.
#
# Usage:
#   npm run gen:certs          (from project root)
#   bash certs/generate-dev-certs.sh
#
# Output:
#   certs/server.key  - RSA-4096 private key
#   certs/server.crt  - Self-signed X.509 certificate (valid 365 days)
#
# Production:
#   Do NOT use this script in production. Use one of:
#     - Let's Encrypt (certbot):  https://certbot.eff.org
#     - AWS ACM:                  https://aws.amazon.com/certificate-manager/
#     - Cloudflare Origin CA:     https://developers.cloudflare.com/ssl/origin-configuration/
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY_FILE="$SCRIPT_DIR/server.key"
CERT_FILE="$SCRIPT_DIR/server.crt"
DAYS=365
BITS=4096

# ----- Checks ---------------------------------------------------------------
if ! command -v openssl &>/dev/null; then
  echo "ERROR: openssl is not installed. Install it and retry." >&2
  exit 1
fi

if [[ -f "$KEY_FILE" || -f "$CERT_FILE" ]]; then
  echo "Certificates already exist at:"
  echo "  $KEY_FILE"
  echo "  $CERT_FILE"
  read -rp "Overwrite? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }
fi

# ----- Generate -------------------------------------------------------------
echo ""
echo "Generating $BITS-bit RSA private key..."
openssl genrsa -out "$KEY_FILE" $BITS 2>/dev/null
chmod 600 "$KEY_FILE"   # owner-read-only - protect the private key

echo "Generating self-signed certificate (valid $DAYS days)..."
openssl req -new -x509 \
  -key  "$KEY_FILE" \
  -out  "$CERT_FILE" \
  -days $DAYS \
  -subj "/C=US/ST=Development/L=Local/O=FIFA-API-Dev/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
  2>/dev/null

echo ""
echo "Done!"
echo "  Private key : $KEY_FILE"
echo "  Certificate : $CERT_FILE"
echo ""
echo "NOTE: This is a SELF-SIGNED certificate."
echo "      Your browser will show a security warning - this is expected in dev."
echo "      To trust it locally on macOS:"
echo "        sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain $CERT_FILE"
echo "      To trust it locally on Ubuntu/Debian:"
echo "        sudo cp $CERT_FILE /usr/local/share/ca-certificates/fifa-api-dev.crt"
echo "        sudo update-ca-certificates"
