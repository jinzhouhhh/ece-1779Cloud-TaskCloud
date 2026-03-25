/* ── State ── */
let token = localStorage.getItem('token');
let currentUser = null;
let ws = null;
let selectedTeamId = null;
let selectedProjectId = null;
let currentTeamRole = null;
let teams = [];
let projects = [];

/* ── API Helpers ── */
const API = '';

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/* ── DOM Helpers ── */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const show = (el) => el.classList.remove('hidden');
const hide = (el) => el.classList.add('hidden');

/* ── Auth ── */
$$('.auth-tabs .tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    $$('.auth-tabs .tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    if (tab.dataset.tab === 'login') {
      show($('#login-form'));
      hide($('#register-form'));
    } else {
      hide($('#login-form'));
      show($('#register-form'));
    }
    hide($('#auth-error'));
  });
});

function showAuthError(msg) {
  const el = $('#auth-error');
  el.textContent = msg;
  show(el);
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: $('#login-email').value,
        password: $('#login-password').value,
      }),
    });
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('token', token);
    enterApp();
  } catch (err) {
    showAuthError(err.message);
  }
});

$('#register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const data = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: $('#register-username').value,
        email: $('#register-email').value,
        password: $('#register-password').value,
      }),
    });
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('token', token);
    enterApp();
  } catch (err) {
    showAuthError(err.message);
  }
});

$('#logout-btn').addEventListener('click', () => {
  token = null;
  currentUser = null;
  localStorage.removeItem('token');
  if (ws) ws.close();
  hide($('#main-view'));
  show($('#auth-view'));
});

/* ── App Entry ── */
async function enterApp() {
  try {
    currentUser = (await api('/api/auth/me')).user;
  } catch {
    localStorage.removeItem('token');
    token = null;
    return;
  }
  hide($('#auth-view'));
  show($('#main-view'));
  $('#user-display').textContent = currentUser.username;
  connectWS();
  loadTeams();
  showPanel('welcome');
}

/* ── WebSocket ── */
function connectWS() {
  if (ws) ws.close();
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws?token=${token}`);

  ws.onopen = () => {
    $('#ws-status').className = 'ws-indicator connected';
    $('#ws-status').title = 'Real-time connected';
  };

  ws.onclose = () => {
    $('#ws-status').className = 'ws-indicator disconnected';
    $('#ws-status').title = 'Disconnected — will reconnect';
    setTimeout(connectWS, 3000);
  };

  ws.onmessage = (evt) => {
    const msg = JSON.parse(evt.data);
    handleWSMessage(msg);
  };
}

function handleWSMessage(msg) {
  if (!selectedProjectId) return;
  if (msg.type === 'task:created' || msg.type === 'task:updated') {
    if (msg.task.project_id === selectedProjectId) loadTasks();
  }
  if (msg.type === 'task:deleted') loadTasks();
}

/* ── Panel Management ── */
function showPanel(name) {
  ['welcome-panel', 'team-detail', 'task-board', 'search-results'].forEach((id) => hide($(`#${id}`)));
  if (name === 'welcome') show($('#welcome-panel'));
  if (name === 'team') show($('#team-detail'));
  if (name === 'board') show($('#task-board'));
  if (name === 'search') show($('#search-results'));
}

/* ── Teams ── */
async function loadTeams() {
  try {
    teams = await api('/api/teams');
    renderTeams();
  } catch (err) {
    console.error('Failed to load teams:', err);
  }
}

function renderTeams() {
  const ul = $('#team-list');
  ul.innerHTML = teams
    .map(
      (t) =>
        `<li data-id="${t.id}" class="${t.id === selectedTeamId ? 'active' : ''}">${t.name}</li>`
    )
    .join('');

  ul.querySelectorAll('li').forEach((li) => {
    li.addEventListener('click', () => selectTeam(parseInt(li.dataset.id)));
  });
}

async function selectTeam(id) {
  selectedTeamId = id;
  selectedProjectId = null;
  renderTeams();
  try {
    const team = await api(`/api/teams/${id}`);
    $('#team-detail-name').textContent = team.name;
    $('#team-detail-desc').textContent = team.description || 'No description';
    const myMembership = team.members.find((m) => m.id === currentUser.id);
    const role = myMembership ? myMembership.role : 'member';
    currentTeamRole = role;
    const roleEl = $('#team-detail-role');
    roleEl.textContent = role;
    roleEl.className = `badge badge-${role}`;

    const membersList = $('#team-members-list');
    membersList.innerHTML = team.members
      .map(
        (m) => {
          const removeBtn = (role === 'admin' && m.id !== currentUser.id)
            ? `<button class="btn btn-sm btn-danger remove-member-btn" data-user-id="${m.id}">Remove</button> `
            : '';
          return `<li><span>${m.username} (${m.email})</span> <span>${removeBtn}<span class="badge badge-${m.role}">${m.role}</span></span></li>`;
        }
      )
      .join('');

    membersList.querySelectorAll('.remove-member-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remove this member from the team?')) return;
        try {
          await api(`/api/teams/${id}/members/${btn.dataset.userId}`, { method: 'DELETE' });
          selectTeam(id);
        } catch (err) {
          alert(err.message);
        }
      });
    });

    if (role === 'admin') show($('#add-member-form'));
    else hide($('#add-member-form'));

    showPanel('team');
    loadProjects(id);
  } catch (err) {
    console.error('Failed to load team:', err);
  }
}

$('#create-team-btn').addEventListener('click', () => {
  openModal(
    'Create Team',
    `<div class="form-group"><label>Name</label><input id="m-team-name" required></div>
     <div class="form-group"><label>Description</label><textarea id="m-team-desc"></textarea></div>`,
    async () => {
      const name = $('#m-team-name').value;
      if (!name) return;
      await api('/api/teams', {
        method: 'POST',
        body: JSON.stringify({ name, description: $('#m-team-desc').value }),
      });
      closeModal();
      loadTeams();
    }
  );
});

$('#add-member-submit').addEventListener('click', async () => {
  const email = $('#add-member-email').value;
  const role = $('#add-member-role').value;
  if (!email || !selectedTeamId) return;
  try {
    await api(`/api/teams/${selectedTeamId}/members`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    });
    $('#add-member-email').value = '';
    selectTeam(selectedTeamId);
  } catch (err) {
    alert(err.message);
  }
});

/* ── Projects ── */
async function loadProjects(teamId) {
  try {
    projects = await api(`/api/teams/${teamId}/projects`);
    renderProjects();
  } catch (err) {
    console.error('Failed to load projects:', err);
  }
}

function renderProjects() {
  const ul = $('#project-list');
  ul.innerHTML = projects
    .map(
      (p) =>
        `<li data-id="${p.id}" class="${p.id === selectedProjectId ? 'active' : ''}">${p.name} <span style="opacity:.5;font-size:11px">(${p.task_count})</span></li>`
    )
    .join('');

  ul.querySelectorAll('li').forEach((li) => {
    li.addEventListener('click', () => selectProject(parseInt(li.dataset.id)));
  });
}

async function selectProject(id) {
  selectedProjectId = id;
  renderProjects();
  const proj = projects.find((p) => p.id === id);
  if (proj) $('#project-title').textContent = proj.name;

  if (currentTeamRole === 'admin') {
    show($('#edit-project-btn'));
    show($('#delete-project-btn'));
  } else {
    hide($('#edit-project-btn'));
    hide($('#delete-project-btn'));
  }

  showPanel('board');
  loadTasks();
}

$('#create-project-btn').addEventListener('click', () => {
  if (!selectedTeamId) return alert('Select a team first');
  openModal(
    'Create Project',
    `<div class="form-group"><label>Name</label><input id="m-proj-name" required></div>
     <div class="form-group"><label>Description</label><textarea id="m-proj-desc"></textarea></div>`,
    async () => {
      const name = $('#m-proj-name').value;
      if (!name) return;
      await api(`/api/teams/${selectedTeamId}/projects`, {
        method: 'POST',
        body: JSON.stringify({ name, description: $('#m-proj-desc').value }),
      });
      closeModal();
      loadProjects(selectedTeamId);
    }
  );
});

$('#edit-project-btn').addEventListener('click', () => {
  if (!selectedProjectId) return;
  const proj = projects.find((p) => p.id === selectedProjectId);
  if (!proj) return;
  openModal(
    'Edit Project',
    `<div class="form-group"><label>Name</label><input id="m-proj-name" value="${escapeAttr(proj.name)}"></div>
     <div class="form-group"><label>Description</label><textarea id="m-proj-desc">${escapeHtml(proj.description || '')}</textarea></div>`,
    async () => {
      await api(`/api/projects/${selectedProjectId}`, {
        method: 'PUT',
        body: JSON.stringify({ name: $('#m-proj-name').value, description: $('#m-proj-desc').value }),
      });
      closeModal();
      loadProjects(selectedTeamId);
      $('#project-title').textContent = $('#m-proj-name').value;
    }
  );
});

$('#delete-project-btn').addEventListener('click', async () => {
  if (!selectedProjectId) return;
  const proj = projects.find((p) => p.id === selectedProjectId);
  if (!confirm(`Delete project "${proj ? proj.name : ''}" and all its tasks? This cannot be undone.`)) return;
  try {
    await api(`/api/projects/${selectedProjectId}`, { method: 'DELETE' });
    selectedProjectId = null;
    loadProjects(selectedTeamId);
    showPanel('team');
  } catch (err) {
    alert(err.message);
  }
});

/* ── Tasks ── */
async function loadTasks() {
  if (!selectedProjectId) return;
  try {
    const tasks = await api(`/api/projects/${selectedProjectId}/tasks`);
    renderBoard(tasks);
  } catch (err) {
    console.error('Failed to load tasks:', err);
  }
}

function renderBoard(tasks) {
  const cols = { todo: [], in_progress: [], done: [] };
  tasks.forEach((t) => {
    if (cols[t.status]) cols[t.status].push(t);
  });

  for (const [status, items] of Object.entries(cols)) {
    const container = $(`#col-${status.replace('_', '-')}`);
    container.innerHTML = items.map((t) => taskCardHTML(t)).join('');
    container.querySelectorAll('.task-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn')) return;
        openTaskDetail(parseInt(card.dataset.id));
      });
    });
    container.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => handleTaskAction(btn));
    });
  }
}

function taskCardHTML(t) {
  const statusMoves = {
    todo: [['in_progress', 'Start']],
    in_progress: [['todo', 'Back'], ['done', 'Done']],
    done: [['in_progress', 'Reopen']],
  };
  const actions = (statusMoves[t.status] || [])
    .map(([s, label]) => `<button class="btn btn-sm" data-action="move" data-task-id="${t.id}" data-status="${s}">${label}</button>`)
    .join('');

  return `
    <div class="task-card priority-${t.priority}" data-id="${t.id}">
      <div class="task-card-title">${escapeHtml(t.title)}</div>
      <div class="task-card-meta">
        <span>${t.assignee_name || 'Unassigned'}</span>
        <span>${t.priority}</span>
      </div>
      <div class="task-card-actions">${actions}
        <button class="btn btn-sm btn-danger" data-action="delete" data-task-id="${t.id}">Del</button>
      </div>
    </div>`;
}

async function handleTaskAction(btn) {
  const action = btn.dataset.action;
  const taskId = btn.dataset.taskId;

  if (action === 'move') {
    await api(`/api/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: btn.dataset.status }),
    });
    loadTasks();
  }
  if (action === 'delete') {
    if (!confirm('Delete this task?')) return;
    await api(`/api/tasks/${taskId}`, { method: 'DELETE' });
    loadTasks();
  }
}

async function openTaskDetail(taskId) {
  try {
    const t = await api(`/api/tasks/${taskId}`);
    openModal(
      'Edit Task',
      `<div class="form-group"><label>Title</label><input id="m-task-title" value="${escapeAttr(t.title)}"></div>
       <div class="form-group"><label>Description</label><textarea id="m-task-desc">${escapeHtml(t.description || '')}</textarea></div>
       <div class="form-group"><label>Status</label>
         <select id="m-task-status">
           <option value="todo" ${t.status === 'todo' ? 'selected' : ''}>To Do</option>
           <option value="in_progress" ${t.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
           <option value="done" ${t.status === 'done' ? 'selected' : ''}>Done</option>
         </select></div>
       <div class="form-group"><label>Priority</label>
         <select id="m-task-priority">
           <option value="low" ${t.priority === 'low' ? 'selected' : ''}>Low</option>
           <option value="medium" ${t.priority === 'medium' ? 'selected' : ''}>Medium</option>
           <option value="high" ${t.priority === 'high' ? 'selected' : ''}>High</option>
         </select></div>
       <div class="form-group"><label>Due Date</label>
         <input type="date" id="m-task-due" value="${t.due_date ? t.due_date.split('T')[0] : ''}"></div>`,
      async () => {
        await api(`/api/tasks/${taskId}`, {
          method: 'PUT',
          body: JSON.stringify({
            title: $('#m-task-title').value,
            description: $('#m-task-desc').value,
            status: $('#m-task-status').value,
            priority: $('#m-task-priority').value,
            due_date: $('#m-task-due').value || null,
          }),
        });
        closeModal();
        loadTasks();
      }
    );
  } catch (err) {
    alert(err.message);
  }
}

$('#create-task-btn').addEventListener('click', () => {
  if (!selectedProjectId) return;
  openModal(
    'New Task',
    `<div class="form-group"><label>Title</label><input id="m-task-title" required></div>
     <div class="form-group"><label>Description</label><textarea id="m-task-desc"></textarea></div>
     <div class="form-group"><label>Priority</label>
       <select id="m-task-priority">
         <option value="low">Low</option>
         <option value="medium" selected>Medium</option>
         <option value="high">High</option>
       </select></div>
     <div class="form-group"><label>Due Date</label><input type="date" id="m-task-due"></div>`,
    async () => {
      const title = $('#m-task-title').value;
      if (!title) return;
      await api(`/api/projects/${selectedProjectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          title,
          description: $('#m-task-desc').value,
          priority: $('#m-task-priority').value,
          due_date: $('#m-task-due').value || null,
        }),
      });
      closeModal();
      loadTasks();
    }
  );
});

/* ── Search ── */
$('#search-btn').addEventListener('click', doSearch);
$('#search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doSearch();
});

async function doSearch() {
  const q = $('#search-input').value.trim();
  if (!q) return;
  try {
    const results = await api(`/api/search/tasks?q=${encodeURIComponent(q)}`);
    const container = $('#search-results-list');
    if (results.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No tasks found.</p></div>';
    } else {
      container.innerHTML = results
        .map(
          (t) =>
            `<div class="search-result-item">
              <h4>${escapeHtml(t.title)}</h4>
              <p>${escapeHtml(t.description || '')} &mdash; ${t.project_name} / ${t.team_name} &mdash; ${t.status}</p>
            </div>`
        )
        .join('');
    }
    showPanel('search');
  } catch (err) {
    alert(err.message);
  }
}

$('#close-search').addEventListener('click', () => {
  showPanel('welcome');
});

/* ── Modal ── */
function openModal(title, bodyHTML, onSubmit) {
  const modal = $('#modal-content');
  modal.innerHTML = `
    <h3>${title}</h3>
    ${bodyHTML}
    <div class="modal-actions">
      <button class="btn btn-outline" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary" id="modal-submit">Save</button>
    </div>`;
  show($('#modal-overlay'));
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#modal-submit').addEventListener('click', async () => {
    try {
      await onSubmit();
    } catch (err) {
      alert(err.message);
    }
  });
}

function closeModal() {
  hide($('#modal-overlay'));
}

$('#modal-overlay').addEventListener('click', (e) => {
  if (e.target === $('#modal-overlay')) closeModal();
});

/* ── Utilities ── */
function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function escapeAttr(s) {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── Init ── */
if (token) {
  enterApp();
} else {
  show($('#auth-view'));
  hide($('#main-view'));
}
