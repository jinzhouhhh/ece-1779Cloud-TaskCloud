# AI Interaction Record

This file documents representative AI interactions that meaningfully influenced the project. These interactions illustrate responsible use of AI tools, our team's ability to critically evaluate AI output, and how suggestions were validated, adapted, or corrected.

---

## Session 1: Debugging Real-Time (WebSocket) Updates Failing on Multiple Replicas

### Prompt (sent to AI)

**To Claude Opus (first session):**

> Why sometime real-time update does not work, but sometimes it works?

> Think carefully and give me the reason.

**To a new Claude session (second attempt):**

> Why sometime real-time update does not work, but sometimes it works?

### AI Response (trimmed)

**Claude Opus (first session):**

```
Found the root cause — no heartbeat/ping-pong mechanism. The explanation was:

1. WebSocket connects and works fine.
2. The connection goes silently stale (TCP half-open) due to idle timeouts, network switches, laptop sleep/wake, etc.
3. The client thinks it's still connected (`readyState === 1`) but the underlying TCP connection is dead.
4. Server sends a broadcast — it silently fails because the socket is dead.
5. Eventually the OS detects the dead TCP connection and fires `onclose`.
6. Client reconnects and real-time works again.

Suggested fix: add ping/pong heartbeat on both server and client. Server pings every 25 seconds; if a client doesn't respond, it's terminated. Client detects missing pings and reconnects.
```

**New session (second attempt):**

```
Identified the actual root cause — `replicas: 2` in `docker-stack.yml` causes a split-brain problem:

- REST requests are load-balanced across any replica.
- WebSockets only connect to one specific replica.
- Broadcasting only occurs within the process's in-memory WebSocket map, so only connections on the replica that handled the HTTP request receive the event. Browsers connected to the other replica receive nothing.
- When both users happen to hit the same replica, it appears to work; otherwise it doesn't.

Proposed solution: use **Redis Pub/Sub** so that every replica hears broadcast events and pushes them to its own local WebSocket clients. Also suggested adding server-side WebSocket keep-alive pings and frontend automatic reconnection with exponential backoff.
```

### What Our Team Did With It

- **What was useful:** The second session correctly identified the core issue — that in a multi-replica Docker Swarm deployment, in-memory WebSocket broadcasting only reaches clients connected to the same replica that handled the HTTP request. The Redis Pub/Sub solution was the key insight that resolved the bug. 
>We also learned a valuable meta-lesson: if the AI seems stuck in an unproductive direction, opening a fresh session and re-stating the problem can yield a much better diagnosis.

- **What was incorrect or not applicable:** The first session's diagnosis (missing heartbeat/ping-pong) was plausible on the surface but did not address the core bug. Heartbeat keeps connections healthy, but the "sometimes works, sometimes doesn't" pattern was caused by request routing across replicas, not stale connections. We recognized the AI had gone down a wrong path, and all the code changes it suggested in that session were not applicable to our actual problem.

- **How we verified and adapted the suggestion:** We then implemented and tested the solution end-to-end:

  1. Added a `redis` service to `docker-stack.yml` / `docker-compose.yml`.
  2. Created `src/config/redis.js` — on startup, creates a Redis publisher and subscriber (duplicate connection). The subscriber uses `PSUBSCRIBE` on pattern `taskcloud:team:*`. Includes a retry loop (30 × 1 second) to handle Swarm service startup ordering.
  3. Modified `broadcastToTeam` in `src/websocket/index.js` — if a Redis publisher exists, it publishes to channel `taskcloud:team:<teamId>`. Each replica's subscriber receives the message and calls `deliverToLocalSockets`, which pushes to all WebSocket clients for that team on that replica. If Redis publish fails, it logs the error and still delivers to local sockets so one replica isn't totally silent. Without `REDIS_URL`, the code falls back to local-only broadcast (suitable for single-replica local development).
  4. Verified the full end-to-end flow: Browser opens WebSocket → user changes a task via REST → route handler updates PostgreSQL and calls `broadcastToTeam` → message published to Redis → every replica's subscriber pushes to local WebSocket clients → frontend receives the event and updates the UI without a manual refresh.
  5. Also added server-side WebSocket pings (every 30 seconds) and frontend auto-reconnect with exponential backoff and visibility/network-recovery listeners to improve resilience.

By doing these, we find our system works through mutiple tests. This is our first conformation.

However, we were not fully certain whether Redis Pub/Sub was a reasonable architectural choice, so we searched independently and confirmed it is a widely-used pattern for scaling WebSocket broadcasts across multiple processes/replicas. This is our second conformation.

Thus, we believe: live updates work via WebSocket push to browsers. Redis Pub/Sub is a solution for multi-replica setups so that every replica knows to push, not just the one that handled the HTTP request.
