#!/usr/bin/env bash
# Copies the keys the GitHub workflows need from .env into repository secrets and
# variables, without printing any values. Re-run after rotating a key.
#
#   bash scripts/sync-github-secrets.sh            # Instagram + LLM + email
#   bash scripts/sync-github-secrets.sh --agents   # also Twitter/Reddit/Tavily keys
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo ".env not found"; exit 1; }

SECRETS=(ANTHROPIC_API_KEY OPENAI_API_KEY XAI_API_KEY
         IG_ACCESS_TOKEN IG_USER_ID
         R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY
         SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS EMAIL_FROM EMAIL_TO)
VARIABLES=(R2_BUCKET R2_PUBLIC_BASE_URL IG_HANDLE)
if [ "${1:-}" = "--agents" ]; then
  SECRETS+=(TAVILY_API_KEY TWITTER_APP_KEY TWITTER_APP_SECRET TWITTER_ACCESS_TOKEN TWITTER_ACCESS_SECRET
            REDDIT_CLIENT_ID REDDIT_CLIENT_SECRET REDDIT_USERNAME REDDIT_PASSWORD REDDIT_USER_AGENT)
fi

value_of() { # last assignment wins, strip surrounding quotes, ignore comments
  grep -E "^$1=" .env | tail -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'
}

for k in "${SECRETS[@]}"; do
  v="$(value_of "$k" || true)"
  if [ -n "$v" ]; then printf '%s' "$v" | gh secret set "$k" >/dev/null && echo "secret   ✅ $k"
  else echo "secret   ⏭  $k (not in .env)"; fi
done
for k in "${VARIABLES[@]}"; do
  v="$(value_of "$k" || true)"
  if [ -n "$v" ]; then gh variable set "$k" --body "$v" >/dev/null && echo "variable ✅ $k"
  else echo "variable ⏭  $k (not in .env)"; fi
done
