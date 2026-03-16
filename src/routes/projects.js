const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { requireTeamMember, requireTeamAdmin, requireProjectAccess } = require('../middleware/rbac');

const router = express.Router();

router.post('/teams/:teamId/projects', authenticate, requireTeamMember(), async (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Project name is required' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO projects (name, description, team_id, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, description || null, req.params.teamId, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/teams/:teamId/projects', authenticate, requireTeamMember(), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.username as creator_name,
              (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count
       FROM projects p
       LEFT JOIN users u ON u.id = p.created_by
       WHERE p.team_id = $1
       ORDER BY p.created_at DESC`,
      [req.params.teamId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List projects error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/projects/:id', authenticate, requireProjectAccess, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.username as creator_name, t.name as team_name
       FROM projects p
       LEFT JOIN users u ON u.id = p.created_by
       LEFT JOIN teams t ON t.id = p.team_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/projects/:id', authenticate, requireProjectAccess, async (req, res) => {
  if (req.teamRole !== 'admin') {
    return res.status(403).json({ error: 'Only team admins can update projects' });
  }

  const { name, description } = req.body;
  try {
    const result = await pool.query(
      'UPDATE projects SET name = COALESCE($1, name), description = COALESCE($2, description), updated_at = NOW() WHERE id = $3 RETURNING *',
      [name, description, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/projects/:id', authenticate, requireProjectAccess, async (req, res) => {
  if (req.teamRole !== 'admin') {
    return res.status(403).json({ error: 'Only team admins can delete projects' });
  }

  try {
    await pool.query('DELETE FROM projects WHERE id = $1', [req.params.id]);
    res.json({ message: 'Project deleted' });
  } catch (err) {
    console.error('Delete project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
