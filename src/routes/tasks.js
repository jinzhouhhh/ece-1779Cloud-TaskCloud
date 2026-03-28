const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { requireProjectAccess } = require('../middleware/rbac');

const router = express.Router();

let broadcast = () => {};
function setBroadcast(fn) {
  broadcast = fn;
}

router.post('/projects/:projectId/tasks', authenticate, requireProjectAccess, async (req, res) => {
  const { title, description, status, priority, assigned_to, due_date } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Task title is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO tasks (title, description, status, priority, project_id, assigned_to, created_by, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        title,
        description || null,
        status || 'todo',
        priority || 'medium',
        req.params.projectId,
        assigned_to || null,
        req.user.id,
        due_date || null,
      ]
    );

    const task = result.rows[0];
    broadcast(req.project.team_id, { type: 'task:created', task });
    res.status(201).json(task);
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/projects/:projectId/tasks', authenticate, requireProjectAccess, async (req, res) => {
  const { status, priority, assigned_to, sort } = req.query;

  let query = `
    SELECT t.*, u.username as assignee_name, c.username as creator_name
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assigned_to
    LEFT JOIN users c ON c.id = t.created_by
    WHERE t.project_id = $1
  `;
  const params = [req.params.projectId];
  let paramIdx = 2;

  if (status) {
    query += ` AND t.status = $${paramIdx++}`;
    params.push(status);
  }
  if (priority) {
    query += ` AND t.priority = $${paramIdx++}`;
    params.push(priority);
  }
  if (assigned_to) {
    query += ` AND t.assigned_to = $${paramIdx++}`;
    params.push(assigned_to);
  }

  const sortOptions = {
    newest: 't.created_at DESC',
    oldest: 't.created_at ASC',
    priority: "CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END",
    due_date: 't.due_date ASC NULLS LAST',
  };
  query += ` ORDER BY ${sortOptions[sort] || sortOptions.newest}`;

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('List tasks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/tasks/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, u.username as assignee_name, c.username as creator_name, p.team_id
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assigned_to
       LEFT JOIN users c ON c.id = t.created_by
       JOIN projects p ON p.id = t.project_id
       JOIN team_memberships tm ON tm.team_id = p.team_id AND tm.user_id = $1
       WHERE t.id = $2`,
      [req.user.id, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found or no access' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get task error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/tasks/:id', authenticate, async (req, res) => {
  const { title, description, status, priority, assigned_to, due_date } = req.body;

  try {
    const accessCheck = await pool.query(
      `SELECT t.*, p.team_id, tm.role as team_role
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       JOIN team_memberships tm ON tm.team_id = p.team_id AND tm.user_id = $1
       WHERE t.id = $2`,
      [req.user.id, req.params.id]
    );

    if (accessCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found or no access' });
    }

    const result = await pool.query(
      `UPDATE tasks SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        status = COALESCE($3, status),
        priority = COALESCE($4, priority),
        assigned_to = COALESCE($5, assigned_to),
        due_date = COALESCE($6, due_date),
        updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [title, description, status, priority, assigned_to, due_date, req.params.id]
    );

    const task = result.rows[0];
    broadcast(accessCheck.rows[0].team_id, { type: 'task:updated', task });
    res.json(task);
  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/tasks/:id', authenticate, async (req, res) => {
  try {
    const accessCheck = await pool.query(
      `SELECT t.*, p.team_id, tm.role as team_role
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       JOIN team_memberships tm ON tm.team_id = p.team_id AND tm.user_id = $1
       WHERE t.id = $2`,
      [req.user.id, req.params.id]
    );

    if (accessCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found or no access' });
    }

    const existing = accessCheck.rows[0];
    if (existing.team_role !== 'admin' && existing.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Only admins or the task creator can delete tasks' });
    }

    await pool.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
    broadcast(existing.team_id, { type: 'task:deleted', taskId: parseInt(req.params.id) });
    res.json({ message: 'Task deleted' });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/search/tasks', authenticate, async (req, res) => {
  const { q, team_id } = req.query;
  if (!q) {
    return res.status(400).json({ error: 'Search query (q) is required' });
  }

  try {
    let query = `
      SELECT t.*, u.username as assignee_name, p.name as project_name, p.team_id, tm2.name as team_name
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assigned_to
      JOIN projects p ON p.id = t.project_id
      JOIN teams tm2 ON tm2.id = p.team_id
      JOIN team_memberships tm ON tm.team_id = p.team_id AND tm.user_id = $1
      WHERE to_tsvector('english', coalesce(t.title, '') || ' ' || coalesce(t.description, '')) @@ plainto_tsquery('english', $2)
    `;
    const params = [req.user.id, q];

    if (team_id) {
      query += ' AND p.team_id = $3';
      params.push(team_id);
    }

    query += ' ORDER BY t.updated_at DESC LIMIT 50';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Search tasks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
module.exports.setBroadcast = setBroadcast;
