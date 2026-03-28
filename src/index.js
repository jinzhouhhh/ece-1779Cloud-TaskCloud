require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');

// Docker Swarm secrets support: read *_FILE env vars
for (const key of ['DB_PASSWORD', 'JWT_SECRET']) {
  const fileKey = `${key}_FILE`;
  if (process.env[fileKey]) {
    try {
      process.env[key] = fs.readFileSync(process.env[fileKey], 'utf-8').trim();
    } catch (err) {
      console.warn(`Could not read secret file ${process.env[fileKey]}:`, err.message);
    }
  }
}

const app = require('./app');
const pool = require('./config/db');
const { setupWebSocket, broadcastToTeam } = require('./websocket');
const taskRoutes = require('./routes/tasks');

taskRoutes.setBroadcast(broadcastToTeam);

const server = http.createServer(app);

async function initSchema() {
  const schemaPath = path.join(__dirname, 'config', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  try {
    await pool.query(schema);
    console.log('Database schema initialized');
  } catch (err) {
    console.error('Schema init warning:', err.message);
  }
}

const PORT = parseInt(process.env.PORT, 10) || 3000;

async function start() {
  await initSchema();
  await setupWebSocket(server);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`TaskCloud server running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
