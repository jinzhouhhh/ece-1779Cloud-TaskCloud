require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function initializeDatabase() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');

  try {
    await pool.query(schema);
    console.log('Database schema initialized successfully');
  } catch (err) {
    console.error('Failed to initialize database schema:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initializeDatabase();
