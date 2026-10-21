#!/usr/bin/env bash
# Copia de produccion SOLO las tablas de contenido y el registro de migraciones,
# para reproducir en local el estado real de prod sin traer datos personales
# (users, conversations, citas y sesiones quedan fuera a proposito).
#
# Solo lee: pg_dump no escribe en el servidor de origen. No vincula el proyecto
# con el CLI de Supabase, para que ningun `db push` posterior pueda tocar prod.
#
# Usa el pg_dump 17 del contenedor de Supabase local, porque prod corre
# Postgres 17 y el pg_dump de Homebrew es anterior y se niega a conectarse.
#
# Uso: bash scripts/pull-prod-content.sh
set -euo pipefail

CONTAINER="supabase_db_europabot"
OUT="backups/prod_contenido_$(date +%Y%m%d_%H%M%S).sql"

TABLES=(
  supabase_migrations.schema_migrations
  public.scopes
  public.scope_aliases
  public.scope_ads
  public.scope_tree_version
  public.catalog_values
  public.bot_responses
  public.intent_configurations
  public.resources
  public.bot_config
  public.client_brand_config
  public.appointment_config
  public.agent_config
)

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

# Solo se piden las tablas que existen en prod: si prod no tiene el arbol de
# alcances, sus tablas faltan y pg_dump fallaria por completo.
existing=$(echo "select schemaname || '.' || tablename from pg_tables where schemaname in ('public', 'supabase_migrations')" \
  | docker exec -i -e PGURL="$PROD_DB_URL" "$CONTAINER" sh -c 'psql "$PGURL" -At')

args=()
missing=()
for table in "${TABLES[@]}"; do
  if grep -qx "$table" <<< "$existing"; then
    args+=("--table=$table")
  else
    missing+=("$table")
  fi
done

mkdir -p backups
docker exec -e PGURL="$PROD_DB_URL" "$CONTAINER" \
  sh -c 'pg_dump "$PGURL" --data-only --no-owner --no-privileges "$@"' _ "${args[@]}" > "$OUT"
unset PROD_DB_URL

echo "Listo: $OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"
if ((${#missing[@]})); then
  echo "Tablas que no existen en prod: ${missing[*]}"
fi
echo "Ultimas migraciones aplicadas en prod:"
grep -E $'^([0-9]{3}|[0-9]{14})\t' "$OUT" | cut -f1 | sort | tail -3 || true
