# Production-Grade Distributed Task Queue Platform

A production-inspired, containerized task processing system designed to demonstrate SRE (Site Reliability Engineering) and DevOps best practices. This platform features horizontal API scaling, background job worker isolation, persistent state handling, automatic security scanning, and automated Prometheus/Grafana monitoring.

---

## Architecture Overview

```
                        [ Internet (Port 80/443) ]
                                    │
                                    ▼
                         [ NGINX Ingress Controller ]
                                    │
                                    ▼
                          [ API Load Balancer ]
                                    │
                  ┌─────────────────┴─────────────────┐
                  ▼                                   ▼
          [ API Pod (Replica 1) ]             [ API Pod (Replica 2) ]
                  │                                   │
                  ├─────────────────┬─────────────────┤
                  ▼                 ▼                 ▼
          [ SQLite Database ]  [ Redis Cache ]  [ Worker Pod (BullMQ) ]
             (sqlite-pvc)        (redis-pvc)
```

1. **Express.js API Nodes**: Exposes REST endpoints to create, retrieve, and delete tasks. Multi-replica deployment managed under a Kubernetes rolling update strategy.
2. **BullMQ / Redis Queue Broker**: Handles asynchronous job queueing, retries, exponential backoffs, and dead-letter queueing.
3. **Background Worker**: Isolated consumer process running BullMQ processors to consume tasks asynchronously and update the persistent database.
4. **Shared SQLite Database**: A file-based database mounted on a shared `PersistentVolumeClaim` (PVC), demonstrating WAL (Write-Ahead Logging) database operations across scaled Kubernetes pods.

---

## Features & Implementation Phases

### ☸️ Local Kubernetes Setup (Kind)
* Configured a single-node **Kind (Kubernetes in Docker)** cluster with host port mappings (`80`/`443`) for local ingress routing.
* Created Kubernetes manifests under `k8s/` for Deployments, ClusterIP Services, PersistentVolumeClaims, and an NGINX Ingress Controller.
* Added a **Horizontal Pod Autoscaler (HPA)** targeting 70% CPU usage to automatically scale API replicas.

### 📊 Observability (Prometheus & Grafana)
* **Custom Metrics**: Leveraged `prom-client` in Node.js to track HTTP requests, request duration (histograms), queue depth, and worker task processing status.
* **Prometheus Service Discovery**: Deployed Prometheus inside the cluster, utilizing Kubernetes RBAC permissions to dynamically discover and scrape the `/metrics` endpoints.
* **SRE Alerting Rules**: Configured alerts for critical SRE events:
  * `APIInstanceDown`
  * `HighHTTP5xxErrorRate` (>5%)
  * `HighAPILatency` (p95 > 500ms)
  * `QueueBuildUp` (>100 pending jobs)
* **Automated Grafana Dashboards**: Deployed Grafana pre-provisioned with the Prometheus datasource and a custom **SRE Performance Dashboard** demonstrating the **RED Method** (Rate, Errors, Duration).

### 🧪 Testing & CI/CD Pipeline
* **Unit Tests**: 9 mock-based tests validating business logic isolated from database/queue brokers.
* **Integration Tests**: 7 end-to-end tests validating the HTTP API endpoints and the real worker processing loop against a test SQLite database and local Redis.
* **GitHub Actions Workflow**: Runs linting, Prettier format verification, GitLeaks secret scans, Trivy security CVE container scans, unit/integration tests, and pushes verified Docker images.

---

## Quick Start (Local Run)

### 1. Run via Docker Compose
To run the entire stack locally in standard containers (without Kubernetes):
```bash
cd task-queue
docker compose up --build
```
* API accessible at: `http://localhost:3009`

### 2. Run inside Kubernetes (Kind)
To spin up the Kind cluster and deploy all manifests:
```bash
cd task-queue
chmod +x kind/setup.sh
./kind/setup.sh
```
* API accessible at: `http://localhost` (Port 80 Ingress)

### 3. Run Integration Tests
Make sure your local Redis container is running on port 6380, then run:
```bash
cd task-queue
REDIS_PORT=6380 npm run test:integration
```
