#!/usr/bin/env bash
# Pipes the seeded templates out of the running local database and runs the
# parser against them. Node 24 strips the TypeScript types natively.
set -uo pipefail

DB_CONTAINER=$(docker ps --filter "name=supabase_db_" --format "{{.Names}}" | head -1)
if [ -z "$DB_CONTAINER" ]; then
  echo "Local Supabase is not running. Start it with: npm run db:start" >&2
  exit 1
fi

HERE="$(cd "$(dirname "$0")" && pwd)"

docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -t -A -c \
  "select coalesce(json_agg(row_to_json(t)), '[]')
     from (select id, user_id, bank_key, label, sender_pattern, match_pattern,
                  field_patterns, kind, priority, sample
             from public.parser_templates
            where enabled) t" \
  | node --experimental-strip-types "$HERE/parser.test.ts"
