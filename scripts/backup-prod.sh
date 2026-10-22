#!/usr/bin/env bash
# Respaldo completo de produccion antes de aplicar migraciones: estructura y
# datos del esquema public (incluidos usuarios y conversaciones) mas el
# registro de migraciones. Sirve para restaurar si un despliegue sale mal.
#
# Solo lee: pg_dump no escribe en el servidor de origen. La salida trae datos
# personales: vive en backups/, ignorada por git, y no se comparte.
#
# Usa el pg_dump 17 del contenedor de Supabase local, porque prod corre
# Postgres 17 y el pg_dump de Homebrew es anterior y se niega a conectarse.
#
# Uso: bash scripts/backup-prod.sh
set -euo pipefail

CONTAINER="supabase_db_europabot"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="backups/prod_backup_completo_${STAMP}.dump"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "El contenedor $CONTAINER no esta corriendo. Ejecuta 'supabase start' primero." >&2
  exit 1
fi

echo "Pega la cadena de conexion de prod (Supabase > Connect > Session pooler)."
echo "No se muestra en pantalla ni se guarda."
read -r -s -p "URI: " PROD_DB_URL
echo

if [[ "$PROD_DB_URL" != postgresql://* && "$PROD_DB_URL" != postgres://* ]]; then
  echo "La cadena debe empezar con postgresql://" >&2
  exit 1
fi

mkdir -p backups
# Formato custom (-Fc): comprimido y restaurable por partes con pg_restore.
docker exec -e PGURL="$PROD_DB_URL" "$CONTAINER" \
  sh -c 'pg_dump "$PGURL" -Fc --no-owner --no-privileges --schema=public --schema=supabase_migrations' > "$OUT"
unset PROD_DB_URL

echo "Listo: $OUT ($(du -h "$OUT" | cut -f1))"
echo "Contenido del respaldo:"
docker exec -i "$CONTAINER" pg_restore --list < "$OUT" \
  | grep -cE ' TABLE DATA ' | xargs -I{} echo "  {} tablas con datos"
echo "Migraciones registradas:"
docker exec -i "$CONTAINER" pg_restore --data-only --table=schema_migrations -f - < "$OUT" \
  | grep -E $'^([0-9]{3}|[0-9]{14})\t' | cut -f1 | sort | tail -1 | xargs -I{} echo "  ultima: {}"
