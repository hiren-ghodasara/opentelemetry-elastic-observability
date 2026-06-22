#!/usr/bin/env bash
# wait-for-stack.sh — Waits until all services are healthy before generating traffic

API="${API_URL:-http://localhost:3001}"
KIBANA="${KIBANA_URL:-http://localhost:5601}"
ES="${ES_URL:-http://localhost:9200}"

echo "==> Waiting for stack to be ready..."

wait_for() {
  local name="$1"
  local url="$2"
  local max="${3:-60}"
  local i=0
  echo -n "   Waiting for $name"
  while ! curl -s "$url" > /dev/null 2>&1; do
    sleep 3
    i=$((i + 3))
    echo -n "."
    if [ $i -ge $max ]; then
      echo " TIMEOUT"
      return 1
    fi
  done
  echo " READY"
}

wait_for "Elasticsearch" "$ES/_cluster/health" 120
wait_for "Kibana" "$KIBANA/api/status" 120
wait_for "Backend" "$API/health" 60

echo ""
echo "==> Stack is ready! Generate traffic with:"
echo "   ./scripts/generate-traffic.sh 30"
echo "   ./scripts/generate-failures.sh"
