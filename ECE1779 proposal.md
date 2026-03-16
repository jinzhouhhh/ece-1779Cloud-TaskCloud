

# 1. Motivation  
   1. Problem Statement

Collaborative projects require team members to coordinate tasks, track progress, and maintain a shared project state. In many small-team environments, such as student project groups or short-term development teams, coordination is often managed through informal tools like shared documents or messaging platforms. These approaches lack structured task management, real-time synchronization, and reliable data persistence, which can lead to inconsistent information and potential data loss when systems restart or scale.

From a cloud computing perspective, maintaining a consistent shared state across multiple users highlights key challenges including persistent storage, distributed service deployment, and system reliability. Our project aims to address these challenges by designing a cloud-native collaborative task management platform that enables teams to create, assign, and update tasks while ensuring durable storage and synchronized updates.

2. Target Users

Our system targets small collaborative teams, including university project groups and small development teams that require lightweight coordination tools. Focusing on small teams ensures that the proposed architecture aligns with realistic usage scenarios while supporting concurrent task updates and shared access to project data.

3. Value and Relevance

Our proposed project provides a practical application of core cloud computing principles taught in the course. A collaborative task management system naturally requires persistent storage, containerized services, orchestration, and monitoring to ensure reliability and availability. Implementing these components within a unified platform demonstrates how cloud infrastructure supports scalable and resilient applications.

4. Existing Solutions and Limitations

Tools like ClickUp and Monday.com are managed services that hide infrastructure details. While effective for end users, they provide limited visibility into how persistence, orchestration, scalability, and monitoring are implemented at the system level. Our project instead focuses on building a self-managed system to directly explore and implement core cloud computing concepts, including containerization, orchestration, persistent storage, and system monitoring.

# 2. Objective and Key Features  
   1. Project Objective and Overview

The objective of this project is to design and deploy a cloud-native collaborative task management platform that enables teams to create, assign, and track tasks with real-time updates and persistent data storage. Core application functionality includes user authentication and role-based access control (Admin vs Member) enforced on task/team/project endpoints. The system demonstrates core cloud computing concepts by integrating containerized services, reliable database persistence, service orchestration, and monitoring within a cloud deployment environment. 

The platform consists of a containerized Node.js backend, a PostgreSQL database for persistent storage, and supporting cloud infrastructure deployed on DigitalOcean. Users interact with the system through API endpoints that manage authentication, team collaboration, and task operations. 

2. Orchestration Approach

The project will use *Docker Swarm* as the orchestration platform. Docker Swarm is selected due to its lightweight setup, native integration with Docker containers, and suitability for small-to-medium scale deployments within the project timeline.

Swarm will be used to:

* manage containerized services  
* enable service replication  
* provide built-in load balancing  
* support controlled deployment and scaling of application components

This orchestration layer ensures that application services remain available and manageable in a distributed cloud environment.

3. Deployment Provider

The system will be deployed on *DigitalOcean*, using cloud droplets to host containerized services. DigitalOcean is chosen for its simplicity, transparent infrastructure management, and integrated monitoring capabilities, which align well with the learning objectives of the course. Application services will run within Docker containers on cloud instances, enabling reproducible deployments between local development and the production environment.

4. Database Schema and Persistent Storage

Persistent storage will be implemented using a *PostgreSQL* relational database. The database will store application data including users, teams, projects, and tasks.

The planned schema includes:

* Users: authentication and account information  
* Teams: collaborative groups  
* Projects: organizational units for tasks  
* Tasks: task descriptions, assignments, and status tracking  
* Team Memberships: role associations between users and teams

To ensure durability, database data will be stored using *DigitalOcean Volumes*, allowing application state to persist independently of container lifecycles. This configuration ensures that data remains intact during service restarts, updates, or redeployments.

5. Monitoring Setup

System monitoring will be implemented using DigitalOcean’s built-in monitoring tools to track infrastructure and application health. We will use DigitalOcean monitoring to track CPU/memory, container resource usage, and service health.

Monitoring dashboards will allow observation of system behavior under normal operation and during deployment changes, supporting reliability analysis and debugging.

6. Advanced Features

The project extends beyond the core deployment requirements through the following advanced cloud features:  
2.6.1 Real-time collaboration (WebSockets):

* When a task is created, updated, or moved, connected clients within the same team or project receive immediate push updates  
* The API service maintains WebSocket connections and broadcasts task changes across replicated services in the Docker Swarm environment

This feature demonstrates real-time state synchronization in a distributed system.

2.6.2 CI/CD pipeline with GitHub Actions:

* Automatic build and testing triggered on pull requests  
* On merge to main, a Docker image is built and pushed to a container registry, followed by automated deployment to the Swarm cluster

This pipeline ensures reproducible deployments and continuous integration practices consistent with modern cloud workflows.

2.6.3 Backup and recovery (automated PostgreSQL backups):

* Nightly `pg_dump` backups stored in a cloud-accessible location (e.g., DigitalOcean Spaces)  
* Documented restore procedures to support system recovery and reproducibility

This feature demonstrates operational reliability and data protection practices.

2.6.4 Security enhancements (authentication and authorization):

* User authentication (registration/login) with secure password storage (hashing) and session or token-based auth (e.g., JWT)
* Role-based access control (RBAC) enforced on API routes (e.g., Admin vs Member permissions for managing teams/projects and updating tasks)

This feature demonstrates access control and account security in a multi-user cloud application.



7. Fulfillment of Course Project Requirements

The proposed system satisfies the requirements of the course project as follows:

**Containerization and Local Development:**  
All services are containerized using Docker, with Docker Compose enabling consistent multi-service local development and reproducible environments.

**Persistent Storage:**  
Application data is stored in a PostgreSQL database backed by DigitalOcean Volumes, ensuring durability across container restarts and redeployments.

**Cloud Deployment:**  
The application is deployed on DigitalOcean Droplets, providing a production-like cloud environment accessible to remote users.

**Service Orchestration:**  
Docker Swarm manages containerized services, supporting service replication, networking, and load balancing within a distributed setup.

**Monitoring and Observability:**  
DigitalOcean monitoring tools track system health and resource utilization, including CPU, memory, and service availability metrics.

**Advanced Features:**  
The project will incorporate additional advanced cloud features (described in Section 2.6) that extend functionality beyond core deployment requirements.

Together, these components demonstrate an end-to-end cloud-native application integrating deployment, persistence, orchestration, and monitoring.

8. Scope and Feasibility

The project scope is intentionally designed for small collaborative teams to ensure feasibility within the course timeline. Core functionality including authentication, task management, persistent storage, orchestration, and monitoring forms the minimum viable system. Advanced features will extend functionality without affecting completion of required components. By limiting system scale while fully implementing cloud infrastructure concepts, the project prioritizes depth of implementation and reliable deployment over unnecessary complexity.



