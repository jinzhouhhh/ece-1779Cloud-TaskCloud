require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

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

const pool = require('./config/db');
const { setupWebSocket, broadcastToTeam } = require('./websocket');

const authRoutes = require('./routes/auth');
const teamRoutes = require('./routes/teams');
const projectRoutes = require('./routes/projects');
const taskRoutes = require('./routes/tasks');

// Wire the WebSocket broadcast into the task routes
taskRoutes.setBroadcast(broadcastToTeam);

const app = express();
const server = http.createServer(app);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(morgan('short'));

app.use(express.static(path.join(__dirname, '..', 'public')));

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', message: 'Database unreachable' });
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api', projectRoutes);
app.use('/api', taskRoutes);

// SPA fallback
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, '..', 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// Initialize DB schema on startup
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
  setupWebSocket(server);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`TaskCloud server running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
