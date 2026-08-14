#!/usr/bin/env bash

set -euo pipefail

readonly BRO_PROJECT_REF="gzexehiujwxfeddwsljx"
readonly BRO_POOLER_HOST="aws-0-ap-southeast-1.pooler.supabase.com"

if ! command -v railway >/dev/null 2>&1; then
  echo "Railway CLI is required." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required to safely encode the database password." >&2
  exit 1
fi

read -r -s -p "Supabase database password: " bro_db_password
printf '\n'

if [[ -z "${bro_db_password}" ]]; then
  echo "Database password cannot be empty." >&2
  exit 1
fi

trap 'unset bro_db_password bro_encoded_password bro_database_url' EXIT

bro_encoded_password="$({
  printf '%s' "${bro_db_password}" |
    node -e 'let input = ""; process.stdin.setEncoding("utf8"); process.stdin.on("data", (chunk) => input += chunk); process.stdin.on("end", () => process.stdout.write(encodeURIComponent(input)));'
})"

bro_database_url="postgresql://postgres.${BRO_PROJECT_REF}:${bro_encoded_password}@${BRO_POOLER_HOST}:5432/postgres?sslmode=require"

echo "Applying Bro database migrations..."
DATABASE_DIRECT_URL="${bro_database_url}" pnpm --filter @bro/db db:migrate

for bro_service in web worker; do
  printf '%s' "${bro_database_url}" |
    railway variable set DATABASE_URL --stdin --service "${bro_service}" --skip-deploys --json
  printf '%s' "${bro_database_url}" |
    railway variable set DATABASE_DIRECT_URL --stdin --service "${bro_service}" --skip-deploys --json
done

echo "Database migrations and Railway database variables are configured."
