#!/usr/bin/env bash
# generate-failures.sh — Triggers all observability failure scenarios
# Usage: ./scripts/generate-failures.sh

API="${API_URL:-http://localhost:3001}"

echo "==> Triggering observability failure scenarios"
echo ""

run_scenario() {
  local name="$1"
  local url="$2"
  local desc="$3"
  echo "── Scenario: $name ──────────────────────────────────"
  echo "   $desc"
  result=$(curl -s -w "\n%{http_code}" "$url" --max-time 15)
  status=$(echo "$result" | tail -1)
  body=$(echo "$result" | head -n -1)
  echo "   Status: $status"
  echo "   Response: $(echo "$body" | head -c 200)"
  echo ""
  sleep 1
}

run_scenario "A: Healthy" \
  "$API/scenarios/healthy" \
  "Clean successful trace — look for green spans in APM"

run_scenario "B: Slow (3s)" \
  "$API/scenarios/slow?ms=3000" \
  "Slow DB query — look for high-latency span in waterfall"

run_scenario "B: Very Slow (6s)" \
  "$API/scenarios/slow?ms=6000" \
  "Very slow DB query — will show as outlier in latency histogram"

run_scenario "C: DB Error" \
  "$API/scenarios/db-error" \
  "Database query failure — look for ERROR status and exception details"

run_scenario "D: Timeout" \
  "$API/scenarios/timeout?ms=1500" \
  "External API timeout — look for timeout span and 504 status"

run_scenario "E: Cascade" \
  "$API/scenarios/cascade" \
  "Multiple failures — multiple red spans in single trace"

# Also trigger a validation error
echo "── Invalid Order (400) ──────────────────────────────"
echo "   Validation failure — look for 400 error in APM"
curl -s -X POST "$API/orders" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer demo-user-1" \
  -d '{"items":[]}' | head -c 200
echo ""
echo ""

# Auth failure
echo "── Auth Failure (401) ───────────────────────────────"
echo "   Invalid token — look for auth failure in logs"
curl -s -X POST "$API/orders" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer invalid" \
  -d '{"items":[{"menuItemId":"a0000001-0000-0000-0000-000000000001","quantity":1}]}' | head -c 200
echo ""
echo ""

echo "==> All scenarios triggered!"
echo ""
echo "   Investigate in Kibana:"
echo "   • APM errors:    http://localhost:5601/app/apm/services/coffeebrew-backend/errors"
echo "   • Slow traces:   http://localhost:5601/app/apm/services/coffeebrew-backend/transactions"
echo "   • Log stream:    http://localhost:5601/app/logs/stream"
echo "   • Service map:   http://localhost:5601/app/apm/service-map"
