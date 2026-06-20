set -e
CLUSTER_NAME="task-queue-cluster"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "Step 1: Checking dependencies..."
if ! command -v kind &> /dev/null; then
    echo " kind is not installed. Please install it first (e.g. 'brew install kind')."
    exit 1
fi
if ! command -v kubectl &> /dev/null; then
    echo " kubectl is not installed. Please install it first."
    exit 1
fi
if ! command -v docker &> /dev/null; then
    echo " docker is not running. Please start Docker Desktop."
    exit 1
fi
echo "Step 2: Cleaning up any existing cluster..."
kind delete cluster --name "$CLUSTER_NAME" || true
echo "Step 3: Spinning up Kind cluster..."
kind create cluster --name "$CLUSTER_NAME" --config kind/kind-config.yaml
echo "Step 4: Installing NGINX Ingress Controller..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
echo "Waiting for Ingress Controller to be ready (this can take ~1 minute)..."
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s
echo "Step 5: Building API and Worker Docker images"
docker build -t task-queue-api:local -f docker/Dockerfile.api .
docker build -t task-queue-worker:local -f docker/Dockerfile.worker .
echo "Step 6: Loading Docker images into Kind cluster"
kind load docker-image task-queue-api:local --name "$CLUSTER_NAME"
kind load docker-image task-queue-worker:local --name "$CLUSTER_NAME"
echo "Step 7: Applying Kubernetes manifests"
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/sqlite-pvc.yaml
kubectl apply -f k8s/redis-pvc.yaml
kubectl apply -f k8s/redis-service.yaml
kubectl apply -f k8s/redis-deployment.yaml
kubectl apply -f k8s/api-service.yaml
kubectl apply -f k8s/api-deployment.yaml
kubectl apply -f k8s/worker-deployment.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/hpa.yaml
echo "Step 8: Waiting for API pods to be ready..."
kubectl wait --namespace task-queue \
  --for=condition=ready pod \
  --selector=app=api \
  --timeout=90s

echo "Kubernetes Environment Ready!"
echo "---"
echo "Access your API at: http://localhost"
echo "Check health endpoint: curl http://localhost/healthz"
echo "Check readiness endpoint: curl http://localhost/readyz"
echo "Monitor all pods: kubectl get pods -n task-queue"
echo "View logs: kubectl logs -l app=api -n task-queue -f"
echo "---"