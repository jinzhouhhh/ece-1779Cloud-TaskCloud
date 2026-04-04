# TaskCloud — Final Report

## Team Information

| Name | Student Number | Email |
|------|----------------|-------|
| TODO | TODO | TODO |
| TODO | TODO | TODO |
| TODO | TODO | TODO |

---

## 1. Motivation

Collaborative projects require team members to coordinate tasks, track progress, and maintain a shared project state. In many small-team environments — such as student project groups or short-term development teams — coordination is often managed through informal tools like shared documents or messaging platforms. These approaches lack structured task management, real-time synchronization, and reliable data persistence, which can lead to inconsistent information and potential data loss when systems restart or scale.

From a cloud computing perspective, maintaining a consistent shared state across multiple users highlights key challenges including persistent storage, distributed service deployment, and system reliability. Existing tools like ClickUp and Monday.com are managed services that hide infrastructure details entirely, providing limited visibility into how persistence, orchestration, and monitoring are implemented at the system level.

Our project addresses these challenges by designing a **self-managed, cloud-native collaborative task management platform** that enables teams to create, assign, and update tasks while ensuring durable storage and synchronized updates. Building the system from the infrastructure layer up — rather than relying on opaque managed services — allows us to directly explore and implement core cloud computing concepts taught in the course.

---

## 2. Objectives

The objective of this project is to design, implement, and deploy a cloud-native collaborative task management platform that demonstrates the following capabilities:

1. **Containerized deployment** — Package the application and its dependencies into Docker containers for reproducible builds across development, testing, and production environments.
2. **Persistent stateful storage** — Maintain durable application data in PostgreSQL backed by cloud block storage, ensuring data survives container restarts, redeployments, and infrastructure changes.
3. **Service orchestration** — Use Docker Swarm to manage service replicas, load balancing, rolling updates, and failure recovery.
4. **Real-time collaboration** — Provide instant synchronization of task changes across connected clients using WebSocket push updates.
5. **Security** — Implement authentication (JWT + bcrypt) and role-based access control (RBAC) to enforce multi-tenant isolation.
6. **Automated operations** — Establish a CI/CD pipeline for automated testing and deployment, and scheduled database backups for disaster recovery.
7. **Monitoring and observability** — Track infrastructure health and resource utilization to support reliability analysis.

---

## 3. Technical Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Backend | Node.js 20 + Express | REST API server and static file serving |
| Database | PostgreSQL 16 | Relational data persistence with full-text search |
| Real-time | WebSocket (`ws` library) | Server-to-client push updates with ping/pong heartbeat |
| Authentication | JWT + bcrypt (12 salt rounds) | Stateless token auth with secure password hashing |
| Containerization | Docker + Docker Compose | Application packaging and local multi-container dev |
| Orchestration | **Docker Swarm** | Production service replication, load balancing, rolling updates |
| Cloud Provider | **DigitalOcean** | Droplets (compute), Volumes (persistent storage), Monitoring |
| CI/CD | GitHub Actions | Automated test → build → push → deploy pipeline |
| Monitoring | DigitalOcean Monitoring Agent | CPU, memory, disk metrics and alerting |
| Backup | `pg_dump` + cron | Nightly automated database backups with retention policy |
| Security Headers | Helmet.js | HTTP security headers (XSS, clickjacking, MIME sniffing) |

### Orchestration: Docker Swarm

Docker Swarm was selected over Kubernetes for its lightweight setup, native Docker integration, and suitability for small-to-medium deployments within the project timeline. Our Swarm configuration includes:

- **2 app replicas** with Swarm's built-in routing mesh for load balancing
- **Rolling updates** (`order: start-first`) for zero-downtime deployments
- **Resource limits** (0.5 CPU, 512MB memory per service) to prevent resource exhaustion
- **Overlay network** for secure inter-service communication
- **Docker Secrets** for encrypted credential management (database password, JWT secret)
- **Placement constraints** to pin the database to the manager node (where the persistent volume is mounted)

---

## 4. Features

### 4.1 Core Features

**User Authentication and Authorization**
Users register with email, username, and password. Passwords are hashed with bcrypt (12 salt rounds) and never stored in plaintext. On login, the server issues a JWT token (7-day expiry) used for all subsequent API requests. The `authenticate` middleware verifies the token and fetches fresh user data from the database on every request, ensuring deleted or modified accounts are caught immediately.

**Role-Based Access Control (RBAC)**
Each team membership carries a role: `admin` or `member`. RBAC is enforced at the middleware level through `requireTeamAdmin()`, `requireTeamMember()`, and `requireProjectAccess()`. Admins can manage team membership, edit/delete projects, and delete any task. Members can create tasks and update task status but cannot modify team structure.

**Team and Project Management**
Users create teams and are automatically assigned the admin role. Admins invite members by email and can remove members or change roles. Projects are organizational units within teams that group related tasks.

**Kanban Task Board**
Tasks are displayed in a three-column board: **To Do**, **In Progress**, and **Done**. Users can create tasks with title, description, priority (low/medium/high), and due date. Tasks are moved between columns using action buttons. Clicking a task card opens an edit modal for full modification.

**Full-Text Search**
Task search uses PostgreSQL's built-in `tsvector` and `plainto_tsquery` with a GIN index on the `title` and `description` columns. This supports stemmed English-language search (e.g., searching "docker" matches "dockerized") and runs efficiently even with large datasets. Results are scoped to teams the user belongs to.

### 4.2 Advanced Features

**Real-Time Collaboration (WebSocket)**
When a task is created, updated, or deleted, the server broadcasts a JSON message to all WebSocket clients subscribed to the same team. The WebSocket layer uses a `Map<teamId, Set<WebSocket>>` data structure for room-based pub/sub. Authentication is performed via JWT passed as a query parameter. A **ping/pong heartbeat** (25-second interval) detects and terminates stale connections, with the client automatically reconnecting within seconds.

**CI/CD Pipeline (GitHub Actions)**
The pipeline has three stages:
1. **Test** — On every push/PR: spins up a PostgreSQL service container, initializes the schema, runs Jest + Supertest integration tests.
2. **Build & Push** — On merge to `main`: builds the Docker image and pushes it to DigitalOcean Container Registry with both SHA and `latest` tags.
3. **Deploy** — On merge to `main`: SSHs into the Swarm manager node and performs a rolling stack update.

Deployment stages are gated by a `DEPLOY_ENABLED` repository variable, allowing the test stage to run independently without cloud credentials.

**Backup and Recovery**
A shell script (`scripts/backup.sh`) performs `pg_dump` from the running PostgreSQL container, compresses the output with gzip, and stores it locally with a 7-day retention policy. Optional upload to DigitalOcean Spaces is supported. A companion `restore.sh` script documents the recovery procedure. In production, the backup runs nightly via cron.

**Security Enhancements**
- Passwords hashed with bcrypt (12 rounds, ~250ms per hash to resist brute-force)
- JWT tokens with configurable expiry
- Parameterized SQL queries throughout (preventing SQL injection)
- Helmet.js middleware for HTTP security headers
- Docker Secrets for credential management in production (no passwords in environment variables)
- RBAC enforced on all 15+ API endpoints

### 4.3 Requirement Fulfillment

| Requirement | Implementation |
|-------------|---------------|
| Containerization | Dockerfile (Node.js 20 Alpine) + Docker Compose for local dev |
| Persistent Storage | PostgreSQL data directory bind-mounted to a DigitalOcean Volume (`/mnt/taskcloud_data/pgdata`) |
| Cloud Deployment | DigitalOcean Droplet running Docker Swarm |
| Orchestration | Docker Swarm with 2 app replicas, rolling updates, overlay networking |
| Monitoring | DigitalOcean Monitoring Agent with CPU/memory/disk alerts |
| Advanced Feature 1 | Real-time WebSocket with heartbeat |
| Advanced Feature 2 | CI/CD with GitHub Actions |
| Advanced Feature 3 | Automated PostgreSQL backups |
| Advanced Feature 4 | JWT authentication + RBAC |

---

## 5. User Guide

### 5.1 Registration and Login

1. Navigate to the application URL in your browser.
2. Click the **Sign Up** tab, enter an email, username, and password (minimum 6 characters), then click **Create Account**.
3. You are automatically logged in and taken to the main dashboard.
4. To log out, click **Logout** in the top-right corner.

<!-- Screenshot: Auth page -->

### 5.2 Team Management

1. Click **+ New** next to "Teams" in the left sidebar.
2. Enter a team name and description, then click **Save**.
3. You are automatically assigned as the team **Admin**.
4. Click the team name in the sidebar to view team details and members.
5. To add a member: enter their registered email in the "Add member" form and click **Add**.
6. To remove a member: click the red **Remove** button next to their name.

<!-- Screenshot: Team detail with members -->

### 5.3 Project Management

1. Select a team from the sidebar.
2. Click **+ New** next to "Projects" to create a project.
3. Click a project name to open the Kanban task board.
4. Admins see **Edit Project** and **Delete Project** buttons in the board header.

<!-- Screenshot: Project list in sidebar -->

### 5.4 Task Board

1. Click **+ New Task** to create a task with title, description, priority, and due date.
2. Use the **Start**, **Done**, **Back**, and **Reopen** buttons to move tasks between columns.
3. Click a task card to open the edit modal for full modification.
4. Click **Del** to delete a task (admins can delete any task; members can only delete their own).
5. Priority is indicated by a colored left border: red (high), yellow (medium), green (low).

<!-- Screenshot: Kanban board with tasks in all three columns -->

### 5.5 Real-Time Collaboration

1. Open the application in two browser tabs (or two different browsers).
2. Log in to the same team and navigate to the same project.
3. Create or move a task in one tab — it appears instantly in the other.
4. The green dot in the top-right corner indicates an active WebSocket connection.

### 5.6 Search

1. Type a keyword in the search bar at the top of the page.
2. Press **Enter** or click **Search**.
3. Results show matching tasks across all your teams and projects, with project and team names.

---

## 6. Development Guide

### Prerequisites

- **Docker Desktop** (includes Docker Compose)
- **Node.js 20+** and **npm** (only if running without Docker)
- **Git**

### Quick Start (Docker — Recommended)

```bash
git clone <repo-url>
cd taskCloudApp

# Start the application and database
docker compose up --build -d

# The app is available at http://localhost:3000
# PostgreSQL is available at localhost:5433
```

The database schema initializes automatically on first startup via `CREATE TABLE IF NOT EXISTS` statements.

```bash
# View logs
docker compose logs -f app

# Stop
docker compose down

# Stop and delete all data
docker compose down -v
```

### Native Development (with hot-reload)

```bash
# Start only the database container
docker compose up -d db

# Create .env file
cp .env.example .env
# Edit .env: set DB_HOST=localhost, DB_PORT=5433

# Install dependencies
npm install

# Start with hot-reload (nodemon)
npm run dev
```

### Running Tests

```bash
# With the database running (localhost:5433):
DB_HOST=localhost DB_PORT=5433 DB_NAME=taskcloud DB_USER=taskcloud \
  DB_PASSWORD=taskcloud_dev JWT_SECRET=test-secret NODE_ENV=test \
  npx jest --forceExit
```

Tests use **Supertest** to send HTTP requests directly to the Express app in-process, without starting a real server. The CI pipeline runs these tests against a PostgreSQL service container on every push.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `DB_HOST` | `db` | PostgreSQL hostname (`db` in Docker, `localhost` native) |
| `DB_PORT` | `5432` | PostgreSQL port (`5433` when mapped via Docker Compose) |
| `DB_NAME` | `taskcloud` | Database name |
| `DB_USER` | `taskcloud` | Database user |
| `DB_PASSWORD` | — | Database password |
| `JWT_SECRET` | — | Secret key for JWT signing |
| `JWT_EXPIRES_IN` | `7d` | Token expiry duration |

---

## 7. Deployment Information

**Live URL:** `http://<DROPLET_IP>` *(TODO: replace with actual IP after deployment)*

The application is deployed on a DigitalOcean Droplet running Docker Swarm in the `tor1` (Toronto) region. PostgreSQL data is stored on a 10 GiB DigitalOcean Volume mounted at `/mnt/taskcloud_data/pgdata`. The DigitalOcean Monitoring Agent reports CPU, memory, and disk metrics to the DigitalOcean dashboard with alert policies configured for resource exhaustion.

---

## 8. System Architecture

```
┌─────────────────────── GitHub Actions CI/CD ────────────────────────┐
│  Push to main → Test (Jest) → Build Image → Push to Registry → SSH │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ deploy
┌────────────────────────────────▼────────────────────────────────────┐
│  DigitalOcean Droplet                                               │
│  ┌────────────────── Docker Swarm ────────────────────┐             │
│  │                                                    │             │
│  │   ┌──────────────┐       ┌──────────────┐          │             │
│  │   │ App Replica 1│       │ App Replica 2│          │             │
│  │   │  Express API │◄─LB──►│  Express API │          │             │
│  │   │  WebSocket   │       │  WebSocket   │          │             │
│  │   │  JWT + RBAC  │       │  JWT + RBAC  │          │             │
│  │   └──────┬───────┘       └──────┬───────┘          │             │
│  │          └──────────┬───────────┘                   │             │
│  │                     ▼                               │             │
│  │          ┌──────────────────┐    Docker Secrets     │             │
│  │          │  PostgreSQL 16   │◄── (db_pass, jwt)     │             │
│  │          └────────┬─────────┘                       │             │
│  └───────────────────┼────────────────────────────────┘             │
│                      ▼                                              │
│           ┌────────────────────┐  ┌─────────────────┐               │
│           │ DO Volume (10 GiB) │  │ DO Monitoring    │               │
│           │ Persistent Storage │  │ CPU/Mem/Disk     │               │
│           └────────────────────┘  └─────────────────┘               │
│                                   ┌─────────────────┐               │
│                                   │ Cron: pg_dump    │               │
│                                   │ Nightly Backups  │               │
│                                   └─────────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
        ▲ HTTP :80              ▲ WebSocket /ws
        │                       │
   ┌────┴───────────────────────┴─────┐
   │  Browser Clients (Real-time)     │
   └──────────────────────────────────┘
```

---

## 9. AI Assistance & Verification Summary

AI tools (GitHub Copilot, Claude) were used as development accelerators during the project. The team maintained full understanding and ownership of all code through manual review and testing.

### Where AI Contributed

- **Architecture exploration:** AI helped evaluate trade-offs between Docker Swarm and Kubernetes for our project scale, and suggested the `Map<teamId, Set<WebSocket>>` room-based pub/sub pattern for real-time updates.
- **Docker/Swarm configuration:** AI assisted with `docker-stack.yml` configuration including Docker Secrets, rolling update policies, resource limits, and volume bind-mount syntax.
- **Debugging:** AI helped diagnose a WebSocket stale connection issue where real-time updates would intermittently fail due to the absence of a ping/pong heartbeat mechanism.
- **Boilerplate and documentation:** AI generated initial Express route scaffolding, SQL schema definitions, and the CI/CD workflow structure, which were then reviewed and modified by the team.

### Representative AI Limitation

AI initially generated WebSocket code **without a heartbeat mechanism** and with team subscriptions that were only set once at connection time. This caused two bugs: (1) users who created a team after connecting never received real-time updates for that team, and (2) connections that went stale due to idle timeouts appeared connected but silently dropped messages. Both issues required manual debugging with multi-browser testing to identify and were fixed by adding dynamic re-subscription logic and a server-side ping/pong heartbeat with client-side timeout detection. See `ai-session.md` for the full debugging session.

### Verification Methods

- **Automated testing:** Jest + Supertest integration tests covering health checks, authentication flows, and RBAC enforcement, run on every push via GitHub Actions CI.
- **Manual end-to-end testing:** Multi-browser testing to verify real-time WebSocket sync, RBAC permission enforcement (admin vs. member), and task lifecycle operations.
- **Infrastructure verification:** `docker stack services` to confirm replica counts, `docker service logs` for runtime error inspection, and DigitalOcean monitoring dashboards for resource utilization.
- **Persistence testing:** Data survival verified by running `docker service update --force` and `docker stack rm` / redeploy cycles, confirming PostgreSQL data on the DigitalOcean Volume remained intact.

---

## 10. Individual Contributions

<!-- TODO: Each team member fills in their contributions -->

| Team Member | Contributions |
|-------------|---------------|
| TODO | TODO |
| TODO | TODO |
| TODO | TODO |

---

## 11. Lessons Learned and Concluding Remarks

**Stateful services are the hard part of cloud-native design.** Containerizing a stateless Node.js API is straightforward, but managing PostgreSQL in a Swarm cluster required careful thought about volume mounts, placement constraints, and backup strategies. The distinction between managed storage (which the course rightly excludes) and self-managed persistent volumes gave us direct insight into why platforms like Kubernetes invest so heavily in StatefulSets and PersistentVolumeClaims.

**Real-time systems need explicit liveness detection.** Our initial WebSocket implementation worked during active use but silently failed during idle periods. Adding a ping/pong heartbeat was a small code change but represented a fundamental shift in thinking: a connection that *appears* open is not necessarily *functional*. This lesson applies broadly to any distributed system with long-lived connections.

**CI/CD transforms deployment from a risky event into a routine operation.** Before the GitHub Actions pipeline, deploying required SSH access, manual Docker builds, and careful coordination. After implementing CI/CD, deployment became a side effect of merging to `main`. The psychological shift from "deployment is scary" to "deployment is boring" was one of the most valuable outcomes of the project.

**RBAC complexity grows faster than expected.** With just two roles (admin and member), we still needed five different middleware functions and per-route access checks. Each new entity (teams, projects, tasks) introduced its own access patterns. This experience clarified why real-world systems use dedicated authorization frameworks rather than ad-hoc middleware chains.

**Docker Swarm is underrated for small-scale deployments.** While Kubernetes dominates industry discussion, Docker Swarm provided everything we needed — service replication, load balancing, rolling updates, secrets management, and overlay networking — with significantly less configuration overhead. For a team of three deploying to a single node, Swarm was the pragmatic choice.

In summary, this project provided hands-on experience with the full lifecycle of a cloud-native application: from local Docker Compose development through CI/CD automation to production deployment on DigitalOcean with Docker Swarm orchestration. The challenges we encountered — persistent storage management, WebSocket reliability, and RBAC design — reflect real-world concerns that the course curriculum prepared us to address.
