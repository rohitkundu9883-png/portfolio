/**
 * =========================================================
 * ADMIN DASHBOARD - CLIENT APPLICATION LOGIC
 * =========================================================
 */

(function () {
  'use strict';

  // Global State
  let token = localStorage.getItem('admin_portfolio_token') || '';
  let portfolioData = null;
  let messagesData = [];
  let pendingDeleteAction = null;

  // Broadcast Channel for live zero-latency cross-tab synchronization
  const syncChannel = 'BroadcastChannel' in window ? new BroadcastChannel('portfolio_sync_channel') : null;

  // Global Helpers exposed for inline onclicks
  window.switchTab = switchTab;
  window.openModal = openModal;
  window.closeModal = closeModal;

  document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    initTabNavigation();
    initForms();
    initUploaders();
    initSettings();
    initRealtimeListener();
  });

  // API URL resolver supporting direct node server (port 3000), relative paths, and dev servers (like Live Server port 5500)
  function getApiUrl(endpoint) {
    const clean = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
    if (typeof window !== 'undefined' && window.location) {
      if (window.location.protocol === 'file:') {
        return `http://localhost:3000${clean}`;
      }
      if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
        if (window.location.port !== '3000' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
          return `http://localhost:3000${clean}`;
        }
      }
    }
    return clean;
  }

  function assetUrl(url) {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
    if (url.startsWith('./')) return url;
    if (url.startsWith('/')) return '.' + url;
    return './' + url;
  }

  // ==================== AUTHENTICATION ====================
  async function initAuth() {
    const loginOverlay = document.getElementById('login-overlay');
    const loginForm = document.getElementById('login-form');
    const logoutBtn = document.getElementById('btn-logout');

    // Clean up any old static demo token that causes fake saves
    if (token && token.startsWith('static_demo_token')) {
      token = '';
      localStorage.removeItem('admin_portfolio_token');
    }

    if (token) {
      // Verify token with backend
      try {
        const res = await fetch(getApiUrl('/api/auth/verify'), {
          headers: { 'Authorization': `Bearer ${token}` }
        }).catch(() => null);
        const data = res && res.ok ? await res.json() : null;
        if (data && data.authenticated) {
          loginOverlay.style.display = 'none';
          loadDashboardData();
        } else {
          showLoginOverlay();
        }
      } catch (e) {
        showLoginOverlay();
      }
    } else {
      showLoginOverlay();
    }

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = document.getElementById('login-username').value.trim();
      const p = document.getElementById('login-password').value.trim();

      const btn = document.getElementById('login-btn');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';

      try {
        let res = await fetch(getApiUrl('/api/auth/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u, password: p })
        }).catch(() => null);

        let data = res && res.ok ? await res.json() : null;

        if (!data || !data.token) {
          throw new Error('Invalid credentials or backend server unreachable at http://localhost:3000');
        }

        token = data.token;
        localStorage.setItem('admin_portfolio_token', token);
        const userEl = document.getElementById('sidebar-admin-username');
        if (userEl && data.user) userEl.textContent = data.user.username;
        loginOverlay.style.display = 'none';
        showToast('Signed in successfully!', 'success');
        loadDashboardData();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In to Dashboard';
      }
    });

    logoutBtn.addEventListener('click', () => {
      token = '';
      localStorage.removeItem('admin_portfolio_token');
      showLoginOverlay();
      showToast('Logged out', 'info');
    });
  }

  function showLoginOverlay() {
    const overlay = document.getElementById('login-overlay');
    if (overlay) overlay.style.display = 'flex';
  }

  // Auth fetch wrapper with real error reporting and no fake mocks
  async function authFetch(url, options = {}) {
    options.headers = options.headers || {};
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const fullUrl = getApiUrl(url);
    let res = null;
    try {
      res = await fetch(fullUrl, options);
    } catch (err) {
      console.error('Fetch connection error for ' + fullUrl, err);
      throw new Error('Cannot connect to backend server. Ensure node server.js is running on http://localhost:3000');
    }

    if (res.status === 401) {
      token = '';
      localStorage.removeItem('admin_portfolio_token');
      showLoginOverlay();
      throw new Error('Admin session expired. Please sign in again.');
    }

    if (!res.ok) {
      let errMsg = `Server request failed with status ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson && errJson.error) errMsg = errJson.error;
      } catch (e) {}
      throw new Error(errMsg);
    }

    return res;
  }

  // ==================== LOAD ALL DASHBOARD DATA ====================
  async function loadDashboardData() {
    try {
      let pRes = await fetch(getApiUrl('/api/portfolio?_t=' + Date.now()), { cache: 'no-store' }).catch(() => null);
      if (!pRes || !pRes.ok) {
        pRes = await fetch('./data/portfolio.json?_t=' + Date.now(), { cache: 'no-store' }).catch(() => null);
        if (!pRes || !pRes.ok) {
          pRes = await fetch('data/portfolio.json?_t=' + Date.now(), { cache: 'no-store' }).catch(() => null);
        }
      }

      if (pRes && pRes.ok) {
        portfolioData = await pRes.json();
      } else if (typeof window !== 'undefined' && window.__INITIAL_PORTFOLIO_DATA__) {
        portfolioData = window.__INITIAL_PORTFOLIO_DATA__;
      }

      if (!portfolioData) {
        throw new Error('Portfolio data could not be fetched.');
      }
      
      let mRes = await authFetch('./api/messages').catch(() => null);
      if (mRes && mRes.ok) {
        try {
          const resJson = await mRes.json();
          messagesData = Array.isArray(resJson) ? resJson : [];
        } catch(e) {
          messagesData = [];
        }
      } else {
        messagesData = [];
      }

      updateOverviewCounters();
      populateHomeSection();
      populateAboutSection();
      renderSkillsTable();
      renderProjectsCards();
      renderCertsCards();
      renderResumeSection();
      populateContactSection();
      renderMessagesInbox();
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      showToast('Error fetching portfolio data', 'error');
    }
  }

  // ==================== OVERVIEW COUNTERS ====================
  function updateOverviewCounters() {
    if (!portfolioData) return;

    const totalProjects = portfolioData.projects && Array.isArray(portfolioData.projects) ? portfolioData.projects.length : 0;
    const totalSkills = portfolioData.skills && Array.isArray(portfolioData.skills) ? portfolioData.skills.length : 0;
    const totalCerts = portfolioData.certificates && Array.isArray(portfolioData.certificates) ? portfolioData.certificates.length : 0;
    const msgList = Array.isArray(messagesData) ? messagesData : [];
    const totalMessages = msgList.length;
    const unreadMessages = msgList.filter(m => !m.read).length;

    const elProjects = document.getElementById('stat-total-projects');
    if (elProjects) elProjects.textContent = totalProjects;
    const elSkills = document.getElementById('stat-total-skills');
    if (elSkills) elSkills.textContent = totalSkills;
    const elCerts = document.getElementById('stat-total-certs');
    if (elCerts) elCerts.textContent = totalCerts;
    const elMsgs = document.getElementById('stat-total-messages');
    if (elMsgs) elMsgs.textContent = totalMessages;

    const bSkills = document.getElementById('skills-count-badge');
    if (bSkills) bSkills.textContent = totalSkills;
    const bProjects = document.getElementById('projects-count-badge');
    if (bProjects) bProjects.textContent = totalProjects;
    const bCerts = document.getElementById('certs-count-badge');
    if (bCerts) bCerts.textContent = totalCerts;
    const bMsgs = document.getElementById('messages-count-badge');
    if (bMsgs) bMsgs.textContent = unreadMessages;
  }

  // ==================== SECTION: HOME / HERO ====================
  function populateHomeSection() {
    const h = portfolioData.home || {};
    document.getElementById('home-name').value = h.name || '';
    document.getElementById('home-title').value = h.title || '';
    document.getElementById('home-tagline').value = h.tagline || '';
    document.getElementById('home-statusBadge').value = h.statusBadge || '';
    document.getElementById('home-ctaPrimaryText').value = h.ctaPrimaryText || '';
    document.getElementById('home-ctaPrimaryLink').value = h.ctaPrimaryLink || '';
    document.getElementById('home-ctaSecondaryText').value = h.ctaSecondaryText || '';
    document.getElementById('home-ctaSecondaryLink').value = h.ctaSecondaryLink || '';
    document.getElementById('home-resumeLink').value = h.resumeLink || '';
    document.getElementById('home-avatar').value = h.avatar || '';
    document.getElementById('home-avatar-preview').src = h.avatar || './uploads/avatar.jpg';

    // Stats bar inputs
    const statsContainer = document.getElementById('home-stats-inputs');
    const stats = h.stats || [
      { label: 'Years Experience', value: '6+' },
      { label: 'Projects Shipped', value: '45+' },
      { label: 'Client Satisfaction', value: '99.8%' },
      { label: 'Code Commits', value: '3,400+' }
    ];

    statsContainer.innerHTML = stats.map((st, i) => `
      <div style="background: var(--admin-bg-input); padding: 0.85rem; border-radius: var(--admin-radius-sm); border: 1px solid var(--admin-border);">
        <label class="admin-label" style="font-size: 0.75rem;">Stat #${i + 1} Value</label>
        <input type="text" class="admin-input stat-input-val" data-idx="${i}" value="${escapeHtml(st.value)}" style="margin-bottom: 0.4rem;">
        <label class="admin-label" style="font-size: 0.75rem;">Label</label>
        <input type="text" class="admin-input stat-input-lbl" data-idx="${i}" value="${escapeHtml(st.label)}">
      </div>
    `).join('');
  }

  // ==================== SECTION: ABOUT ME ====================
  function populateAboutSection() {
    const ab = portfolioData.about || {};
    document.getElementById('about-heading').value = ab.heading || '';
    document.getElementById('about-subheading').value = ab.subheading || '';
    document.getElementById('about-bio').value = (ab.bioParagraphs || []).join('\n\n');

    renderAboutHighlights(ab.highlights || []);
    renderAboutPersonalInfo(ab.personalInfo || []);
  }

  function renderAboutHighlights(highlights) {
    const list = document.getElementById('about-highlights-list');
    list.innerHTML = highlights.map((hl, i) => `
      <div class="admin-item-card" data-idx="${i}" style="padding: 1rem;">
        <div style="display: grid; grid-template-columns: 80px 1fr 1fr auto; gap: 0.75rem; align-items: center;">
          <div>
            <label class="admin-label" style="font-size: 0.72rem;">Icon</label>
            <input type="text" class="admin-input hl-icon" value="${escapeHtml(hl.icon || '🚀')}">
          </div>
          <div>
            <label class="admin-label" style="font-size: 0.72rem;">Title</label>
            <input type="text" class="admin-input hl-title" value="${escapeHtml(hl.title || '')}">
          </div>
          <div>
            <label class="admin-label" style="font-size: 0.72rem;">Description</label>
            <input type="text" class="admin-input hl-desc" value="${escapeHtml(hl.desc || '')}">
          </div>
          <button type="button" class="admin-btn admin-btn-danger admin-btn-sm" style="margin-top: 1.2rem;" onclick="removeHighlight(${i})">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `).join('');
  }

  window.removeHighlight = function (idx) {
    if (portfolioData.about && portfolioData.about.highlights) {
      portfolioData.about.highlights.splice(idx, 1);
      renderAboutHighlights(portfolioData.about.highlights);
    }
  };

  function renderAboutPersonalInfo(personalInfo) {
    const list = document.getElementById('about-personal-info-list');
    list.innerHTML = personalInfo.map((pi, i) => `
      <div style="background: var(--admin-bg-input); padding: 0.85rem; border-radius: var(--admin-radius-sm); border: 1px solid var(--admin-border);">
        <label class="admin-label" style="font-size: 0.72rem;">Label</label>
        <input type="text" class="admin-input pi-label" data-idx="${i}" value="${escapeHtml(pi.label)}" style="margin-bottom: 0.4rem;">
        <label class="admin-label" style="font-size: 0.72rem;">Value</label>
        <input type="text" class="admin-input pi-val" data-idx="${i}" value="${escapeHtml(pi.value)}">
      </div>
    `).join('');
  }

  // ==================== SECTION: SKILLS ====================
  function renderSkillsTable() {
    const skills = portfolioData.skills || [];
    const tbody = document.getElementById('skills-table-body');

    tbody.innerHTML = skills.map(s => `
      <tr>
        <td style="font-size: 1.4rem;">${escapeHtml(s.icon || '⚡')}</td>
        <td><strong>${escapeHtml(s.name)}</strong></td>
        <td><span style="font-family: var(--admin-font-mono); font-size: 0.8rem; padding: 0.2rem 0.5rem; background: rgba(99,102,241,0.15); border-radius: 4px; color: #a5b4fc;">${escapeHtml(s.category)}</span></td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="width: 100px; height: 6px; background: rgba(255,255,255,0.1); border-radius: 99px; overflow: hidden;">
              <div style="width: ${s.level}%; height: 100%; background: var(--admin-primary);"></div>
            </div>
            <span style="font-size: 0.82rem; font-family: var(--admin-font-mono);">${s.level}%</span>
          </div>
        </td>
        <td style="color: var(--admin-text-muted); font-size: 0.85rem;">${escapeHtml(s.experience || '-')}</td>
        <td style="text-align: right;">
          <button class="admin-btn admin-btn-secondary admin-btn-sm" onclick="openEditSkillModal('${escapeHtml(s.id)}')">
            <i class="fa-solid fa-pen-to-square"></i> Edit
          </button>
          <button class="admin-btn admin-btn-danger admin-btn-sm" onclick="confirmDeleteItem('skill', '${escapeHtml(s.id)}', '${escapeHtml(s.name)}')">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');
  }

  window.openEditSkillModal = function (id) {
    const skill = (portfolioData.skills || []).find(s => s.id === id);
    if (!skill) return;

    document.getElementById('modal-skill-title').textContent = 'Edit Skill';
    document.getElementById('modal-skill-id').value = skill.id;
    document.getElementById('modal-skill-name').value = skill.name;
    document.getElementById('modal-skill-category').value = skill.category;
    document.getElementById('modal-skill-level').value = skill.level;
    document.getElementById('modal-skill-icon').value = skill.icon || '⚡';
    document.getElementById('modal-skill-exp').value = skill.experience || '';

    openModal('modal-skill');
  };

  // ==================== SECTION: PROJECTS ====================
  function renderProjectsCards() {
    const projects = portfolioData.projects || [];
    const container = document.getElementById('projects-cards-container');

    container.innerHTML = projects.map(p => `
      <div class="admin-item-card">
        <div style="height: 160px; border-radius: var(--admin-radius-sm); overflow: hidden; position: relative;">
          <img src="${escapeHtml(p.image || './uploads/project_saas.jpg')}" alt="${escapeHtml(p.title)}" style="width: 100%; height: 100%; object-fit: cover;">
          ${p.featured ? '<span style="position: absolute; top: 8px; left: 8px; background: var(--admin-primary); padding: 0.2rem 0.6rem; border-radius: 99px; font-size: 0.72rem; font-weight: 700; color: #fff;"><i class="fa-solid fa-star"></i> Featured</span>' : ''}
          <span style="position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.7); padding: 0.2rem 0.6rem; border-radius: 99px; font-size: 0.72rem; font-family: var(--admin-font-mono); color: #38bdf8;">${escapeHtml(p.category)}</span>
        </div>

        <div>
          <h4 style="font-size: 1.15rem; margin-bottom: 0.35rem;">${escapeHtml(p.title)}</h4>
          <p style="color: var(--admin-text-muted); font-size: 0.85rem; line-height: 1.5; margin-bottom: 0.5rem;">${escapeHtml(p.shortDesc)}</p>
          ${p.metrics ? `<div style="font-size: 0.78rem; color: #34d399; font-family: var(--admin-font-mono); margin-bottom: 0.5rem;"><i class="fa-solid fa-chart-line"></i> ${escapeHtml(p.metrics)}</div>` : ''}
        </div>

        <div class="item-card-actions">
          <button class="admin-btn admin-btn-secondary admin-btn-sm" onclick="openEditProjectModal('${escapeHtml(p.id)}')">
            <i class="fa-solid fa-pen-to-square"></i> Edit
          </button>
          <button class="admin-btn admin-btn-danger admin-btn-sm" onclick="confirmDeleteItem('project', '${escapeHtml(p.id)}', '${escapeHtml(p.title)}')">
            <i class="fa-solid fa-trash"></i> Delete
          </button>
        </div>
      </div>
    `).join('');
  }

  window.openEditProjectModal = function (id) {
    const proj = (portfolioData.projects || []).find(p => p.id === id);
    if (!proj) return;

    document.getElementById('modal-project-title').textContent = 'Edit Project';
    document.getElementById('modal-project-id').value = proj.id;
    document.getElementById('modal-project-name').value = proj.title;
    document.getElementById('modal-project-category').value = proj.category;
    document.getElementById('modal-project-metrics').value = proj.metrics || '';
    document.getElementById('modal-project-shortDesc').value = proj.shortDesc || '';
    document.getElementById('modal-project-fullDesc').value = proj.fullDesc || '';
    document.getElementById('modal-project-liveUrl').value = proj.liveUrl || '';
    document.getElementById('modal-project-githubUrl').value = proj.githubUrl || '';
    document.getElementById('modal-project-tags').value = (proj.tags || []).join(', ');
    document.getElementById('modal-project-image').value = proj.image || '';
    document.getElementById('modal-project-img-preview').src = proj.image || './uploads/project_saas.jpg';
    document.getElementById('modal-project-featured').checked = Boolean(proj.featured);

    openModal('modal-project');
  };

  // ==================== SECTION: CERTIFICATES ====================
  function renderCertsCards() {
    const certs = portfolioData.certificates || [];
    const container = document.getElementById('certs-cards-container');

    container.innerHTML = certs.map(c => `
      <div class="admin-item-card">
        <div style="display: flex; gap: 1rem; align-items: center;">
          <div style="width: 55px; height: 55px; border-radius: 50%; overflow: hidden; flex-shrink: 0; border: 2px solid #f59e0b;">
            <img src="${escapeHtml(c.image || './uploads/cert_cloud.jpg')}" alt="Badge" style="width: 100%; height: 100%; object-fit: cover;">
          </div>
          <div>
            <h4 style="font-size: 1.05rem; margin-bottom: 0.2rem;">${escapeHtml(c.title)}</h4>
            <div style="font-size: 0.85rem; color: #38bdf8;">${escapeHtml(c.issuer)}</div>
          </div>
        </div>

        <div style="font-size: 0.8rem; color: var(--admin-text-muted); font-family: var(--admin-font-mono);">
          <div>Issued: ${escapeHtml(c.issueDate)}</div>
          ${c.credentialId ? `<div>ID: ${escapeHtml(c.credentialId)}</div>` : ''}
        </div>

        <div class="item-card-actions">
          <button class="admin-btn admin-btn-secondary admin-btn-sm" onclick="openEditCertModal('${escapeHtml(c.id)}')">
            <i class="fa-solid fa-pen-to-square"></i> Edit
          </button>
          <button class="admin-btn admin-btn-danger admin-btn-sm" onclick="confirmDeleteItem('certificate', '${escapeHtml(c.id)}', '${escapeHtml(c.title)}')">
            <i class="fa-solid fa-trash"></i> Delete
          </button>
        </div>
      </div>
    `).join('');
  }

  window.openEditCertModal = function (id) {
    const cert = (portfolioData.certificates || []).find(c => c.id === id);
    if (!cert) return;

    document.getElementById('modal-cert-title').textContent = 'Edit Certificate';
    document.getElementById('modal-cert-id').value = cert.id;
    document.getElementById('modal-cert-name').value = cert.title;
    document.getElementById('modal-cert-issuer').value = cert.issuer;
    document.getElementById('modal-cert-date').value = cert.issueDate || '';
    document.getElementById('modal-cert-credId').value = cert.credentialId || '';
    document.getElementById('modal-cert-url').value = cert.credentialUrl || '';
    document.getElementById('modal-cert-image').value = cert.image || '';
    document.getElementById('modal-cert-img-preview').src = cert.image || './uploads/cert_cloud.jpg';

    openModal('modal-cert');
  };

  // ==================== SECTION: RESUME ====================
  function renderResumeSection() {
    const r = portfolioData.resume || { experience: [], education: [] };

    document.getElementById('resume-summary-input').value = r.summary || '';
    document.getElementById('resume-download-url-input').value = r.downloadUrl || '';

    // Experience Items
    const expContainer = document.getElementById('experience-list-container');
    expContainer.innerHTML = (r.experience || []).map(e => `
      <div class="admin-item-card">
        <div class="item-card-top">
          <div>
            <h4 style="font-size: 1.1rem;">${escapeHtml(e.role)}</h4>
            <div style="font-size: 0.88rem; color: #38bdf8;">${escapeHtml(e.company)}${e.location ? ' • ' + escapeHtml(e.location) : ''}</div>
          </div>
          <span style="font-family: var(--admin-font-mono); font-size: 0.8rem; background: rgba(99,102,241,0.15); padding: 0.2rem 0.6rem; border-radius: 99px; color: #a5b4fc;">
            ${escapeHtml(e.period)}
          </span>
        </div>
        ${e.description ? `<p style="font-size: 0.85rem; color: var(--admin-text-muted);">${escapeHtml(e.description)}</p>` : ''}
        <div class="item-card-actions">
          <button class="admin-btn admin-btn-secondary admin-btn-sm" onclick="openEditExperienceModal('${escapeHtml(e.id)}')">
            <i class="fa-solid fa-pen-to-square"></i> Edit
          </button>
          <button class="admin-btn admin-btn-danger admin-btn-sm" onclick="confirmDeleteItem('experience', '${escapeHtml(e.id)}', '${escapeHtml(e.role)}')">
            <i class="fa-solid fa-trash"></i> Delete
          </button>
        </div>
      </div>
    `).join('');

    // Education Items
    const eduContainer = document.getElementById('education-list-container');
    eduContainer.innerHTML = (r.education || []).map(ed => `
      <div class="admin-item-card">
        <div class="item-card-top">
          <div>
            <h4 style="font-size: 1.1rem;">${escapeHtml(ed.degree)}</h4>
            <div style="font-size: 0.88rem; color: #38bdf8;">${escapeHtml(ed.institution)}</div>
          </div>
          <span style="font-family: var(--admin-font-mono); font-size: 0.8rem; background: rgba(99,102,241,0.15); padding: 0.2rem 0.6rem; border-radius: 99px; color: #a5b4fc;">
            ${escapeHtml(ed.period)}
          </span>
        </div>
        ${ed.details ? `<p style="font-size: 0.85rem; color: var(--admin-text-muted);">${escapeHtml(ed.details)}</p>` : ''}
        <div class="item-card-actions">
          <button class="admin-btn admin-btn-secondary admin-btn-sm" onclick="openEditEducationModal('${escapeHtml(ed.id)}')">
            <i class="fa-solid fa-pen-to-square"></i> Edit
          </button>
          <button class="admin-btn admin-btn-danger admin-btn-sm" onclick="confirmDeleteItem('education', '${escapeHtml(ed.id)}', '${escapeHtml(ed.degree)}')">
            <i class="fa-solid fa-trash"></i> Delete
          </button>
        </div>
      </div>
    `).join('');
  }

  window.openEditExperienceModal = function (id) {
    const exp = (portfolioData.resume.experience || []).find(e => e.id === id);
    if (!exp) return;

    document.getElementById('modal-exp-title').textContent = 'Edit Experience';
    document.getElementById('modal-exp-id').value = exp.id;
    document.getElementById('modal-exp-role').value = exp.role;
    document.getElementById('modal-exp-company').value = exp.company;
    document.getElementById('modal-exp-location').value = exp.location || '';
    document.getElementById('modal-exp-period').value = exp.period;
    document.getElementById('modal-exp-desc').value = exp.description || '';
    document.getElementById('modal-exp-achievements').value = (exp.achievements || []).join('\n');

    openModal('modal-experience');
  };

  window.openEditEducationModal = function (id) {
    const edu = (portfolioData.resume.education || []).find(ed => ed.id === id);
    if (!edu) return;

    document.getElementById('modal-edu-title').textContent = 'Edit Education';
    document.getElementById('modal-edu-id').value = edu.id;
    document.getElementById('modal-edu-degree').value = edu.degree;
    document.getElementById('modal-edu-institution').value = edu.institution;
    document.getElementById('modal-edu-period').value = edu.period;
    document.getElementById('modal-edu-details').value = edu.details || '';

    openModal('modal-education');
  };

  // ==================== SECTION: CONTACT & SOCIALS ====================
  function populateContactSection() {
    const c = portfolioData.contact || {};
    document.getElementById('contact-email').value = c.email || '';
    document.getElementById('contact-phone').value = c.phone || '';
    document.getElementById('contact-location').value = c.location || '';
    document.getElementById('contact-responseTime').value = c.responseTime || '';

    const list = document.getElementById('contact-socials-list');
    const socials = c.socials || [
      { platform: 'GitHub', url: 'https://github.com', username: '@alexrivera-dev' },
      { platform: 'LinkedIn', url: 'https://linkedin.com', username: 'in/alexrivera-tech' },
      { platform: 'Twitter', url: 'https://twitter.com', username: '@alexrivera_ai' },
      { platform: 'Discord', url: 'https://discord.com', username: 'alexrivera#0001' }
    ];

    list.innerHTML = socials.map((s, i) => `
      <div style="display: grid; grid-template-columns: 140px 1fr 1fr; gap: 0.75rem; background: var(--admin-bg-input); padding: 0.85rem; border-radius: var(--admin-radius-sm); border: 1px solid var(--admin-border);">
        <div>
          <label class="admin-label" style="font-size: 0.72rem;">Platform</label>
          <input type="text" class="admin-input soc-platform" data-idx="${i}" value="${escapeHtml(s.platform)}">
        </div>
        <div>
          <label class="admin-label" style="font-size: 0.72rem;">URL Link</label>
          <input type="url" class="admin-input soc-url" data-idx="${i}" value="${escapeHtml(s.url)}">
        </div>
        <div>
          <label class="admin-label" style="font-size: 0.72rem;">Handle / Username</label>
          <input type="text" class="admin-input soc-user" data-idx="${i}" value="${escapeHtml(s.username || '')}">
        </div>
      </div>
    `).join('');
  }

  // ==================== SECTION: MESSAGES INBOX ====================
  function renderMessagesInbox() {
    const container = document.getElementById('messages-container');
    if (!messagesData || messagesData.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: var(--admin-text-muted);">
          <i class="fa-regular fa-envelope-open" style="font-size: 2.5rem; margin-bottom: 1rem; color: var(--admin-text-dim);"></i>
          <p>No messages received yet. Inquiries from the portfolio contact form will appear here in real-time!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = messagesData.map(m => {
      const dateStr = new Date(m.createdAt).toLocaleString();
      return `
        <div class="message-item-card ${m.read ? '' : 'unread'}" id="msg-card-${escapeHtml(m.id)}">
          <div class="message-header">
            <div class="message-sender">
              <i class="fa-solid fa-circle" style="font-size: 0.6rem; color: ${m.read ? 'var(--admin-text-dim)' : 'var(--admin-primary)'};"></i>
              <span class="sender-name">${escapeHtml(m.name)}</span>
              <a href="mailto:${escapeHtml(m.email)}?subject=Re: ${encodeURIComponent(m.subject || 'Inquiry')}" class="sender-email">
                <i class="fa-regular fa-envelope"></i> ${escapeHtml(m.email)}
              </a>
            </div>
            <div class="message-date">${dateStr}</div>
          </div>

          <div style="font-weight: 600; font-size: 0.95rem; color: var(--admin-text-main);">
            Subject: ${escapeHtml(m.subject || 'General Inquiry')}
          </div>

          <div class="message-body">${escapeHtml(m.message)}</div>

          <div style="display: flex; gap: 0.75rem; margin-top: 0.5rem;">
            ${!m.read ? `
              <button class="admin-btn admin-btn-secondary admin-btn-sm" onclick="markMessageRead('${escapeHtml(m.id)}')">
                <i class="fa-solid fa-check"></i> Mark Read
              </button>
            ` : ''}
            <a href="mailto:${escapeHtml(m.email)}?subject=Re: ${encodeURIComponent(m.subject || 'Inquiry')}" class="admin-btn admin-btn-primary admin-btn-sm">
              <i class="fa-solid fa-reply"></i> Reply via Email
            </a>
            <button class="admin-btn admin-btn-danger admin-btn-sm" onclick="deleteMessage('${escapeHtml(m.id)}')">
              <i class="fa-solid fa-trash"></i> Delete
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  window.markMessageRead = async function (id) {
    try {
      const res = await authFetch(`/api/messages/${id}/read`, { method: 'PATCH' });
      if (res.ok) {
        const msg = messagesData.find(m => m.id === id);
        if (msg) msg.read = true;
        renderMessagesInbox();
        updateOverviewCounters();
      }
    } catch (e) {
      showToast('Error marking message as read', 'error');
    }
  };

  window.deleteMessage = async function (id) {
    try {
      const res = await authFetch(`/api/messages/${id}`, { method: 'DELETE' });
      if (res.ok) {
        messagesData = messagesData.filter(m => m.id !== id);
        renderMessagesInbox();
        updateOverviewCounters();
        showToast('Message deleted', 'success');
      }
    } catch (e) {
      showToast('Error deleting message', 'error');
    }
  };

  // ==================== DELETE CONFIRMATION HANDLER ====================
  function confirmDeleteItem(type, id, name) {
    pendingDeleteAction = { type, id };
    const prompt = document.getElementById('modal-delete-prompt');
    prompt.textContent = `Are you sure you want to permanently delete "${name}"? This action will immediately update the live portfolio.`;
    openModal('modal-delete');
  }
  window.confirmDeleteItem = confirmDeleteItem;

  document.getElementById('btn-confirm-delete').addEventListener('click', async () => {
    if (!pendingDeleteAction) return;
    const { type, id } = pendingDeleteAction;

    try {
      let endpoint = '';
      if (type === 'skill') endpoint = `/api/skills/${id}`;
      else if (type === 'project') endpoint = `/api/projects/${id}`;
      else if (type === 'certificate') endpoint = `/api/certificates/${id}`;
      else if (type === 'experience') endpoint = `/api/resume/experience/${id}`;
      else if (type === 'education') endpoint = `/api/resume/education/${id}`;

      const res = await authFetch(endpoint, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete item');

      showToast(`Deleted ${type} successfully!`, 'success');
      closeModal('modal-delete');
      pendingDeleteAction = null;
      notifyLiveSync();
      await loadDashboardData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // ==================== FORM SUBMISSIONS & SAVING ====================
  function initForms() {
    // 1. SAVE HOME / HERO
    document.getElementById('btn-save-home').addEventListener('click', async () => {
      const saveBtn = document.getElementById('btn-save-home');
      const origText = saveBtn.innerHTML;
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

      try {
        const avatarFileInput = document.getElementById('home-avatar-file');
        let avatarUrl = document.getElementById('home-avatar').value.trim();

        if (avatarFileInput && avatarFileInput.files && avatarFileInput.files[0]) {
          saveBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up fa-spin"></i> Uploading avatar...';
          const uploaded = await uploadFile(avatarFileInput.files[0]);
          if (uploaded) {
            avatarUrl = uploaded;
            document.getElementById('home-avatar').value = uploaded;
            document.getElementById('home-avatar-preview').src = uploaded;
          }
        }

        const statInputsVal = document.querySelectorAll('.stat-input-val');
        const statInputsLbl = document.querySelectorAll('.stat-input-lbl');
        const stats = [];
        statInputsVal.forEach((vInput, i) => {
          stats.push({
            value: vInput.value.trim(),
            label: statInputsLbl[i] ? statInputsLbl[i].value.trim() : ''
          });
        });

        const body = {
          name: document.getElementById('home-name').value.trim(),
          title: document.getElementById('home-title').value.trim(),
          tagline: document.getElementById('home-tagline').value.trim(),
          statusBadge: document.getElementById('home-statusBadge').value.trim(),
          ctaPrimaryText: document.getElementById('home-ctaPrimaryText').value.trim(),
          ctaPrimaryLink: document.getElementById('home-ctaPrimaryLink').value.trim(),
          ctaSecondaryText: document.getElementById('home-ctaSecondaryText').value.trim(),
          ctaSecondaryLink: document.getElementById('home-ctaSecondaryLink').value.trim(),
          resumeLink: document.getElementById('home-resumeLink').value.trim(),
          avatar: avatarUrl,
          stats
        };

        const res = await authFetch('/api/home', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error('Failed to save home section');
        showToast('Home section updated and synced live!', 'success');
        notifyLiveSync();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = origText;
      }
    });

    // 2. SAVE ABOUT ME
    document.getElementById('btn-save-about').addEventListener('click', async () => {
      const bioText = document.getElementById('about-bio').value.trim();
      const bioParagraphs = bioText.split('\n\n').map(p => p.trim()).filter(Boolean);

      // Collect highlights
      const hlCards = document.querySelectorAll('#about-highlights-list .admin-item-card');
      const highlights = [];
      hlCards.forEach(card => {
        highlights.push({
          id: 'hl_' + Date.now() + Math.random().toString(36).substr(2, 4),
          icon: card.querySelector('.hl-icon').value.trim(),
          title: card.querySelector('.hl-title').value.trim(),
          desc: card.querySelector('.hl-desc').value.trim()
        });
      });

      // Collect personal info
      const piLabels = document.querySelectorAll('.pi-label');
      const piVals = document.querySelectorAll('.pi-val');
      const personalInfo = [];
      piLabels.forEach((lbl, i) => {
        personalInfo.push({
          label: lbl.value.trim(),
          value: piVals[i] ? piVals[i].value.trim() : ''
        });
      });

      const body = {
        heading: document.getElementById('about-heading').value.trim(),
        subheading: document.getElementById('about-subheading').value.trim(),
        bioParagraphs,
        highlights,
        personalInfo
      };

      try {
        const res = await authFetch('/api/about', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error('Failed to save about section');
        showToast('About Me updated and synced live!', 'success');
        notifyLiveSync();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // Add Highlight Card
    document.getElementById('btn-add-highlight').addEventListener('click', () => {
      if (!portfolioData.about) portfolioData.about = {};
      if (!portfolioData.about.highlights) portfolioData.about.highlights = [];
      portfolioData.about.highlights.push({
        icon: '🚀',
        title: 'New Competency',
        desc: 'Description of key expertise or engineering standard.'
      });
      renderAboutHighlights(portfolioData.about.highlights);
    });

    // 3. SKILL MODAL SUBMIT
    document.getElementById('btn-open-add-skill-modal').addEventListener('click', () => {
      document.getElementById('modal-skill-title').textContent = 'Add New Skill';
      document.getElementById('form-modal-skill').reset();
      document.getElementById('modal-skill-id').value = '';
      openModal('modal-skill');
    });

    document.getElementById('form-modal-skill').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('modal-skill-id').value;
      const body = {
        name: document.getElementById('modal-skill-name').value.trim(),
        category: document.getElementById('modal-skill-category').value,
        level: parseInt(document.getElementById('modal-skill-level').value) || 85,
        icon: document.getElementById('modal-skill-icon').value.trim() || '⚡',
        experience: document.getElementById('modal-skill-exp').value.trim()
      };

      try {
        const url = id ? `/api/skills/${id}` : '/api/skills';
        const method = id ? 'PUT' : 'POST';
        const res = await authFetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error('Failed to save skill');

        showToast(id ? 'Skill updated successfully!' : 'Skill added successfully!', 'success');
        closeModal('modal-skill');
        notifyLiveSync();
        await loadDashboardData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // 4. PROJECT MODAL SUBMIT
    document.getElementById('btn-open-add-project-modal').addEventListener('click', () => {
      document.getElementById('modal-project-title').textContent = 'Add New Project';
      document.getElementById('form-modal-project').reset();
      document.getElementById('modal-project-id').value = '';
      document.getElementById('modal-project-img-preview').src = './uploads/project_saas.jpg';
      openModal('modal-project');
    });

    document.getElementById('form-modal-project').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = e.target.querySelector('button[type="submit"]');
      const originalBtnHtml = submitBtn ? submitBtn.innerHTML : 'Save Project';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
      }

      try {
        const id = document.getElementById('modal-project-id').value;
        const fileInput = document.getElementById('modal-project-file');
        let imageUrl = document.getElementById('modal-project-image').value.trim();

        // If user picked a file, ensure it's uploaded first
        if (fileInput && fileInput.files && fileInput.files[0]) {
          if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up fa-spin"></i> Uploading screenshot...';
          const uploadedUrl = await uploadFile(fileInput.files[0]);
          if (uploadedUrl) {
            imageUrl = uploadedUrl;
            document.getElementById('modal-project-image').value = uploadedUrl;
            document.getElementById('modal-project-img-preview').src = uploadedUrl;
          }
        }

        const body = {
          title: document.getElementById('modal-project-name').value.trim(),
          category: document.getElementById('modal-project-category').value,
          metrics: document.getElementById('modal-project-metrics').value.trim(),
          shortDesc: document.getElementById('modal-project-shortDesc').value.trim(),
          fullDesc: document.getElementById('modal-project-fullDesc').value.trim(),
          liveUrl: document.getElementById('modal-project-liveUrl').value.trim(),
          githubUrl: document.getElementById('modal-project-githubUrl').value.trim(),
          tags: document.getElementById('modal-project-tags').value.split(',').map(t => t.trim()).filter(Boolean),
          image: imageUrl || './uploads/project_saas.jpg',
          featured: document.getElementById('modal-project-featured').checked
        };

        const url = id ? `/api/projects/${id}` : '/api/projects';
        const method = id ? 'PUT' : 'POST';
        const res = await authFetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error('Failed to save project');

        showToast(id ? 'Project updated successfully!' : 'Project added successfully!', 'success');
        closeModal('modal-project');
        notifyLiveSync();
        await loadDashboardData();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalBtnHtml;
        }
      }
    });

    // 5. CERTIFICATE MODAL SUBMIT
    document.getElementById('btn-open-add-cert-modal').addEventListener('click', () => {
      document.getElementById('modal-cert-title').textContent = 'Add Certificate';
      document.getElementById('form-modal-cert').reset();
      document.getElementById('modal-cert-id').value = '';
      document.getElementById('modal-cert-img-preview').src = './uploads/cert_cloud.jpg';
      openModal('modal-cert');
    });

    document.getElementById('form-modal-cert').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = e.target.querySelector('button[type="submit"]');
      const originalBtnHtml = submitBtn ? submitBtn.innerHTML : 'Save Certificate';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
      }

      try {
        const id = document.getElementById('modal-cert-id').value;
        const fileInput = document.getElementById('modal-cert-file');
        let imageUrl = document.getElementById('modal-cert-image').value.trim();

        if (fileInput && fileInput.files && fileInput.files[0]) {
          if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up fa-spin"></i> Uploading badge...';
          const uploadedUrl = await uploadFile(fileInput.files[0]);
          if (uploadedUrl) {
            imageUrl = uploadedUrl;
            document.getElementById('modal-cert-image').value = uploadedUrl;
            document.getElementById('modal-cert-img-preview').src = uploadedUrl;
          }
        }

        const body = {
          title: document.getElementById('modal-cert-name').value.trim(),
          issuer: document.getElementById('modal-cert-issuer').value.trim(),
          issueDate: document.getElementById('modal-cert-date').value.trim(),
          credentialId: document.getElementById('modal-cert-credId').value.trim(),
          credentialUrl: document.getElementById('modal-cert-url').value.trim(),
          image: imageUrl || './uploads/cert_cloud.jpg'
        };

        const url = id ? `/api/certificates/${id}` : '/api/certificates';
        const method = id ? 'PUT' : 'POST';
        const res = await authFetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error('Failed to save certificate');

        showToast(id ? 'Certificate updated successfully!' : 'Certificate added successfully!', 'success');
        closeModal('modal-cert');
        notifyLiveSync();
        await loadDashboardData();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalBtnHtml;
        }
      }
    });

    // 6. RESUME SUMMARY SUBMIT
    document.getElementById('btn-save-resume-summary').addEventListener('click', async () => {
      const body = {
        summary: document.getElementById('resume-summary-input').value.trim(),
        downloadUrl: document.getElementById('resume-download-url-input').value.trim()
      };

      try {
        const res = await authFetch('/api/resume', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error('Failed to update resume summary');
        showToast('Resume summary updated and synced live!', 'success');
        notifyLiveSync();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // Experience Modal
    document.getElementById('btn-open-add-experience-modal').addEventListener('click', () => {
      document.getElementById('modal-exp-title').textContent = 'Add Work Experience';
      document.getElementById('form-modal-experience').reset();
      document.getElementById('modal-exp-id').value = '';
      openModal('modal-experience');
    });

    document.getElementById('form-modal-experience').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('modal-exp-id').value;
      const body = {
        role: document.getElementById('modal-exp-role').value.trim(),
        company: document.getElementById('modal-exp-company').value.trim(),
        location: document.getElementById('modal-exp-location').value.trim(),
        period: document.getElementById('modal-exp-period').value.trim(),
        description: document.getElementById('modal-exp-desc').value.trim(),
        achievements: document.getElementById('modal-exp-achievements').value.split('\n').map(a => a.trim()).filter(Boolean)
      };

      try {
        const url = id ? `/api/resume/experience/${id}` : '/api/resume/experience';
        const method = id ? 'PUT' : 'POST';
        const res = await authFetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error('Failed to save experience');

        showToast(id ? 'Experience updated successfully!' : 'Experience added successfully!', 'success');
        closeModal('modal-experience');
        notifyLiveSync();
        await loadDashboardData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // Education Modal
    document.getElementById('btn-open-add-education-modal').addEventListener('click', () => {
      document.getElementById('modal-edu-title').textContent = 'Add Education';
      document.getElementById('form-modal-education').reset();
      document.getElementById('modal-edu-id').value = '';
      openModal('modal-education');
    });

    document.getElementById('form-modal-education').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('modal-edu-id').value;
      const body = {
        degree: document.getElementById('modal-edu-degree').value.trim(),
        institution: document.getElementById('modal-edu-institution').value.trim(),
        period: document.getElementById('modal-edu-period').value.trim(),
        details: document.getElementById('modal-edu-details').value.trim()
      };

      try {
        const url = id ? `/api/resume/education/${id}` : '/api/resume/education';
        const method = id ? 'PUT' : 'POST';
        const res = await authFetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error('Failed to save education');

        showToast(id ? 'Education updated successfully!' : 'Education added successfully!', 'success');
        closeModal('modal-education');
        notifyLiveSync();
        await loadDashboardData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // 7. SAVE CONTACT INFO
    document.getElementById('btn-save-contact').addEventListener('click', async () => {
      const socPlatforms = document.querySelectorAll('.soc-platform');
      const socUrls = document.querySelectorAll('.soc-url');
      const socUsers = document.querySelectorAll('.soc-user');
      const socials = [];

      socPlatforms.forEach((pInput, i) => {
        socials.push({
          platform: pInput.value.trim(),
          url: socUrls[i] ? socUrls[i].value.trim() : '',
          username: socUsers[i] ? socUsers[i].value.trim() : ''
        });
      });

      const body = {
        email: document.getElementById('contact-email').value.trim(),
        phone: document.getElementById('contact-phone').value.trim(),
        location: document.getElementById('contact-location').value.trim(),
        responseTime: document.getElementById('contact-responseTime').value.trim(),
        socials
      };

      try {
        const res = await authFetch('/api/contact', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error('Failed to update contact info');
        showToast('Contact info updated and synced live!', 'success');
        notifyLiveSync();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // Refresh messages button
    document.getElementById('btn-refresh-messages').addEventListener('click', async () => {
      const res = await authFetch('/api/messages');
      if (res.ok) {
        messagesData = await res.json();
        renderMessagesInbox();
        updateOverviewCounters();
        showToast('Inbox refreshed', 'info');
      }
    });
  }

  // ==================== FILE UPLOADS (IMAGES & PDF) ====================
  function initUploaders() {
    // 1. Home Avatar file upload
    const avatarFileInput = document.getElementById('home-avatar-file');
    avatarFileInput.addEventListener('change', async () => {
      if (!avatarFileInput.files || !avatarFileInput.files[0]) return;
      const file = avatarFileInput.files[0];
      const uploadedUrl = await uploadFile(file);
      if (uploadedUrl) {
        document.getElementById('home-avatar').value = uploadedUrl;
        document.getElementById('home-avatar-preview').src = uploadedUrl;
        showToast('Avatar uploaded! Click "Save Hero Changes" to persist.', 'success');
      }
    });

    // 2. Project Screenshot file upload
    const projectFileInput = document.getElementById('modal-project-file');
    projectFileInput.addEventListener('change', async () => {
      if (!projectFileInput.files || !projectFileInput.files[0]) return;
      const file = projectFileInput.files[0];
      const uploadedUrl = await uploadFile(file);
      if (uploadedUrl) {
        document.getElementById('modal-project-image').value = uploadedUrl;
        document.getElementById('modal-project-img-preview').src = uploadedUrl;
        showToast('Project screenshot uploaded!', 'success');
      }
    });

    // 3. Certificate Badge file upload
    const certFileInput = document.getElementById('modal-cert-file');
    certFileInput.addEventListener('change', async () => {
      if (!certFileInput.files || !certFileInput.files[0]) return;
      const file = certFileInput.files[0];
      const uploadedUrl = await uploadFile(file);
      if (uploadedUrl) {
        document.getElementById('modal-cert-image').value = uploadedUrl;
        document.getElementById('modal-cert-img-preview').src = uploadedUrl;
        showToast('Certificate badge uploaded!', 'success');
      }
    });

    // 4. Resume PDF file upload
    const resumeFileInput = document.getElementById('resume-file-upload');
    resumeFileInput.addEventListener('change', async () => {
      if (!resumeFileInput.files || !resumeFileInput.files[0]) return;
      const file = resumeFileInput.files[0];
      const uploadedUrl = await uploadFile(file);
      if (uploadedUrl) {
        document.getElementById('resume-download-url-input').value = uploadedUrl;
        // Auto-save resume URL
        await authFetch('/api/resume', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ downloadUrl: uploadedUrl })
        });
        showToast('Resume PDF uploaded and linked!', 'success');
        notifyLiveSync();
      }
    });
  }

  async function uploadFile(file) {
    if (!token) {
      showLoginOverlay();
      showToast('Please sign in before uploading files', 'error');
      return null;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      showToast('Uploading ' + (file.name || 'file') + '...', 'info');
      const res = await fetch(getApiUrl('/api/upload'), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (res.status === 401) {
        token = '';
        localStorage.removeItem('admin_portfolio_token');
        showLoginOverlay();
        throw new Error('Session expired. Please sign in again to upload.');
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      return data.fileUrl || data.url;
    } catch (err) {
      showToast(err.message, 'error');
      return null;
    }
  }

  // ==================== SETTINGS & BACKUPS ====================
  function initSettings() {
    // Change credentials
    document.getElementById('form-change-credentials').addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPassword = document.getElementById('cred-current-pass').value;
      const newUsername = document.getElementById('cred-new-username').value.trim();
      const newPassword = document.getElementById('cred-new-pass').value.trim();

      try {
        const res = await authFetch('/api/auth/update-credentials', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword, newUsername, newPassword })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update credentials');

        showToast('Admin credentials updated successfully!', 'success');
        document.getElementById('form-change-credentials').reset();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // Export JSON backup handler
    const exportBtn = document.getElementById('btn-export-json');
    if (exportBtn) {
      exportBtn.addEventListener('click', (e) => {
        if (portfolioData) {
          e.preventDefault();
          const blob = new Blob([JSON.stringify(portfolioData, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `portfolio_backup_${new Date().toISOString().split('T')[0]}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          showToast('Portfolio JSON backup downloaded!', 'success');
        }
      });
    }

    // Import JSON backup
    const importInput = document.getElementById('input-import-json');
    importInput.addEventListener('change', async () => {
      if (!importInput.files || !importInput.files[0]) return;
      const file = importInput.files[0];
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          const res = await authFetch('/api/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(parsed)
          });
          if (!res.ok) throw new Error('Failed to import JSON data');
          showToast('Portfolio restored from backup!', 'success');
          notifyLiveSync();
          await loadDashboardData();
        } catch (err) {
          showToast('Invalid JSON file: ' + err.message, 'error');
        }
      };
      reader.readAsText(file);
    });
  }

  // ==================== TAB NAVIGATION & RESPONSIVE SIDEBAR ====================
  function initTabNavigation() {
    // Mobile sidebar toggle button
    const sidebarToggle = document.getElementById('btn-sidebar-toggle');
    const sidebar = document.getElementById('admin-sidebar');
    if (sidebarToggle && sidebar) {
      sidebarToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebar.classList.toggle('open');
      });

      // Close sidebar when clicking outside on mobile
      document.addEventListener('click', (e) => {
        if (window.innerWidth <= 900 && !sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
          sidebar.classList.remove('open');
        }
      });
    }

    document.querySelectorAll('.admin-nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const targetTab = item.getAttribute('data-tab');
        switchTab(targetTab);
        if (sidebar && window.innerWidth <= 900) {
          sidebar.classList.remove('open');
        }
      });
    });
  }

  function switchTab(tabId) {
    document.querySelectorAll('.admin-nav-item').forEach(item => {
      if (item.getAttribute('data-tab') === tabId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    document.querySelectorAll('.tab-section').forEach(sec => {
      if (sec.id === tabId) {
        sec.classList.add('active');
      } else {
        sec.classList.remove('active');
      }
    });

    // Update Topbar Title
    const activeItem = document.querySelector(`.admin-nav-item[data-tab="${tabId}"] a`);
    if (activeItem) {
      document.getElementById('topbar-title').textContent = activeItem.textContent.trim();
    }
  }

  // ==================== MODAL HELPERS ====================
  function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
  }

  // ==================== REAL-TIME LIVE SYNC ====================
  function notifyLiveSync() {
    if (syncChannel) {
      try {
        syncChannel.postMessage({ type: 'PORTFOLIO_UPDATED', timestamp: Date.now() });
      } catch (e) {}
    }
    try {
      localStorage.setItem('portfolio_last_updated', Date.now().toString());
    } catch (e) {}
  }

  function initRealtimeListener() {
    if (syncChannel) {
      syncChannel.onmessage = (event) => {
        if (event.data && event.data.type === 'NEW_MESSAGE_SENT') {
          showToast('📬 New contact inquiry received from visitor!', 'info');
          authFetch('/api/messages').then(res => res.json()).then(msgs => {
            messagesData = Array.isArray(msgs) ? msgs : [];
            renderMessagesInbox();
            updateOverviewCounters();
          }).catch(() => {});
        }
      };
    }
  }

  // ==================== TOAST NOTIFICATIONS ====================
  function showToast(message, type = 'info') {
    const box = document.getElementById('admin-toast-box');
    if (!box) return;

    const toast = document.createElement('div');
    toast.className = 'admin-toast';

    let icon = 'fa-solid fa-circle-info';
    let color = '#38bdf8';
    if (type === 'success') { icon = 'fa-solid fa-circle-check'; color = '#10b981'; }
    if (type === 'error') { icon = 'fa-solid fa-triangle-exclamation'; color = '#ef4444'; }

    toast.innerHTML = `<i class="${icon}" style="color: ${color};"></i> <span>${escapeHtml(message)}</span>`;
    box.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

})();
