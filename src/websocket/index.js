const WebSocket = require('ws');
const pool = require('../config/db');
const { verifyTokenFromString } = require('../middleware/auth');
const { initRedisPubSub, getPublisher } = require('../config/redis');

const TEAM_CHANNEL_PREFIX = 'taskcloud:team:';

/** @type {Map<number, Set<import('ws')>>} */
const teamSockets = new Map();

/** @type {WeakMap<import('ws'), Set<number>>} */
const socketTeams = new WeakMap();

function addSocketToTeam(teamId, ws) {
  if (!teamSockets.has(teamId)) {
    teamSockets.set(teamId, new Set());
  }
  teamSockets.get(teamId).add(ws);
  if (!socketTeams.has(ws)) {
    socketTeams.set(ws, new Set());
  }
  socketTeams.get(ws).add(teamId);
}

function removeSocketFromAllTeams(ws) {
  const teams = socketTeams.get(ws);
  if (!teams) return;
  for (const teamId of teams) {
    const set = teamSockets.get(teamId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) teamSockets.delete(teamId);
    }
  }
  socketTeams.delete(ws);
}

function deliverToLocalSockets(teamId, rawMessage) {
  const set = teamSockets.get(teamId);
  if (!set) return;
  for (const client of set) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(rawMessage);
    }
  }
}

/**
 * Broadcast a task event to all connections for the given team (all app replicas when Redis is enabled).
 */
function broadcastToTeam(teamId, payload) {
  const raw = JSON.stringify(payload);
  const pub = getPublisher();
  if (pub) {
    pub.publish(`${TEAM_CHANNEL_PREFIX}${teamId}`, raw).catch((err) => {
      console.error('Redis publish failed:', err.message);
      deliverToLocalSockets(teamId, raw);
    });
  } else {
    deliverToLocalSockets(teamId, raw);
  }
}

/**
 * @param {import('http').Server} server
 */
async function setupWebSocket(server) {
  await initRedisPubSub((teamId, rawMessage) => {
    deliverToLocalSockets(teamId, rawMessage);
  });

  const wss = new WebSocket.Server({ server, path: '/ws' });

  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(pingInterval));

  wss.on('connection', async (ws, req) => {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      ws.close(1008, 'Invalid URL');
      return;
    }

    const token = url.searchParams.get('token');
    if (!token) {
      ws.close(1008, 'Token required');
      return;
    }

    const decoded = verifyTokenFromString(token);
    if (!decoded || !decoded.id) {
      ws.close(1008, 'Invalid token');
      return;
    }

    try {
      const result = await pool.query(
        'SELECT team_id FROM team_memberships WHERE user_id = $1',
        [decoded.id]
      );
      if (result.rows.length === 0) {
        ws.close(1008, 'No team memberships');
        return;
      }
      for (const row of result.rows) {
        addSocketToTeam(row.team_id, ws);
      }
    } catch (err) {
      console.error('WebSocket team lookup error:', err.message);
      ws.close(1011, 'Server error');
      return;
    }

    ws.on('close', () => {
      removeSocketFromAllTeams(ws);
    });
    ws.on('error', () => {
      removeSocketFromAllTeams(ws);
    });
  });
}

module.exports = { setupWebSocket, broadcastToTeam };
