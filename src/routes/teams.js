const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { requireTeamAdmin, requireTeamMember } = require('../middleware/rbac');

const router = express.Router();

router.post('/', authenticate, async (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Team name is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const teamResult = await client.query(
      'INSERT INTO teams (name, description, created_by) VALUES ($1, $2, $3) RETURNING *',
      [name, description || null, req.user.id]
    );
    const team = teamResult.rows[0];

    await client.query(
      'INSERT INTO team_memberships (user_id, team_id, role) VALUES ($1, $2, $3)',
      [req.user.id, team.id, 'admin']
    );

    await client.query('COMMIT');
    res.status(201).json(team);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create team error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, tm.role as my_role,
              (SELECT COUNT(*) FROM team_memberships WHERE team_id = t.id) as member_count
       FROM teams t
       JOIN team_memberships tm ON tm.team_id = t.id AND tm.user_id = $1
       ORDER BY t.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List teams error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', authenticate, requireTeamMember(), async (req, res) => {
  try {
    const teamResult = await pool.query('SELECT * FROM teams WHERE id = $1', [req.params.id]);
    if (teamResult.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const membersResult = await pool.query(
      `SELECT u.id, u.username, u.email, tm.role, tm.joined_at
       FROM team_memberships tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = $1
       ORDER BY tm.joined_at`,
      [req.params.id]
    );

    res.json({ ...teamResult.rows[0], members: membersResult.rows });
  } catch (err) {
    console.error('Get team error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', authenticate, requireTeamAdmin(), async (req, res) => {
  const { name, description } = req.body;
  try {
    const result = await pool.query(
      'UPDATE teams SET name = COALESCE($1, name), description = COALESCE($2, description), updated_at = NOW() WHERE id = $3 RETURNING *',
      [name, description, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update team error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authenticate, requireTeamAdmin(), async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM teams WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }
    res.json({ message: 'Team deleted' });
  } catch (err) {
    console.error('Delete team error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/members', authenticate, requireTeamAdmin(), async (req, res) => {
  const { email, role } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'User email is required' });
  }

  try {
    const userResult = await pool.query('SELECT id, username, email FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = userResult.rows[0].id;
    const memberRole = role === 'admin' ? 'admin' : 'member';

    await pool.query(
      'INSERT INTO team_memberships (user_id, team_id, role) VALUES ($1, $2, $3) ON CONFLICT (user_id, team_id) DO NOTHING',
      [userId, req.params.id, memberRole]
    );

    res.status(201).json({ message: 'Member added', user: userResult.rows[0], role: memberRole });
  } catch (err) {
    console.error('Add member error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id/members/:userId', authenticate, requireTeamAdmin(), async (req, res) => {
  try {
    if (parseInt(req.params.userId) === req.user.id) {
      return res.status(400).json({ error: 'Cannot remove yourself from the team' });
    }

    await pool.query(
      'DELETE FROM team_memberships WHERE user_id = $1 AND team_id = $2',
      [req.params.userId, req.params.id]
    );
    res.json({ message: 'Member removed' });
  } catch (err) {
    console.error('Remove member error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id/members/:userId/role', authenticate, requireTeamAdmin(), async (req, res) => {
  const { role } = req.body;
  if (!role || !['admin', 'member'].includes(role)) {
    return res.status(400).json({ error: 'Valid role (admin or member) is required' });
  }

  try {
    const result = await pool.query(
      'UPDATE team_memberships SET role = $1 WHERE user_id = $2 AND team_id = $3 RETURNING *',
      [role, req.params.userId, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Membership not found' });
    }
    res.json({ message: 'Role updated', role });
  } catch (err) {
    console.error('Update role error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
