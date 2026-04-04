# TaskCloud — Final Report

## Team Information

| Name | Student Number | Email |
|------|----------------|-------|
| Jibran Shah  | 1007902281 | jibraniqbal.shah@mail.utoronto.ca |
| Zhouhan Jin | 1006146699 | zhouhan.jin@mail.utoronto.ca |
| Xinyu(Cindy) Wang | 1002621344 | cindycw.wang@mail.utoronto.ca |

---

## 1. Motivation

Collaborative projects require team members to coordinate tasks, track progress, and maintain a shared project state. In many small-team environments — such as student project groups or short-term development teams — coordination is often managed through informal tools like shared documents or messaging platforms. These approaches lack structured task management, real-time synchronization, and reliable data persistence, which can lead to inconsistent information and potential data loss when systems restart or scale.

We chose this project because it addresses a practical problem faced by small collaborative teams, including student groups and small development teams, while also matching the technical focus of the course. These teams need lightweight coordination tools with shared visibility, concurrent updates, and a reliable source of truth for project state.

The project is significant because it combines a useful collaborative application with core cloud computing concerns such as persistent storage, containerized deployment, orchestration, monitoring, and secure multi-user access. This made it a strong way for our team to apply course concepts in one end-to-end system.

To address this problem, we built a **self-managed, cloud-native collaborative task management platform** that allows teams to create, assign, and update tasks while maintaining durable storage and synchronized updates. Instead of relying on managed tools that hide the infrastructure, we implemented the platform ourselves to better understand how these capabilities are designed and operated.

---

## 2. Objectives

The objective of this project was to design, implement, and deploy a cloud-native collaborative task management platform while applying the main infrastructure concepts covered in the course. Through the implementation, our team aimed to achieve the following:

1. **Build the core application** - Support user authentication, team membership, project organization, task tracking, search, and shared task updates for small collaborative teams.
2. **Create a reproducible deployment workflow** - Package the application with Docker and use Docker Compose for consistent local multi-container development.
3. **Implement durable cloud-hosted state** - Store application data in PostgreSQL and back it with persistent block storage so data survives restarts and redeployments.
4. **Deploy and orchestrate the system in the cloud** - Run the application on DigitalOcean using Docker Swarm for replication, networking, load balancing, and rolling updates.
5. **Improve collaboration and security** - Provide real-time task synchronization with WebSockets and enforce secure multi-user access with JWT, bcrypt, and RBAC.
6. **Establish operational reliability** - Add CI/CD automation, backup and recovery procedures, and monitoring to support maintainability and system resilience.

---

## 3. Technical Stack

The application uses a Node.js/Express backend that serves a lightweight browser frontend written in HTML, CSS, and vanilla JavaScript. PostgreSQL is used for persistent relational storage and full-text task search. Real-time updates are delivered through WebSockets, with Redis pub/sub used to support event fan-out across multiple app replicas. Docker and Docker Compose support packaging and local development, while Docker Swarm is the chosen orchestration approach for production deployment on DigitalOcean. Additional supporting tools include GitHub Actions for CI/CD, Jest and Supertest for automated testing, Helmet for HTTP hardening, and `pg_dump` plus cron for backup and recovery.

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Frontend | HTML, CSS, vanilla JavaScript | Browser UI and WebSocket client |
| Backend | Node.js 20 + Express | REST API, static file serving, and application logic |
| Database | PostgreSQL 16 | Relational persistence and PostgreSQL full-text search |
| Real-time messaging | `ws` + Redis | WebSocket task updates and cross-replica message fan-out |
| Authentication and authorization | JWT + bcrypt + RBAC middleware | User authentication and role-based access control |
| Containerization | Docker + Docker Compose | Image packaging and local multi-container development |
| Orchestration | **Docker Swarm** | Production replicas, networking, load balancing, and rolling updates |
| Cloud platform | **DigitalOcean** | Droplet hosting, Volumes, Container Registry, and Monitoring |
| Testing | Jest + Supertest | Automated API and integration tests |
| CI/CD | GitHub Actions | Automated test → build → push → deploy pipeline |
| Monitoring | DigitalOcean Monitoring | CPU, memory, disk metrics, dashboards, and alerts |
| Backup and recovery | `pg_dump` + cron + `restore.sh` | Scheduled backups and documented restore process |
| Security tools | Helmet.js + Docker Secrets | HTTP security headers and production secret management |

### Orchestration Approach: Docker Swarm

Docker Swarm was selected over Kubernetes because it integrates directly with our Docker-based workflow and fits the scale and timeline of this project. In production, the Swarm stack manages:

- **2 app replicas** behind Swarm's routing mesh for load balancing
- **Rolling updates** using `order: start-first`
- **Restart policies** and application health checks for service recovery
- **Overlay networking** for communication between the app, database, and Redis services
- **Docker Secrets** for production credential management (`db_password` and `jwt_secret`)
- **Placement constraints** to keep PostgreSQL on the manager node where the persistent volume is mounted
- **Redis-assisted WebSocket fan-out** so task events can be delivered across multiple replicas

---

## 4. Features

### 4.1 Core Features

**Containerization and Local Development**
The application is packaged as Docker containers so the backend and database run in a consistent environment across developer machines and deployment targets. Docker Compose is used for local development to bring up the Node.js application and PostgreSQL together, with reproducible networking, environment configuration, and startup behavior.

**State Management**
Application state is stored in PostgreSQL 16, which persists users, teams, memberships, projects, and tasks. In production, the database data directory is mounted to a DigitalOcean Volume so task and account data survive container restarts, rolling updates, and redeployments.

**Deployment Provider**
The system is deployed on DigitalOcean infrastructure. A DigitalOcean Droplet hosts the Docker Swarm cluster, while a separate block storage volume is attached for durable PostgreSQL storage. This setup provides a simple but realistic cloud environment with direct control over compute, storage, and deployment behavior.

**Orchestration Approach**
Docker Swarm is used to orchestrate the deployed services. The production stack runs two application replicas behind Swarm's routing mesh, supports rolling updates with `start-first`, uses an overlay network for internal communication, and applies placement constraints so PostgreSQL remains on the manager node where the persistent volume is mounted.

**Monitoring and Observability**
Monitoring is provided through the DigitalOcean Monitoring Agent and platform dashboards. CPU, memory, and disk usage are tracked for the deployed host, enabling the team to verify system health, observe resource trends during testing and deployment, and configure alerts for abnormal conditions.

### 4.2 Advanced Features

**Real-time functionality**
When a task is created, updated, or deleted, the server broadcasts a JSON message to WebSocket clients associated with the same team. The WebSocket layer maintains in-memory team rooms using a `Map<teamId, Set<WebSocket>>`, authenticates each connection with a JWT passed in the query string, and performs a server-side **ping/pong heartbeat every 30 seconds** to terminate stale connections. On the frontend, the browser client automatically reconnects with exponential backoff and refreshes the active board when relevant task events arrive. In production, Redis pub/sub is also supported so task events can fan out across multiple app replicas.

**CI/CD pipeline**
The pipeline has three stages:
1. **Test** - On pull requests to `main` and pushes to `main`, GitHub Actions starts a PostgreSQL service container, initializes the schema, and runs the Jest test suite.
2. **Build & Push** - On pushes to `main`, the workflow builds the Docker image and pushes both the commit SHA tag and the `latest` tag to DigitalOcean Container Registry.
3. **Deploy** - On pushes to `main`, the workflow copies `docker-stack.yml` to the droplet over SCP, then SSHs into the Swarm manager and runs `docker stack deploy` to update the running stack.


**Backup and recovery**
A shell script (`scripts/backup.sh`) performs `pg_dump` from the running PostgreSQL container, compresses the output with gzip, and stores it in a backup directory with a 7-day retention policy. The script is designed to run from cron for nightly backups and can optionally upload backup files to DigitalOcean Spaces when `s3cmd` is configured. A companion `restore.sh` script restores a selected `.sql.gz` backup by piping it back into PostgreSQL.

**Security enhancements**
- Passwords are hashed with bcrypt using 12 salt rounds before storage
- JWT-based authentication is enforced on protected API routes and WebSocket connections
- RBAC is implemented with middleware such as `requireTeamAdmin()`, `requireTeamMember()`, and `requireProjectAccess()`
- SQL statements use parameterized queries throughout the Express routes
- Helmet.js adds HTTP security headers to the Express app
- Production deployment supports Docker Secrets via `*_FILE` environment variables for the database password and JWT signing secret

### 4.3 Requirement Fulfillment

The main infrastructure features described in Sections 4.1 and 4.2 fulfill the course project requirements as follows:

- **Containerization and Local Development:** The application is packaged with Docker, and Docker Compose provides a reproducible multi-container local environment for the Node.js backend and PostgreSQL database. This satisfies the required containerization component and directly supports Objective 1 on reproducible deployment.
- **State Management:** All persistent application data, including users, teams, memberships, projects, and tasks, is stored in PostgreSQL. In production, the PostgreSQL data directory is bind-mounted to `/mnt/taskcloud_data/pgdata` on a DigitalOcean Volume, so state survives container restarts, rolling updates, and redeployments. This satisfies the required PostgreSQL plus persistent storage requirement and supports Objective 2.
- **Deployment Provider:** The system is deployed on DigitalOcean infrastructure, using a Droplet for compute and a DigitalOcean Volume for durable block storage. This satisfies the required deployment-provider component while giving the project a realistic cloud environment for service hosting, storage, and monitoring.
- **Orchestration Approach:** Docker Swarm is used as the orchestration platform. The deployed stack includes two application replicas, Swarm routing-mesh load balancing, overlay networking, restart policies, and rolling updates. This satisfies the orchestration requirement and supports Objective 3 on service replication, load balancing, and managed updates.
- **Monitoring and Observability:** DigitalOcean Monitoring is used to track CPU, memory, and disk metrics for the deployed host and to support dashboards and alerts for system health. This satisfies the monitoring requirement and supports Objective 7 on infrastructure visibility and reliability analysis.
- **Advanced Features:** The project exceeds the minimum requirement of two advanced features by implementing four: real-time functionality through WebSockets, security enhancements through JWT, bcrypt, RBAC, Helmet, and Docker Secrets support, a CI/CD pipeline through GitHub Actions, and backup/recovery through automated PostgreSQL backup and restore scripts. These features collectively support Objectives 4, 5, and 6 by enabling live collaboration, secure multi-user access, automated deployment, and operational recovery.

Together, these features support the application's user-facing functionality, including team management, project organization, task tracking, search, and real-time collaborative updates, while also demonstrating the cloud-native engineering goals of the project: reproducible deployment, durable state management, orchestrated services, security, automation, and observability.

---

## 5. User Guide

### 5.1 Registration and Login

1. Navigate to the application URL in your browser.
2. Click the **Sign Up** tab, enter an email, username, and password (minimum 6 characters), then click **Create Account**.
3. You are automatically logged in and taken to the main dashboard.
4. To log out, click **Logout** in the top-right corner.

### 5.2 Team Management

1. Click **+ New** next to "Teams" in the left sidebar.
2. Enter a team name and description, then click **Create**.
3. You are automatically assigned as the team **Admin**.
4. Click the team name in the sidebar to view team details and members.
5. To add a member, enter their registered email, choose a role (`Member` or `Admin`), then click **Add**.
6. To remove a member, click the **remove icon** beside their name. Team admins cannot remove themselves through the UI.
7. Team admins also see a **Delete Team** button in the team detail view.

### 5.3 Project Management

1. Select a team from the sidebar.
2. Click **+ New** next to "Projects" to create a project.
3. In the project creation modal, enter a name and description, then click **Create**.
4. Click a project name to open the Kanban task board.
5. Team admins see **Edit Project** and **Delete Project** buttons in the board header.

### 5.4 Task Board

1. Open a project, then click **+ New Task**.
2. Enter a title, description, and priority, then click **Create**.
3. Use the **To Do**, **In Progress**, and **Done** buttons on each task card to change its status.
4. Click the **edit** icon on a task card to open the edit modal, where you can update the title, description, status, and priority.
5. Team admins see a **delete** icon on each task card and can remove tasks from the board.
6. Priority is indicated by a colored left border: red (high), yellow (medium), green (low).

### 5.5 Real-Time Collaboration

1. Open the application in two browser tabs (or two different browsers).
2. Log in to accounts that belong to the same team and open the same project.
3. Create, edit, or move a task in one tab; the board refreshes automatically in the other tab.
4. The status dot in the top-right corner shows the WebSocket state: green for connected, yellow for reconnecting, and red/gray for disconnected.

### 5.6 Search

1. Type a keyword in the search bar at the top of the page.
2. Press **Enter** or click **Search**.
3. Results show matching tasks across all your teams and projects, together with the project and team names.
4. Click a search result to open the related project board.
5. Click **Close** to leave the search-results view.

---

## 6. Development Guide

### Prerequisites

- **Docker Desktop** (includes Docker Compose)
- **Node.js 20+** and **npm** (only needed for native app development)
- **Git**

### Option 1: Docker Compose Local Setup

```bash
git clone <repo-url>
cd ece-1779Cloud-TaskCloud

# Start the app, PostgreSQL, and Redis
docker compose up --build -d

# The app is available at http://localhost:3000
# PostgreSQL is available at localhost:5433
# Redis is available at localhost:6379
```

When the application starts, it automatically initializes the database schema from `src/config/schema.sql`.

```bash
# View logs
docker compose logs -f app

# Stop services but keep local database data
docker compose down

# Stop services and delete the local PostgreSQL volume
docker compose down -v
```

### Option 2: Native App Development

```bash
# Start supporting services
docker compose up -d db redis

# Create .env file
cp .env.example .env
```

For native development, update `.env` so the Node.js process connects to the Dockerized services from your host machine:

```env
DB_HOST=localhost
DB_PORT=5433
DB_NAME=taskcloud
DB_USER=taskcloud
DB_PASSWORD=taskcloud_dev
JWT_SECRET=dev-jwt-secret-change-in-production
# Optional for native development:
REDIS_URL=redis://localhost:6379
```

`REDIS_URL` is optional when running a single local app instance, but enabling it makes local development closer to the production configuration.

```bash
# Install dependencies
npm install

# Start the app with hot reload
npm run dev
```

### Database and Storage

- Local development uses the PostgreSQL service defined in `docker-compose.yml`.
- PostgreSQL data is stored in the named Docker volume `pgdata`, so local state survives container restarts and `docker compose down`.
- Running `docker compose down -v` removes that volume and resets the local database state.
- In production, PostgreSQL is stored on a DigitalOcean Volume bind-mounted at `/mnt/taskcloud_data/pgdata`.

### Running Tests Locally

Use a separate test database so test data does not mix with your main local development data.

```bash
# Ensure PostgreSQL is running
docker compose up -d db

# Create the test database (only needed once)
docker compose exec db createdb -U taskcloud taskcloud_test

# Initialize the schema in the test database
DB_HOST=localhost DB_PORT=5433 DB_NAME=taskcloud_test DB_USER=taskcloud \
  DB_PASSWORD=taskcloud_dev JWT_SECRET=test-secret NODE_ENV=test \
  npm run db:init

# Run the test suite
DB_HOST=localhost DB_PORT=5433 DB_NAME=taskcloud_test DB_USER=taskcloud \
  DB_PASSWORD=taskcloud_dev JWT_SECRET=test-secret NODE_ENV=test \
  npm test
```

Tests use **Supertest** to send HTTP requests directly to the Express app in-process, without starting a separate HTTP server. The CI pipeline uses the same pattern with a PostgreSQL service container.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | `development` | Runtime environment |
| `DB_HOST` | `db` | PostgreSQL hostname (`db` in Docker, `localhost` native) |
| `DB_PORT` | `5432` | PostgreSQL port (`5433` when mapped via Docker Compose) |
| `DB_NAME` | `taskcloud` | Database name |
| `DB_USER` | `taskcloud` | Database user |
| `DB_PASSWORD` | `taskcloud_dev` in local Compose | Database password |
| `JWT_SECRET` | set in Compose / `.env` | Secret key for JWT signing |
| `JWT_EXPIRES_IN` | `7d` | Token expiry duration |
| `REDIS_URL` | unset | Optional Redis connection string for WebSocket pub/sub |

For the Swarm deployment, secrets can also be supplied through `DB_PASSWORD_FILE` and `JWT_SECRET_FILE`, but those are production-only and are not required for local development.

---

## 7. Deployment Information

**Live URL:** http://134.122.43.217/

The application is deployed on a DigitalOcean Droplet running Docker Swarm. PostgreSQL data is stored on an attached DigitalOcean Volume mounted at `/mnt/taskcloud_data/pgdata`. DigitalOcean Monitoring is used to observe CPU, memory, and disk usage for the deployed host.

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
