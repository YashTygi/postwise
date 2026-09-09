#!/usr/bin/env bash
# Call one cron job and translate the result into a GitHub Actions status.
#
# Running out of Gemini's 20-per-day free quota is expected and transient, so it
# becomes a warning annotation rather than a red run. Anything else is a real
# failure and should stay red.
set -uo pipefail

job="$1"
body=$(curl -sS --max-time 120 -w '\n%{http_code}' \
  "${POSTWISE_URL}/api/cron?job=${job}&secret=${CRON_SECRET}")
status=$(tail -n1 <<<"$body")
payload=$(sed '$d' <<<"$body")

echo "$payload"

if grep -q '"quotaExhausted":true' <<<"$payload"; then
  echo "::warning title=Gemini quota::${job}: daily free-tier quota is spent; it resumes when Google resets it"
  exit 0
fi

if [ "$status" != "200" ]; then
  echo "::error title=Cron failed::${job} returned HTTP ${status}"
  exit 1
fi
