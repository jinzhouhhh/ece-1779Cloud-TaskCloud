(function () {
  const apiPrefix = '/api';

  let token = localStorage.getItem('taskcloud_token');
  let user = null;
  let teams = [];
  let selectedTeamId = null;
  let projects = [];
  let selectedProjectId = null;
  let selectedProjectTeamId = null;
  let currentTeamRole = null;
  let tasks = [];

  let ws = null;
  let wsReconnectTimer = null;
  let wsReconnectDelayMs = 1000;
  const WS_MAX_BACKOFF_MS = 30000;

  const $ = (id) => document.getElementById(id);

  function api(path, options = {}) {
    const headers = { ...options.headers };
    if (!headers['Content-Type'] && options.body && typeof options.body === 'string') {
      headers['Content-Type'] = 'application/json';
    }
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(apiPrefix + path, { ...options, headers }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || res.statusText || 'Request failed');
        err.status = res.status;
        throw err;
      }
      return data;
    });
  }

  function setWsStatus(state) {
    const el = $('ws-status');
    if (!el) return;
    el.classList.remove('connected', 'connecting', 'disconnected');
    el.classList.add(
      state === 'connected' ? 'connected' : state === 'connecting' ? 'connecting' : 'disconnected'
    );
    el.title =
      state === 'connected'
        ? 'Live updates connected'
        : state === 'connecting'
          ? 'Reconnecting…'
          : 'Live updates offline (will retry)';
  }

  function disconnectWebSocket() {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
    if (ws) {
      ws.onopen = ws.onclose = ws.onmessage = ws.onerror = null;
      try {
        ws.close();
      } catch (_) {
        /* ignore */
      }
      ws = null;
    }
    setWsStatus('disconnected');
  }

  function scheduleWebSocketReconnect() {
    if (!token) return;
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = setTimeout(() => {
      wsReconnectTimer = null;
      connectWebSocket();
    }, wsReconnectDelayMs);
    wsReconnectDelayMs = Math.min(wsReconnectDelayMs * 2, WS_MAX_BACKOFF_MS);
  }

  function connectWebSocket() {
    if (!token) return;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
    setWsStatus('connecting');

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
    try {
      ws = new WebSocket(url);
    } catch {
      setWsStatus('disconnected');
      scheduleWebSocketReconnect();
      return;
    }

    ws.onopen = () => {
      wsReconnectDelayMs = 1000;
      setWsStatus('connected');
      if (selectedProjectId) loadTasks();
    };

    ws.onclose = () => {
      ws = null;
      setWsStatus('disconnected');
      if (token) scheduleWebSocketReconnect();
    };

    ws.onerror = () => {
      try {
        ws.close();
      } catch (_) {
        /* ignore */
      }
    };

    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (!selectedProjectId) return;
      if (msg.type === 'task:deleted') {
        if (tasks.some((t) => Number(t.id) === Number(msg.taskId))) loadTasks();
        return;
      }
      if (msg.task && Number(msg.task.project_id) === Number(selectedProjectId)) {
        loadTasks();
      }
    };
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && token) {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        wsReconnectDelayMs = 1000;
        connectWebSocket();
      }
    }
  });

  window.addEventListener('online', () => {
    wsReconnectDelayMs = 1000;
    if (token) connectWebSocket();
  });

  function showView(name) {
    $('auth-view').classList.toggle('hidden', name !== 'auth');
    $('main-view').classList.toggle('hidden', name !== 'main');
  }

  function showAuthError(text) {
    const el = $('auth-error');
    el.textContent = text;
    el.classList.remove('hidden');
  }

  function hideAuthError() {
    $('auth-error').classList.add('hidden');
  }

  async function handleLogin(e) {
    e.preventDefault();
    hideAuthError();
    const email = $('login-email').value.trim();
    const password = $('login-password').value;
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      token = data.token;
      user = data.user;
      localStorage.setItem('taskcloud_token', token);
      await enterApp();
    } catch (err) {
      showAuthError(err.message);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    hideAuthError();
    const username = $('register-username').value.trim();
    const email = $('register-email').value.trim();
    const password = $('register-password').value;
    try {
      const data = await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, username, password }),
      });
      token = data.token;
      user = data.user;
      localStorage.setItem('taskcloud_token', token);
      await enterApp();
    } catch (err) {
      showAuthError(err.message);
    }
  }

  function logout() {
    token = null;
    user = null;
    localStorage.removeItem('taskcloud_token');
    disconnectWebSocket();
    selectedTeamId = null;
    selectedProjectId = null;
    showView('auth');
  }

  async function enterApp() {
    showView('main');
    $('user-display').textContent = user.username;
    await loadTeams();
    connectWebSocket();
  }

  async function loadTeams() {
    teams = await api('/teams');
    renderTeamList();
  }

  function renderTeamList() {
    const ul = $('team-list');
    ul.innerHTML = '';
    teams.forEach((t) => {
      const li = document.createElement('li');
      li.textContent = t.name;
      if (Number(t.id) === Number(selectedTeamId)) li.classList.add('active');
      li.addEventListener('click', () => selectTeam(t.id));
      ul.appendChild(li);
    });
  }

  async function selectTeam(teamId) {
    selectedTeamId = teamId;
    selectedProjectId = null;
    selectedProjectTeamId = null;
    projects = [];
    renderTeamList();
    renderProjectList();
    hideAllPanels();
    const team = teams.find((x) => Number(x.id) === Number(teamId));
    currentTeamRole = team ? team.my_role : null;
    try {
      const detail = await api(`/teams/${teamId}`);
      $('team-detail-name').textContent = detail.name;
      $('team-detail-desc').textContent = detail.description || '';
      $('team-detail-role').textContent = currentTeamRole || '';
      $('team-detail-role').className = `badge badge-${currentTeamRole === 'admin' ? 'admin' : 'member'}`;
      const memUl = $('team-members-list');
      memUl.innerHTML = '';
      (detail.members || []).forEach((m) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${escapeHtml(m.username)}</span><span class="badge badge-${m.role === 'admin' ? 'admin' : 'member'}">${m.role}</span>`;
        memUl.appendChild(li);
      });
      const isAdmin = currentTeamRole === 'admin';
      $('add-member-form').classList.toggle('hidden', !isAdmin);
      $('team-detail').classList.remove('hidden');
      projects = await api(`/teams/${teamId}/projects`);
      renderProjectList();
    } catch (err) {
      console.error(err);
    }
  }

  function renderProjectList() {
    const ul = $('project-list');
    ul.innerHTML = '';
    projects.forEach((p) => {
      const li = document.createElement('li');
      li.textContent = p.name;
      if (Number(p.id) === Number(selectedProjectId)) li.classList.add('active');
      li.addEventListener('click', () => selectProject(p.id, p.team_id));
      ul.appendChild(li);
    });
  }

  async function selectProject(projectId, teamId) {
    selectedProjectId = projectId;
    selectedProjectTeamId = teamId || selectedTeamId;
    renderProjectList();
    hideAllPanels();
    $('task-board').classList.remove('hidden');
    try {
      const proj = await api(`/projects/${projectId}`);
      $('project-title').textContent = proj.name;
      const isAdmin = proj.team_role === 'admin';
      $('edit-project-btn').classList.toggle('hidden', !isAdmin);
      $('delete-project-btn').classList.toggle('hidden', !isAdmin);
      await loadTasks();
    } catch (err) {
      console.error(err);
    }
  }

  function hideAllPanels() {
    ['welcome-panel', 'team-detail', 'task-board', 'search-results'].forEach((id) => {
      $(id).classList.add('hidden');
    });
  }

  async function loadTasks() {
    if (!selectedProjectId) return;
    tasks = await api(`/projects/${selectedProjectId}/tasks`);
    renderBoard();
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function renderBoard() {
    ['col-todo', 'col-in-progress', 'col-done'].forEach((id) => {
      $(id).innerHTML = '';
    });
    const colMap = { todo: 'col-todo', in_progress: 'col-in-progress', done: 'col-done' };
    tasks.forEach((task) => {
      const colId = colMap[task.status] || 'col-todo';
      const card = document.createElement('div');
      card.className = `task-card priority-${task.priority || 'medium'}`;
      card.innerHTML = `
        <div class="task-card-title">${escapeHtml(task.title)}</div>
        <div class="task-card-meta">
          <span>${task.assignee_name || 'Unassigned'}</span>
          <span>${task.priority || ''}</span>
        </div>
        <div class="task-card-actions">
          <button type="button" class="btn btn-sm btn-outline" data-act="edit">Edit</button>
          <button type="button" class="btn btn-sm btn-outline" data-act="move-todo">To Do</button>
          <button type="button" class="btn btn-sm btn-outline" data-act="move-ip">In Progress</button>
          <button type="button" class="btn btn-sm btn-outline" data-act="move-done">Done</button>
        </div>`;
      card.querySelector('[data-act="edit"]').addEventListener('click', (e) => {
        e.stopPropagation();
        openTaskModal(task);
      });
      card.querySelector('[data-act="move-todo"]').addEventListener('click', (e) => {
        e.stopPropagation();
        moveTask(task.id, 'todo');
      });
      card.querySelector('[data-act="move-ip"]').addEventListener('click', (e) => {
        e.stopPropagation();
        moveTask(task.id, 'in_progress');
      });
      card.querySelector('[data-act="move-done"]').addEventListener('click', (e) => {
        e.stopPropagation();
        moveTask(task.id, 'done');
      });
      $(colId).appendChild(card);
    });
  }

  async function moveTask(taskId, status) {
    try {
      await api(`/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      await loadTasks();
    } catch (err) {
      alert(err.message);
    }
  }

  function openModal(html) {
    $('modal-content').innerHTML = html;
    $('modal-overlay').classList.remove('hidden');
  }

  function closeModal() {
    $('modal-overlay').classList.add('hidden');
    $('modal-content').innerHTML = '';
  }

  function openTaskModal(task) {
    openModal(`
      <h3>Edit task</h3>
      <form id="task-edit-form">
        <div class="form-group"><label>Title</label><input name="title" required></div>
        <div class="form-group"><label>Description</label><textarea name="description"></textarea></div>
        <div class="form-group"><label>Status</label>
          <select name="status">
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
          </select>
        </div>
        <div class="form-group"><label>Priority</label>
          <select name="priority">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" id="modal-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>`);
    const form = $('task-edit-form');
    form.querySelector('[name="title"]').value = task.title;
    form.querySelector('[name="description"]').value = task.description || '';
    form.querySelector('[name="status"]').value = task.status;
    form.querySelector('[name="priority"]').value = task.priority || 'medium';
    $('modal-cancel').addEventListener('click', closeModal);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      try {
        await api(`/tasks/${task.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            title: fd.get('title'),
            description: fd.get('description') || null,
            status: fd.get('status'),
            priority: fd.get('priority'),
          }),
        });
        closeModal();
        await loadTasks();
      } catch (err) {
        alert(err.message);
      }
    });
  }

  $('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });

  $('create-team-btn').addEventListener('click', () => {
    openModal(`
      <h3>New team</h3>
      <form id="team-form">
        <div class="form-group"><label>Name</label><input name="name" required></div>
        <div class="form-group"><label>Description</label><textarea name="description"></textarea></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" id="modal-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">Create</button>
        </div>
      </form>`);
    $('modal-cancel').addEventListener('click', closeModal);
    $('team-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api('/teams', {
          method: 'POST',
          body: JSON.stringify({ name: fd.get('name'), description: fd.get('description') || null }),
        });
        closeModal();
        await loadTeams();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  $('create-project-btn').addEventListener('click', () => {
    if (!selectedTeamId) {
      alert('Select a team first');
      return;
    }
    openModal(`
      <h3>New project</h3>
      <form id="project-form">
        <div class="form-group"><label>Name</label><input name="name" required></div>
        <div class="form-group"><label>Description</label><textarea name="description"></textarea></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" id="modal-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">Create</button>
        </div>
      </form>`);
    $('modal-cancel').addEventListener('click', closeModal);
    $('project-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api(`/teams/${selectedTeamId}/projects`, {
          method: 'POST',
          body: JSON.stringify({ name: fd.get('name'), description: fd.get('description') || null }),
        });
        closeModal();
        await selectTeam(selectedTeamId);
      } catch (err) {
        alert(err.message);
      }
    });
  });

  $('create-task-btn').addEventListener('click', () => {
    if (!selectedProjectId) return;
    openModal(`
      <h3>New task</h3>
      <form id="task-create-form">
        <div class="form-group"><label>Title</label><input name="title" required></div>
        <div class="form-group"><label>Description</label><textarea name="description"></textarea></div>
        <div class="form-group"><label>Priority</label>
          <select name="priority">
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="high">High</option>
          </select>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" id="modal-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">Create</button>
        </div>
      </form>`);
    $('modal-cancel').addEventListener('click', closeModal);
    $('task-create-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api(`/projects/${selectedProjectId}/tasks`, {
          method: 'POST',
          body: JSON.stringify({
            title: fd.get('title'),
            description: fd.get('description') || null,
            priority: fd.get('priority'),
          }),
        });
        closeModal();
        await loadTasks();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  $('edit-project-btn').addEventListener('click', async () => {
    if (!selectedProjectId) return;
    const proj = await api(`/projects/${selectedProjectId}`);
    openModal(`
      <h3>Edit project</h3>
      <form id="project-edit-form">
        <div class="form-group"><label>Name</label><input name="name" required></div>
        <div class="form-group"><label>Description</label><textarea name="description"></textarea></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" id="modal-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>`);
    const pform = $('project-edit-form');
    pform.querySelector('[name="name"]').value = proj.name;
    pform.querySelector('[name="description"]').value = proj.description || '';
    $('modal-cancel').addEventListener('click', closeModal);
    pform.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(pform);
      try {
        await api(`/projects/${selectedProjectId}`, {
          method: 'PUT',
          body: JSON.stringify({ name: fd.get('name'), description: fd.get('description') || null }),
        });
        closeModal();
        $('project-title').textContent = fd.get('name');
        await selectTeam(selectedTeamId);
      } catch (err) {
        alert(err.message);
      }
    });
  });

  $('delete-project-btn').addEventListener('click', async () => {
    if (!selectedProjectId || !confirm('Delete this project and all tasks?')) return;
    try {
      await api(`/projects/${selectedProjectId}`, { method: 'DELETE' });
      selectedProjectId = null;
      await selectTeam(selectedTeamId);
      hideAllPanels();
      $('team-detail').classList.remove('hidden');
    } catch (err) {
      alert(err.message);
    }
  });

  $('add-member-submit').addEventListener('click', async () => {
    const email = $('add-member-email').value.trim();
    const role = $('add-member-role').value;
    if (!email || !selectedTeamId) return;
    try {
      await api(`/teams/${selectedTeamId}/members`, {
        method: 'POST',
        body: JSON.stringify({ email, role }),
      });
      $('add-member-email').value = '';
      await selectTeam(selectedTeamId);
    } catch (err) {
      alert(err.message);
    }
  });

  $('search-btn').addEventListener('click', runSearch);
  $('search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runSearch();
  });

  async function runSearch() {
    const q = $('search-input').value.trim();
    if (!q) return;
    try {
      const results = await api(`/search/tasks?q=${encodeURIComponent(q)}`);
      hideAllPanels();
      $('search-results').classList.remove('hidden');
      const list = $('search-results-list');
      list.innerHTML = '';
      results.forEach((t) => {
        const div = document.createElement('div');
        div.className = 'search-result-item';
        div.innerHTML = `<h4>${escapeHtml(t.title)}</h4><p>${escapeHtml(t.team_name)} / ${escapeHtml(t.project_name)}</p>`;
        div.addEventListener('click', async () => {
          selectedTeamId = t.team_id || selectedTeamId;
          await selectProject(t.project_id, t.team_id);
          $('search-results').classList.add('hidden');
        });
        list.appendChild(div);
      });
    } catch (err) {
      alert(err.message);
    }
  }

  $('close-search').addEventListener('click', () => {
    $('search-results').classList.add('hidden');
    if (selectedProjectId) $('task-board').classList.remove('hidden');
    else if (selectedTeamId) $('team-detail').classList.remove('hidden');
    else $('welcome-panel').classList.remove('hidden');
  });

  document.querySelectorAll('.auth-tabs .tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tabs .tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const name = tab.dataset.tab;
      $('login-form').classList.toggle('hidden', name !== 'login');
      $('register-form').classList.toggle('hidden', name !== 'register');
      hideAuthError();
    });
  });

  $('login-form').addEventListener('submit', handleLogin);
  $('register-form').addEventListener('submit', handleRegister);
  $('logout-btn').addEventListener('click', logout);

  async function boot() {
    if (!token) {
      showView('auth');
      return;
    }
    try {
      const data = await api('/auth/me');
      user = data.user;
      await enterApp();
    } catch {
      token = null;
      localStorage.removeItem('taskcloud_token');
      showView('auth');
    }
  }

  boot();
})();
