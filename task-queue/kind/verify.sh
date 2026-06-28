#!/usr/bin/env bash
set -euo pipefail

echo "===================================================="
echo "🚀 Starting Kubernetes End-to-End Verification..."
echo "===================================================="

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "❌ jq is required but not installed. Please install jq."
    exit 1
fi

# Check health endpoint (with retries for Ingress propagation)
echo "Checking healthz endpoint..."
MAX_HEALTH_ATTEMPTS=15
ATTEMPT=1
HEALTH_STATUS=""
while [ "$ATTEMPT" -le "$MAX_HEALTH_ATTEMPTS" ]; do
    HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/healthz || echo "failed")
    if [ "$HEALTH_STATUS" = "200" ]; then
        echo "✅ Healthz is healthy!"
        break
    fi
    echo "Waiting for healthz to be ready (attempt $ATTEMPT/$MAX_HEALTH_ATTEMPTS, status: $HEALTH_STATUS)..."
    sleep 2
    ATTEMPT=$((ATTEMPT + 1))
done

if [ "$HEALTH_STATUS" != "200" ]; then
    echo "❌ Healthz check failed with status $HEALTH_STATUS"
    exit 1
fi

# Check readiness endpoint (with retries for backend connection & Ingress sync)
echo "Checking readyz endpoint..."
MAX_READY_ATTEMPTS=15
ATTEMPT=1
READY_STATUS=""
while [ "$ATTEMPT" -le "$MAX_READY_ATTEMPTS" ]; do
    READY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/readyz || echo "failed")
    if [ "$READY_STATUS" = "200" ]; then
        echo "✅ Readyz is ready!"
        break
    fi
    echo "Waiting for readyz to be ready (attempt $ATTEMPT/$MAX_READY_ATTEMPTS, status: $READY_STATUS)..."
    sleep 2
    ATTEMPT=$((ATTEMPT + 1))
done

if [ "$READY_STATUS" != "200" ]; then
    echo "❌ Readyz check failed with status $READY_STATUS"
    echo "--- Debug: API Pod Logs ---"
    kubectl logs -l app=api -n task-queue --tail=50
    echo "--- Debug: Worker Pod Logs ---"
    kubectl logs -l app=worker -n task-queue --tail=50
    exit 1
fi

# Submit a task via the API
echo "Submitting a new task..."
SUBMIT_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"payload": {"type": "e2e-test", "action": "verify-ci"}, "priority": 5}' \
  http://localhost/tasks)

echo "Response from API: $SUBMIT_RESPONSE"

TASK_ID=$(echo "$SUBMIT_RESPONSE" | jq -r '.id // empty')

if [ -z "$TASK_ID" ]; then
    echo "❌ Failed to extract task ID from API response!"
    exit 1
fi

echo "✅ Task successfully created with ID: $TASK_ID"

# Poll task status until completed
MAX_ATTEMPTS=20
ATTEMPT=1
STATUS="pending"

echo "Waiting for task $TASK_ID to be completed..."
while [ "$ATTEMPT" -le "$MAX_ATTEMPTS" ]; do
    echo "Attempt $ATTEMPT/$MAX_ATTEMPTS..."
    TASK_INFO=$(curl -s http://localhost/tasks/"$TASK_ID")
    echo "Task Info: $TASK_INFO"
    
    STATUS=$(echo "$TASK_INFO" | jq -r '.status // empty')
    
    if [ "$STATUS" = "completed" ]; then
        echo "✅ Task completed successfully in $((ATTEMPT * 2)) seconds!"
        break
    elif [ "$STATUS" = "failed" ]; then
        echo "❌ Task processing failed!"
        exit 1
    fi
    
    sleep 2
    ATTEMPT=$((ATTEMPT + 1))
done

if [ "$STATUS" != "completed" ]; then
    echo "❌ Task did not complete in time. Current status: $STATUS"
    echo "--- Debug: API Pod Logs ---"
    kubectl logs -l app=api -n task-queue --tail=50
    echo "--- Debug: Worker Pod Logs ---"
    kubectl logs -l app=worker -n task-queue --tail=50
    exit 1
fi

echo "===================================================="
echo "🎉 Kubernetes E2E Verification PASSED!"
echo "===================================================="