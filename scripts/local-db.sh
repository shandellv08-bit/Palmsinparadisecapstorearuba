#!/usr/bin/env bash
# Starts a local Supabase (needs Docker) with all migrations applied, and
# prints the values to put in .env.local. Safe: it never touches your real project.
set -euo pipefail
cd "$(dirname "$0")/.."
npx --yes supabase@3.0.0 start -x vector,logflare,edge-runtime,supavisor,imgproxy,postgres-meta
npx --yes supabase@3.0.0 status
echo
echo "Put API_URL, ANON_KEY and SERVICE_ROLE_KEY above into .env.local as"
echo "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY."
echo "Reset the local database at any time with: npx supabase@3.0.0 db reset"
