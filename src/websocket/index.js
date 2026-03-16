const { WebSocketServer } = require('ws');
const { verifyTokenFromString } = require('../middleware/auth');
const pool = require('../config/db');

// Map of teamId -> Set of WebSocket clients
const teamClients = new Map();

function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Authentication required');
      return;
    }

    const decoded = verifyTokenFromString(token);
    if (!decoded) {
      ws.close(4001, 'Invalid token');
      return;
    }

    ws.userId = decoded.id;
    ws.username = decoded.username;

    // Fetch all teams the user belongs to and subscribe them
    try {
      const result = await pool.query(
        'SELECT team_id FROM team_memberships WHERE user_id = $1',
        [decoded.id]
      );

      ws.teamIds = result.rows.map((r) => r.team_id);

      for (const teamId of ws.teamIds) {
        if (!teamClients.has(teamId)) {
          teamClients.set(teamId, new Set());
        }
        teamClients.get(teamId).add(ws);
      }

      ws.send(JSON.stringify({
        type: 'connected',
        message: `Connected as ${decoded.username}`,
        teams: ws.teamIds,
      }));
    } catch (err) {
      console.error('WebSocket setup error:', err);
      ws.close(4500, 'Server error');
      return;
    }

    ws.on('close', () => {
      if (ws.teamIds) {
        for (const teamId of ws.teamIds) {
          const clients = teamClients.get(teamId);
          if (clients) {
            clients.delete(ws);
            if (clients.size === 0) {
              teamClients.delete(teamId);
            }
          }
        }
      }
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err.message);
    });
  });

  console.log('WebSocket server ready on /ws');
  return wss;
}

function broadcastToTeam(teamId, message) {
  const clients = teamClients.get(teamId);
  if (!clients) return;

  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
}

module.exports = { setupWebSocket, broadcastToTeam };
