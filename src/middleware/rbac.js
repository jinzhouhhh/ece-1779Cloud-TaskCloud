const pool = require('../config/db');

async function getUserTeamRole(userId, teamId) {
  const result = await pool.query(
    'SELECT role FROM team_memberships WHERE user_id = $1 AND team_id = $2',
    [userId, teamId]
  );
  return result.rows.length > 0 ? result.rows[0].role : null;
}

function requireTeamRole(...allowedRoles) {
  return async (req, res, next) => {
    const teamId = req.params.teamId || req.params.id;
    if (!teamId) {
      return res.status(400).json({ error: 'Team ID required' });
    }

    const role = await getUserTeamRole(req.user.id, teamId);
    if (!role) {
      return res.status(403).json({ error: 'You are not a member of this team' });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    req.teamRole = role;
    next();
  };
}

function requireTeamMember() {
  return requireTeamRole('admin', 'member');
}

function requireTeamAdmin() {
  return requireTeamRole('admin');
}

async function requireProjectAccess(req, res, next) {
  const projectId = req.params.projectId || req.params.id;
  if (!projectId) {
    return res.status(400).json({ error: 'Project ID required' });
  }

  const result = await pool.query(
    `SELECT p.*, tm.role as team_role
     FROM projects p
     JOIN team_memberships tm ON tm.team_id = p.team_id AND tm.user_id = $1
     WHERE p.id = $2`,
    [req.user.id, projectId]
  );

  if (result.rows.length === 0) {
    return res.status(403).json({ error: 'No access to this project' });
  }

  req.project = result.rows[0];
  req.teamRole = result.rows[0].team_role;
  next();
}

module.exports = { requireTeamRole, requireTeamMember, requireTeamAdmin, requireProjectAccess, getUserTeamRole };
