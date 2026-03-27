# TaskCloud - Collaborative Task Management Platform

A **stateful cloud-native** web application for teams to manage tasks with real-time updates and persistent data storage. Built for the ECE1779 course project.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              GitHub Actions CI/CD                               │
│                                                                                 │
│   Push to main ──> Run Tests ──> Build Image ──> Push to Registry ──> Deploy    │
└──────────────────────────────────────────┬──────────────────────────────────────┘
                                           │ SSH deploy
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  DigitalOcean Droplet (Ubuntu + Docker)                        Monitoring Agent │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                         Docker Swarm Cluster                               │ │
│  │                                                                            │ │
│  │  ┌──────────────────── Overlay Network (app-net) ───────────────────────┐ │ │
│  │  │                                                                      │ │ │
│  │  │  ┌─────────────────────┐     ┌─────────────────────┐                 │ │ │
│  │  │  │   App Replica 1     │     │   App Replica 2     │                 │ │ │
│  │  │  │                     │     │                     │                 │ │ │
│  │  │  │  Express API :3000  │     │  Express API :3000  │  Load Balanced  │ │ │
│  │  │  │  WebSocket   /ws    │     │  WebSocket   /ws    │  via Swarm      │ │ │
│  │  │  │  Static UI   /      │     │  Static UI   /      │  Routing Mesh   │ │ │
│  │  │  │                     │     │                     │                 │ │ │
│  │  │  │  ┌───────────────┐  │     │  ┌───────────────┐  │                 │ │ │
│  │  │  │  │  Middleware   │  │     │  │  Middleware   │  │                 │ │ │
│  │  │  │  │  ├─ Helmet    │  │     │  │  ├─ Helmet    │  │                 │ │ │
│  │  │  │  │  ├─ JWT Auth  │  │     │  │  ├─ JWT Auth  │  │                 │ │ │
│  │  │  │  │  └─ RBAC      │  │     │  │  └─ RBAC      │  │                 │ │ │
│  │  │  │  └───────────────┘  │     │  └───────────────┘  │                 │ │ │
│  │  │  └──────────┬──────────┘     └──────────┬──────────┘                 │ │ │
│  │  │             │         ┌─────────────────┘                            │ │ │
│  │  │             ▼         ▼                                              │ │ │
│  │  │  ┌─────────────────────────┐                                         │ │ │
│  │  │  │     PostgreSQL 16       │                                         │ │ │
│  │  │  │                         │                                         │ │ │
│  │  │  │  users                  │                                         │ │ │
│  │  │  │  teams                  │                                         │ │ │
│  │  │  │  team_memberships       │    ┌─────────────────────────┐          │ │ │
│  │  │  │  projects               │───▶│  Docker Secret          │          │ │ │
│  │  │  │  tasks                  │    │  /run/secrets/db_pass   │          │ │ │
│  │  │  │                         │    │  /run/secrets/jwt_secret│          │ │ │
│  │  │  │  GIN full-text index    │    └─────────────────────────┘          │ │ │
│  │  │  └────────────┬────────────┘                                         │ │ │
│  │  │               │                                                      │ │ │
│  │  └───────────────┼──────────────────────────────────────────────────────┘ │ │
│  │                  │                                                        │ │
│  └──────────────────┼────────────────────────────────────────────────────────┘ │
│                     │ bind mount                                               │
│                     ▼                                                          │
│  ┌─────────────────────────────────┐    ┌──────────────────────────────────┐   │
│  │   DigitalOcean Volume (10 GiB)  │    │   Cron: Nightly pg_dump Backup   │   │
│  │   /mnt/taskcloud_data/pgdata    │    │   /opt/taskcloud/backups/        │   │
│  │                                 │    │   (optional: → DO Spaces)        │   │
│  │   Persists across:              │    └──────────────────────────────────┘   │
│  │   • container restarts          │                                           │
│  │   • stack redeployments         │    ┌──────────────────────────────────┐   │
│  │   • droplet rebuilds            │    │   DO Monitoring Dashboard        │   │
│  │                                 │    │   CPU / Memory / Disk Alerts     │   │
│  └─────────────────────────────────┘    └──────────────────────────────────┘   │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                                  Clients                                        │
│                                                                                 │
│   Browser A ──── HTTP REST ────▶ :80 ──▶ Swarm routes to Replica 1 or 2         │
│             ──── WebSocket ────▶ /ws ──▶ Real-time task push updates            │
│                                                                                 │
│   Browser B ──── HTTP REST ────▶ :80 ──▶ Swarm routes to Replica 1 or 2         │
│             ──── WebSocket ────▶ /ws ──▶ Receives broadcast when A changes task │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

Data Flow:
  Client ──▶ Swarm LB ──▶ App Replica ──▶ JWT Auth ──▶ RBAC Check ──▶ PostgreSQL
                                │
                                └──▶ broadcast(teamId, event) ──▶ WebSocket push
                                                                   to all team
                                                                   members online
```

## Features

### Core
- **User Authentication** — Register/login with JWT tokens and bcrypt password hashing
- **Role-Based Access Control** — Admin and Member roles per team
- **Team Management** — Create teams, invite members, manage roles
- **Project Organization** — Group tasks into projects within teams
- **Task Board** — Kanban-style board with To Do / In Progress / Done columns
- **Task Search** — Full-text search across tasks using PostgreSQL `tsvector`

### Advanced (Cloud Features)
- **Real-time Updates** — WebSocket push notifications for task changes
- **CI/CD Pipeline** — GitHub Actions for automated test, build, and deploy
- **Backup & Recovery** — Automated `pg_dump` backups with restore scripts
- **Security** — JWT auth, bcrypt hashing, Helmet headers, RBAC on all endpoints

### Infrastructure
- **Docker** — Containerized Node.js app with multi-stage health checks
- **Docker Compose** — Local multi-container development
- **Docker Swarm** — Production orchestration with replicas and rolling updates
- **PostgreSQL** — Relational persistence with DigitalOcean Volumes
- **DigitalOcean** — Cloud deployment with monitoring and alerts

## Quick Start (Local Development)

### Prerequisites
- Docker and Docker Compose

### Run

```bash
# Clone the repository
git clone <repo-url> && cd taskCloudApp

# Start all services
docker compose up --build

# The app is available at http://localhost:3000
```

The database schema initializes automatically on first startup.

### Without Docker (development)

```bash
# Requires a running PostgreSQL instance
cp .env.example .env
# Edit .env with your database credentials

npm install
npm run dev
```

## API Reference

### Authentication

| Method | Endpoint            | Description             | Auth |
|--------|---------------------|-------------------------|------|
| POST   | `/api/auth/register`| Create a new account    | No   |
| POST   | `/api/auth/login`   | Sign in, receive JWT    | No   |
| GET    | `/api/auth/me`      | Get current user info   | Yes  |

### Teams

| Method | Endpoint                          | Description           | Auth / Role     |
|--------|-----------------------------------|-----------------------|-----------------|
| POST   | `/api/teams`                      | Create a team         | Authenticated   |
| GET    | `/api/teams`                      | List your teams       | Authenticated   |
| GET    | `/api/teams/:id`                  | Team details + members| Team Member     |
| PUT    | `/api/teams/:id`                  | Update team           | Team Admin      |
| DELETE | `/api/teams/:id`                  | Delete team           | Team Admin      |
| POST   | `/api/teams/:id/members`          | Add member            | Team Admin      |
| DELETE | `/api/teams/:id/members/:userId`  | Remove member         | Team Admin      |
| PUT    | `/api/teams/:id/members/:userId/role` | Change role       | Team Admin      |

### Projects

| Method | Endpoint                             | Description        | Auth / Role     |
|--------|--------------------------------------|--------------------|-----------------|
| POST   | `/api/teams/:teamId/projects`        | Create project     | Team Member     |
| GET    | `/api/teams/:teamId/projects`        | List projects      | Team Member     |
| GET    | `/api/projects/:id`                  | Project details    | Project Member  |
| PUT    | `/api/projects/:id`                  | Update project     | Team Admin      |
| DELETE | `/api/projects/:id`                  | Delete project     | Team Admin      |

### Tasks

| Method | Endpoint                              | Description        | Auth / Role     |
|--------|---------------------------------------|--------------------|-----------------|
| POST   | `/api/projects/:projectId/tasks`      | Create task        | Project Member  |
| GET    | `/api/projects/:projectId/tasks`      | List tasks (filter)| Project Member  |
| GET    | `/api/tasks/:id`                      | Task details       | Team Member     |
| PUT    | `/api/tasks/:id`                      | Update task        | Team Member     |
| DELETE | `/api/tasks/:id`                      | Delete task        | Admin or Creator|
| GET    | `/api/search/tasks?q=keyword`         | Search tasks       | Authenticated   |

**Task filters** (query params on list): `status`, `priority`, `assigned_to`, `sort` (newest, oldest, priority, due_date)

### WebSocket

Connect to `ws://host/ws?token=<JWT>`. Messages are JSON:

```json
{ "type": "task:created", "task": { ... } }
{ "type": "task:updated", "task": { ... } }
{ "type": "task:deleted", "taskId": 123 }
```

## Production Deployment (DigitalOcean + Docker Swarm)

### 1. Provision Infrastructure

```bash
# Create a DigitalOcean Droplet (manager node)
doctl compute droplet create taskcloud-manager \
  --size s-2vcpu-4gb --image docker-20-04 --region nyc1

# Create a DigitalOcean Volume for persistent storage
doctl compute volume create taskcloud-data --size 10GiB --region nyc1

# Attach volume to the droplet
doctl compute volume-action attach <volume-id> <droplet-id>
```

### 2. Set Up Swarm

```bash
# SSH into the manager node
ssh root@<droplet-ip>

# Initialize Docker Swarm
docker swarm init --advertise-addr <droplet-ip>

# Mount the DO volume
mkdir -p /mnt/taskcloud_data/pgdata
mount -o discard,defaults /dev/disk/by-id/scsi-0DO_Volume_taskcloud-data /mnt/taskcloud_data

# Create secrets
echo "strong-db-password" | docker secret create db_password -
echo "strong-jwt-secret-key" | docker secret create jwt_secret -
```

### 3. Deploy

```bash
# Pull the latest image and deploy the stack
docker stack deploy -c docker-stack.yml taskcloud
```

### 4. Monitoring

Set up DigitalOcean monitoring alerts for CPU, memory, and disk usage via the DigitalOcean control panel. Install the monitoring agent:

```bash
curl -sSL https://repos.insights.digitalocean.com/install.sh | sudo bash
```

### 5. Automated Backups

```bash
# Copy backup script to the server
scp scripts/backup.sh root@<droplet-ip>:/opt/taskcloud/scripts/

# Add cron job for nightly backups
echo "0 2 * * * /opt/taskcloud/scripts/backup.sh >> /var/log/taskcloud-backup.log 2>&1" | crontab -
```

## CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/deploy.yml`) automates:

1. **Test** — Runs on every push/PR: installs deps, initializes test DB, runs tests
2. **Build** — On merge to `main`: builds Docker image, pushes to DO Container Registry
3. **Deploy** — On merge to `main`: SSHs into the Swarm manager and updates the stack

### Required GitHub Secrets

| Secret                     | Description                        |
|----------------------------|------------------------------------|
| `DIGITALOCEAN_ACCESS_TOKEN`| DigitalOcean API token             |
| `DEPLOY_HOST`              | Droplet IP address                 |
| `DEPLOY_USER`              | SSH user (usually `root`)          |
| `DEPLOY_SSH_KEY`           | Private SSH key for deployment     |

## Database Schema

```
users ──< team_memberships >── teams
                                  │
                              projects
                                  │
                               tasks
```

- **users** — id, email, username, password_hash, timestamps
- **teams** — id, name, description, created_by, timestamps
- **team_memberships** — user_id, team_id, role (admin/member)
- **projects** — id, name, description, team_id, created_by, timestamps
- **tasks** — id, title, description, status, priority, project_id, assigned_to, created_by, due_date, timestamps

## Project Structure

```
taskCloudApp/
├── .github/workflows/deploy.yml    # CI/CD pipeline
├── public/                         # Frontend (served by Express)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── scripts/
│   ├── backup.sh                   # Automated DB backup
│   └── restore.sh                  # DB restore procedure
├── src/
│   ├── config/
│   │   ├── db.js                   # PostgreSQL connection pool
│   │   ├── initDb.js               # Schema initialization script
│   │   └── schema.sql              # Database schema
│   ├── middleware/
│   │   ├── auth.js                 # JWT authentication
│   │   └── rbac.js                 # Role-based access control
│   ├── routes/
│   │   ├── auth.js                 # Auth endpoints
│   │   ├── teams.js                # Team management
│   │   ├── projects.js             # Project endpoints
│   │   └── tasks.js                # Task CRUD + search
│   ├── websocket/
│   │   └── index.js                # WebSocket real-time handler
│   └── index.js                    # Express server entry point
├── docker-compose.yml              # Local development
├── docker-stack.yml                # Swarm production deployment
├── Dockerfile
├── package.json
└── .env.example
```

## Technology Stack

| Component        | Technology                          |
|------------------|-------------------------------------|
| Backend          | Node.js + Express                   |
| Database         | PostgreSQL 16                       |
| Real-time        | WebSocket (ws library)              |
| Auth             | JWT + bcrypt                        |
| Containerization | Docker + Docker Compose             |
| Orchestration    | Docker Swarm                        |
| Cloud Provider   | DigitalOcean (Droplets + Volumes)   |
| CI/CD            | GitHub Actions                      |
| Monitoring       | DigitalOcean Monitoring             |
| Backup           | pg_dump + DigitalOcean Spaces       |
