#!/usr/bin/env bash
# Copia colecciones wapi_* desde `serwp` hacia `masssivo_wa` y `masssivo_qr_inbox`.
#
#   export MONGO_SRC_URI='mongodb://USER:PASS@127.0.0.1:27017/serwp?authSource=admin'
#   export MONGO_ADMIN_URI='mongodb://USER:PASS@127.0.0.1:27017/?authSource=admin'
#   bash scripts/migrate-serwp-to-masssivo-dbs.sh
#
# El usuario de aplicación (p. ej. whatsservices) necesita readWrite en masssivo_wa y masssivo_qr_inbox.
set -euo pipefail
: "${MONGO_SRC_URI:?Definir MONGO_SRC_URI (dump desde serwp)}"
: "${MONGO_ADMIN_URI:?Definir MONGO_ADMIN_URI (restore a otras DB, sin path de base o solo /?params)}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
WA_COLS=(
  wapi_inbox_chats wapi_inbox_messages wapi_mass_campaigns wapi_qr_message_templates
  wapi_send_clients wapi_send_companies wapi_send_company_webhook_verify_tokens
  wapi_send_company_whatsapp_configs wapi_send_otp_challenges wapi_send_users
  wapi_template_sample_uploads wapi_uploaded_media
)
QR_COLS=(wapi_inbox_qr_chats wapi_inbox_qr_messages)
for c in "${WA_COLS[@]}"; do
  echo "-> $c -> masssivo_wa"
  mongodump --uri="$MONGO_SRC_URI" -c "$c" -o "$TMP"
  mongorestore --uri="$MONGO_ADMIN_URI" -d masssivo_wa -c "$c" "$TMP/serwp/$c.bson"
  rm -rf "$TMP/serwp"
done
for c in "${QR_COLS[@]}"; do
  echo "-> $c -> masssivo_qr_inbox"
  mongodump --uri="$MONGO_SRC_URI" -c "$c" -o "$TMP"
  mongorestore --uri="$MONGO_ADMIN_URI" -d masssivo_qr_inbox -c "$c" "$TMP/serwp/$c.bson"
  rm -rf "$TMP/serwp"
done
echo "Listo. Configurar .env (MONGODB_URI=.../masssivo_wa, MONGODB_QR_INBOX_URI=.../masssivo_qr_inbox) y reiniciar."
