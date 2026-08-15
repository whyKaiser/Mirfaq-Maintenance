#!/usr/bin/env bash
# نسخة احتياطية من قاعدة بيانات مِرفق.
#
#   SQLite    : يستخدم "sqlite3 .backup" ليأخذ نسخة متسقة أثناء التشغيل.
#   PostgreSQL: يستخدم pg_dump بصيغة custom القابلة لـ pg_restore.
#
# الاستخدام:
#   MIRFAQ_DB_URL=... scripts/ops/backup-db.sh [مجلد_الوجهة]
#
# احتفظ بالنسخ خارج الخادم (S3 أو ما يعادله) — النسخة بجانب قاعدة البيانات
# لا تحمي من فقد الجهاز.

set -euo pipefail

DB_URL="${MIRFAQ_DB_URL:-}"
DEST_DIR="${1:-backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

if [ -z "$DB_URL" ]; then
  echo "MIRFAQ_DB_URL غير مضبوط" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"

case "$DB_URL" in
  file:*)
    DB_PATH="${DB_URL#file:}"
    if [ ! -f "$DB_PATH" ]; then
      echo "ملف قاعدة البيانات غير موجود: $DB_PATH" >&2
      exit 1
    fi
    OUT="$DEST_DIR/mirfaq-$STAMP.db"
    if command -v sqlite3 >/dev/null 2>&1; then
      sqlite3 "$DB_PATH" ".backup '$OUT'"
    else
      echo "sqlite3 غير مثبّت — يُنسخ الملف مباشرة (أوقف الخادم أولًا)" >&2
      cp "$DB_PATH" "$OUT"
    fi
    ;;
  postgres://*|postgresql://*)
    OUT="$DEST_DIR/mirfaq-$STAMP.dump"
    pg_dump --format=custom --no-owner --file "$OUT" "$DB_URL"
    ;;
  *)
    echo "صيغة MIRFAQ_DB_URL غير مدعومة: $DB_URL" >&2
    exit 1
    ;;
esac

echo "تمت النسخة: $OUT"
