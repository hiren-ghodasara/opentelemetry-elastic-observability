#!/usr/bin/env bash
# generate-traffic.sh — Sends realistic traffic to CoffeeBrew API
# Usage: ./scripts/generate-traffic.sh [requests]

set -e
API="${API_URL:-http://localhost:3001}"
N="${1:-30}"

echo "==> Sending $N requests to $API"
echo ""

# Menu item IDs (must match init.sql)
ITEMS=(
  "a0000001-0000-0000-0000-000000000001"  # Espresso
  "a0000001-0000-0000-0000-000000000002"  # Americano
  "a0000001-0000-0000-0000-000000000003"  # Cappuccino
  "a0000001-0000-0000-0000-000000000004"  # Flat White
  "a0000001-0000-0000-0000-000000000005"  # Caramel Latte
  "a0000001-0000-0000-0000-000000000007"  # Green Tea
  "a0000001-0000-0000-0000-000000000009"  # Croissant
)

success=0
errors=0

for i in $(seq 1 $N); do
  user_id=$((RANDOM % 5 + 1))
  item_idx=$((RANDOM % ${#ITEMS[@]}))
  item_id="${ITEMS[$item_idx]}"
  qty=$((RANDOM % 2 + 1))

  status=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$API/orders" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer demo-user-$user_id" \
    -d "{\"items\":[{\"menuItemId\":\"$item_id\",\"quantity\":$qty}]}" \
    --max-time 10)

  if [[ "$status" == "201" ]]; then
    success=$((success + 1))
    echo "  [OK $status] order $i/$N (user-$user_id, qty=$qty)"
  else
    errors=$((errors + 1))
    echo "  [ERR $status] order $i/$N"
  fi

  sleep 0.3
done

echo ""
echo "Done. Success: $success / Errors: $errors"
echo ""
echo "==> View traces: http://localhost:5601/app/apm/services/coffeebrew-backend/transactions"
