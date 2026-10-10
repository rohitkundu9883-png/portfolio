/**
 * =========================================================
 * PUBLIC PORTFOLIO - DYNAMIC LOGIC & REAL-TIME SYNC
 * =========================================================
 */

(function () {
  'use strict';

  // State
  let portfolioData = null;
  let activeSkillFilter = 'all';
  let activeProjectFilter = 'all';

  // Broadcast Channel for instantaneous cross-tab synchronization
  const syncChannel = 'BroadcastChannel' in window ? new BroadcastChannel('portfolio_sync_channel') : null;

  // Helper to ensure asset paths work on GitHub Pages subpaths (/portfolio/) and standard hosts
  function assetUrl(url) {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
    if (url.startsWith('./')) return url;
    if (url.startsWith('/')) return '.' + url;
    return './' + url;
  }

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    initNavbar();
    initContactForm();
    initModal();
    loadPortfolioData();
    initRealtimeSync();
  });

  // ==================== DATA FETCHING & RENDERING ====================
  async function loadPortfolioData(isLiveUpdate = false) {
    try {
      let res = await fetch('./api/portfolio?_t=' + Date.now()).catch(() => null);
      if (!res || !res.ok) {
        // Fallback for static hosting (GitHub Pages, Vercel Static, etc.)
        res = await fetch('./data/portfolio.json?_t=' + Date.now()).catch(() => null);
        if (!res || !res.ok) {
          res = await fetch('data/portfolio.json?_t=' + Date.now()).catch(() => null);
        }
      }
      if (!res || !res.ok) throw new Error('Failed to fetch portfolio data');
      
      portfolioData = await res.json();
      renderAll(portfolioData);

      if (isLiveUpdate) {
        showLiveSyncBanner('✨ Portfolio updated in real-time from Admin Dashboard!');
      }
    } catch (err) {
      console.error('Error loading portfolio:', err);
      showToast('Error loading live portfolio data', 'error');
    }
  }

  function renderAll(data) {
    if (!data) return;
    renderHome(data.home);
    renderAbout(data.about);
    renderSkills(data.skills);
    renderProjects(data.projects);
    renderCertificates(data.certificates);
    renderResume(data.resume);
    renderContact(data.contact);
    updateFooter(data.home);
  }

  // ==================== SECTION RENDERERS ====================
  function renderHome(home) {
    if (!home) return;

    // Document Title
    document.title = `${home.name} | ${home.title}`;
    const navBrandName = document.getElementById('nav-brand-name');
    if (navBrandName) navBrandName.textContent = home.name;

    // Name & Title
    const heroName = document.getElementById('hero-name');
    if (heroName) heroName.textContent = home.name;

    const heroTitle = document.getElementById('hero-title');
    if (heroTitle) heroTitle.textContent = home.title;

    const heroTagline = document.getElementById('hero-tagline');
    if (heroTagline) heroTagline.textContent = home.tagline;

    // Status Pill
    const heroStatusText = document.getElementById('hero-status-text');
    if (heroStatusText && home.statusBadge) {
      heroStatusText.textContent = home.statusBadge;
    }

    // Avatar
    const avatarImg = document.getElementById('hero-avatar-img');
    if (avatarImg && home.avatar) {
      avatarImg.src = assetUrl(home.avatar);
      avatarImg.alt = `${home.name} profile picture`;
    }

    // CTAs
    const ctaPrimary = document.getElementById('hero-cta-primary');
    if (ctaPrimary && home.ctaPrimaryText) {
      ctaPrimary.querySelector('span').textContent = home.ctaPrimaryText;
      ctaPrimary.href = home.ctaPrimaryLink || '#projects';
    }

    const ctaSecondary = document.getElementById('hero-cta-secondary');
    if (ctaSecondary && home.ctaSecondaryText) {
      ctaSecondary.querySelector('span').textContent = home.ctaSecondaryText;
      ctaSecondary.href = home.ctaSecondaryLink || '#contact';
    }

    const resumeBtn = document.getElementById('hero-resume-btn');
    if (resumeBtn && home.resumeLink) {
      resumeBtn.href = assetUrl(home.resumeLink);
    }

    // Social Links
    const socialsContainer = document.getElementById('hero-socials-container');
    if (socialsContainer && home.socialLinks) {
      socialsContainer.innerHTML = home.socialLinks.map(s => {
        let iconClass = 'fa-solid fa-link';
        const p = s.platform.toLowerCase();
        if (p.includes('github')) iconClass = 'fa-brands fa-github';
        else if (p.includes('linkedin')) iconClass = 'fa-brands fa-linkedin-in';
        else if (p.includes('twitter') || p.includes('x')) iconClass = 'fa-brands fa-x-twitter';
        else if (p.includes('email') || p.includes('mail')) iconClass = 'fa-regular fa-envelope';
        else if (p.includes('discord')) iconClass = 'fa-brands fa-discord';

        return `
          <a href="${escapeHtml(s.url)}" class="social-icon-btn" target="_blank" rel="noopener noreferrer" title="${escapeHtml(s.platform)}">
            <i class="${iconClass}"></i>
          </a>
        `;
      }).join('');
    }

    // Stats Bar
    const statsBar = document.getElementById('hero-stats-bar');
    if (statsBar && home.stats) {
      statsBar.innerHTML = home.stats.map(st => `
        <div class="stat-item">
          <div class="stat-value">${escapeHtml(st.value)}</div>
          <div class="stat-label">${escapeHtml(st.label)}</div>
        </div>
      `).join('');

      // Update floating badges if available
      const f1 = document.getElementById('float-badge-1-val');
      const f2 = document.getElementById('float-badge-2-val');
      if (f1 && home.stats[0]) f1.textContent = home.stats[0].value;
      if (f2 && home.stats[1]) f2.textContent = home.stats[1].value;
    }
  }

  function renderAbout(about) {
    if (!about) return;

    const heading = document.getElementById('about-heading');
    if (heading && about.heading) heading.textContent = about.heading;

    const subheading = document.getElementById('about-subheading');
    if (subheading && about.subheading) subheading.textContent = about.subheading;

    // Bio Paragraphs
    const bioContainer = document.getElementById('about-bio-paragraphs');
    if (bioContainer && about.bioParagraphs) {
      bioContainer.innerHTML = about.bioParagraphs.map(p => `
        <p>${escapeHtml(p)}</p>
      `).join('');
    }

    // Personal Info Grid
    const personalInfoGrid = document.getElementById('about-personal-info-grid');
    if (personalInfoGrid && about.personalInfo) {
      personalInfoGrid.innerHTML = about.personalInfo.map(item => `
        <div class="personal-info-item">
          <span class="personal-info-label">${escapeHtml(item.label)}</span>
          <span class="personal-info-value">${escapeHtml(item.value)}</span>
        </div>
      `).join('');
    }

    // Highlights
    const highlightsGrid = document.getElementById('about-highlights-grid');
    if (highlightsGrid && about.highlights) {
      highlightsGrid.innerHTML = about.highlights.map(hl => `
        <div class="highlight-card">
          <div class="highlight-icon-box">${escapeHtml(hl.icon || '🚀')}</div>
          <div class="highlight-content">
            <h4>${escapeHtml(hl.title)}</h4>
            <p>${escapeHtml(hl.desc)}</p>
          </div>
        </div>
      `).join('');
    }
  }

  function renderSkills(skills) {
    if (!skills) return;

    // Filter Skills
    const filtered = skills.filter(s => {
      if (activeSkillFilter === 'all') return true;
      return s.category.toLowerCase() === activeSkillFilter.toLowerCase();
    });

    const grid = document.getElementById('skills-grid');
    if (!grid) return;

    grid.innerHTML = filtered.map(s => `
      <div class="skill-card">
        <div class="skill-header">
          <div class="skill-icon-name">
            <span class="skill-icon">${escapeHtml(s.icon || '⚡')}</span>
            <span class="skill-name">${escapeHtml(s.name)}</span>
          </div>
          <div class="skill-meta">
            <span class="skill-category-badge">${escapeHtml(s.category)}</span>
            <span class="skill-level-text">${s.level}%</span>
          </div>
        </div>
        <div class="skill-bar-wrap">
          <div class="skill-bar-fill" style="width: ${s.level}%;"></div>
        </div>
        <div class="skill-exp-tag">
          <i class="fa-regular fa-clock"></i> <span>${escapeHtml(s.experience || 'Proficient')}</span>
        </div>
      </div>
    `).join('');

    // Attach filter tabs event listeners
    const filterTabsContainer = document.getElementById('skills-filter-tabs');
    if (filterTabsContainer && !filterTabsContainer.dataset.initialized) {
      filterTabsContainer.dataset.initialized = 'true';
      filterTabsContainer.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          filterTabsContainer.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          activeSkillFilter = tab.getAttribute('data-category');
          renderSkills(portfolioData ? portfolioData.skills : []);
        });
      });
    }
  }

  function renderProjects(projects) {
    if (!projects) return;

    // Filter Projects
    const filtered = projects.filter(p => {
      if (activeProjectFilter === 'all') return true;
      return p.category.toLowerCase() === activeProjectFilter.toLowerCase();
    });

    const grid = document.getElementById('projects-grid');
    if (!grid) return;

    grid.innerHTML = filtered.map(p => `
      <div class="project-card" data-project-id="${escapeHtml(p.id)}">
        <div class="project-image-wrap">
          <img src="${escapeHtml(assetUrl(p.image || './uploads/project_saas.jpg'))}" alt="${escapeHtml(p.title)}" loading="lazy">
          ${p.featured ? '<div class="project-featured-badge"><i class="fa-solid fa-star"></i> Featured</div>' : ''}
          <div class="project-category-tag">${escapeHtml(p.category)}</div>
        </div>
        <div class="project-body">
          <h3 class="project-title">${escapeHtml(p.title)}</h3>
          <p class="project-desc">${escapeHtml(p.shortDesc)}</p>

          ${p.metrics ? `
            <div class="project-metrics-badge">
              <i class="fa-solid fa-chart-line"></i> ${escapeHtml(p.metrics)}
            </div>
          ` : ''}

          <div class="project-tags">
            ${(p.tags || []).map(t => `<span class="project-tag">${escapeHtml(t)}</span>`).join('')}
          </div>

          <div class="project-links">
            ${p.liveUrl ? `<a href="${escapeHtml(p.liveUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-primary"><i class="fa-solid fa-arrow-up-right-from-square"></i> Demo</a>` : ''}
            ${p.githubUrl ? `<a href="${escapeHtml(p.githubUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-glass"><i class="fa-brands fa-github"></i> Code</a>` : ''}
            <button type="button" class="btn btn-sm btn-outline btn-project-detail" data-id="${escapeHtml(p.id)}">
              <i class="fa-solid fa-expand"></i> Details
            </button>
          </div>
        </div>
      </div>
    `).join('');

    // Attach click handlers to project details
    grid.querySelectorAll('.btn-project-detail').forEach(btn => {
      btn.addEventListener('click', () => {
        const projId = btn.getAttribute('data-id');
        openProjectModal(projId);
      });
    });

    // Filter tabs
    const filterTabsContainer = document.getElementById('projects-filter-tabs');
    if (filterTabsContainer && !filterTabsContainer.dataset.initialized) {
      filterTabsContainer.dataset.initialized = 'true';
      filterTabsContainer.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          filterTabsContainer.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          activeProjectFilter = tab.getAttribute('data-project-filter');
          renderProjects(portfolioData ? portfolioData.projects : []);
        });
      });
    }
  }

  function renderCertificates(certs) {
    if (!certs) return;

    const grid = document.getElementById('certificates-grid');
    if (!grid) return;

    grid.innerHTML = certs.map(c => `
      <div class="cert-card">
        <div class="cert-badge-frame">
          <img src="${escapeHtml(assetUrl(c.image || './uploads/cert_cloud.jpg'))}" alt="${escapeHtml(c.title)}">
        </div>
        <h4 class="cert-title">${escapeHtml(c.title)}</h4>
        <div class="cert-issuer">${escapeHtml(c.issuer)}</div>
        <div class="cert-meta">
          <span>Issued: ${escapeHtml(c.issueDate)}</span>
          ${c.credentialId ? `<span>Credential ID: ${escapeHtml(c.credentialId)}</span>` : ''}
        </div>
        ${c.credentialUrl ? `
          <a href="${escapeHtml(c.credentialUrl)}" target="_blank" rel="noopener noreferrer" class="cert-link">
            <span>Verify Credential</span> <i class="fa-solid fa-arrow-right"></i>
          </a>
        ` : ''}
      </div>
    `).join('');
  }

  function renderResume(resume) {
    if (!resume) return;

    // Summary
    const summaryEl = document.getElementById('resume-summary');
    if (summaryEl && resume.summary) summaryEl.textContent = resume.summary;

    // Download Button
    const dlBtn = document.getElementById('resume-download-btn');
    if (dlBtn && resume.downloadUrl) {
      dlBtn.href = assetUrl(resume.downloadUrl);
    }

    // Experience Timeline
    const expTimeline = document.getElementById('experience-timeline');
    if (expTimeline && resume.experience) {
      expTimeline.innerHTML = resume.experience.map(e => `
        <div class="timeline-item">
          <div class="timeline-dot"></div>
          <div class="timeline-card">
            <h4 class="timeline-role">${escapeHtml(e.role)}</h4>
            <div class="timeline-company-row">
              <span class="timeline-company">${escapeHtml(e.company)}${e.location ? ' • ' + escapeHtml(e.location) : ''}</span>
              <span class="timeline-period">${escapeHtml(e.period)}</span>
            </div>
            ${e.description ? `<p class="timeline-desc">${escapeHtml(e.description)}</p>` : ''}
            ${e.achievements && e.achievements.length ? `
              <ul class="timeline-achievements">
                ${e.achievements.map(a => `<li>${escapeHtml(a)}</li>`).join('')}
              </ul>
            ` : ''}
          </div>
        </div>
      `).join('');
    }

    // Education Timeline
    const eduTimeline = document.getElementById('education-timeline');
    if (eduTimeline && resume.education) {
      eduTimeline.innerHTML = resume.education.map(ed => `
        <div class="timeline-item">
          <div class="timeline-dot"></div>
          <div class="timeline-card">
            <h4 class="timeline-role">${escapeHtml(ed.degree)}</h4>
            <div class="timeline-company-row">
              <span class="timeline-company">${escapeHtml(ed.institution)}</span>
              <span class="timeline-period">${escapeHtml(ed.period)}</span>
            </div>
            ${ed.details ? `<p class="timeline-desc">${escapeHtml(ed.details)}</p>` : ''}
          </div>
        </div>
      `).join('');
    }
  }

  function renderContact(contact) {
    if (!contact) return;

    // Email
    const emailVal = document.getElementById('contact-email-val');
    const emailCard = document.getElementById('contact-email-card');
    if (emailVal && contact.email) {
      emailVal.textContent = contact.email;
      if (emailCard) emailCard.href = `mailto:${contact.email}`;
    }

    // Phone
    const phoneVal = document.getElementById('contact-phone-val');
    const phoneCard = document.getElementById('contact-phone-card');
    if (phoneVal && contact.phone) {
      phoneVal.textContent = contact.phone;
      if (phoneCard) phoneCard.href = `tel:${contact.phone.replace(/[^0-9+]/g, '')}`;
    }

    // Location
    const locVal = document.getElementById('contact-location-val');
    if (locVal && contact.location) locVal.textContent = contact.location;

    // Response time
    const respVal = document.getElementById('contact-response-val');
    if (respVal && contact.responseTime) respVal.textContent = contact.responseTime;
  }

  function updateFooter(home) {
    if (!home) return;
    const yearEl = document.getElementById('current-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    const footerName = document.getElementById('footer-name');
    if (footerName && home.name) footerName.textContent = home.name;
  }

  // ==================== PROJECT DETAILS MODAL ====================
  function initModal() {
    const modal = document.getElementById('project-detail-modal');
    const closeBtn = document.getElementById('modal-close-btn');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
      });
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });
    }

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
        modal.classList.remove('active');
      }
    });
  }

  function openProjectModal(projectId) {
    if (!portfolioData || !portfolioData.projects) return;
    const proj = portfolioData.projects.find(p => p.id === projectId);
    if (!proj) return;

    const modal = document.getElementById('project-detail-modal');
    const title = document.getElementById('modal-project-title');
    const body = document.getElementById('modal-project-body');

    title.textContent = proj.title;
    body.innerHTML = `
      <div style="margin-bottom: 1.5rem; border-radius: 14px; overflow: hidden; max-height: 320px;">
        <img src="${escapeHtml(assetUrl(proj.image || './uploads/project_saas.jpg'))}" alt="${escapeHtml(proj.title)}" style="width: 100%; height: 100%; object-fit: cover;">
      </div>
      <div style="display: flex; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 1.25rem;">
        <span class="project-category-tag" style="position: static;">${escapeHtml(proj.category)}</span>
        ${proj.metrics ? `<span style="font-family: var(--font-mono); font-size: 0.8rem; color: #34d399; padding: 0.35rem 0.85rem; border-radius: 9999px; background: rgba(16,185,129,0.12);"><i class="fa-solid fa-chart-line"></i> ${escapeHtml(proj.metrics)}</span>` : ''}
      </div>
      <h4 style="font-size: 1.2rem; margin-bottom: 0.75rem;">Project Overview</h4>
      <p style="color: var(--text-secondary); line-height: 1.7; margin-bottom: 1.5rem; white-space: pre-line;">${escapeHtml(proj.fullDesc || proj.shortDesc)}</p>

      <h5 style="font-size: 0.95rem; margin-bottom: 0.6rem; color: #818cf8;">Tech Stack & Architecture</h5>
      <div class="project-tags" style="margin-bottom: 2rem;">
        ${(proj.tags || []).map(t => `<span class="project-tag">${escapeHtml(t)}</span>`).join('')}
      </div>

      <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
        ${proj.liveUrl ? `<a href="${escapeHtml(proj.liveUrl)}" target="_blank" class="btn btn-primary"><i class="fa-solid fa-arrow-up-right-from-square"></i> Visit Live Application</a>` : ''}
        ${proj.githubUrl ? `<a href="${escapeHtml(proj.githubUrl)}" target="_blank" class="btn btn-glass"><i class="fa-brands fa-github"></i> View GitHub Repository</a>` : ''}
      </div>
    `;

    modal.classList.add('active');
  }

  // ==================== CONTACT FORM ====================
  function initContactForm() {
    const form = document.getElementById('public-contact-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const btn = document.getElementById('contact-submit-btn');
      const btnText = document.getElementById('btn-text');
      const btnIcon = document.getElementById('btn-icon');

      const formData = {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        subject: form.subject.value.trim(),
        message: form.message.value.trim()
      };

      // Loading state
      btn.disabled = true;
      btnText.textContent = 'Sending Message...';
      btnIcon.className = 'fa-solid fa-spinner fa-spin';

      try {
        const res = await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to send message');

        showToast(data.message || 'Message sent successfully!', 'success');
        form.reset();

        // Notify other tabs
        if (syncChannel) {
          syncChannel.postMessage({ type: 'NEW_MESSAGE_SENT' });
        }
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btnText.textContent = 'Send Message';
        btnIcon.className = 'fa-solid fa-paper-plane';
      }
    });
  }

  // ==================== REAL-TIME LIVE SYNC ====================
  function initRealtimeSync() {
    // 1. Cross-tab BroadcastChannel
    if (syncChannel) {
      syncChannel.onmessage = (event) => {
        if (event.data && event.data.type === 'PORTFOLIO_UPDATED') {
          loadPortfolioData(true);
        }
      };
    }

    // 2. Server-Sent Events (SSE) from Express backend
    if ('EventSource' in window) {
      try {
        const evtSource = new EventSource('/api/events');

        evtSource.addEventListener('PORTFOLIO_UPDATED', (e) => {
          console.log('⚡ SSE Event: PORTFOLIO_UPDATED received', e.data);
          loadPortfolioData(true);
        });

        evtSource.onerror = () => {
          // Fallback gracefully if disconnected
        };
      } catch (e) {
        console.warn('SSE initialization error:', e);
      }
    }
  }

  function showLiveSyncBanner(msg) {
    const banner = document.getElementById('live-sync-banner');
    const text = document.getElementById('live-sync-text');
    if (!banner) return;

    if (text) text.textContent = msg;
    banner.style.display = 'inline-flex';

    clearTimeout(banner._timer);
    banner._timer = setTimeout(() => {
      banner.style.display = 'none';
    }, 4000);
  }

  // ==================== NAVBAR BEHAVIOR ====================
  function initNavbar() {
    const navbar = document.getElementById('navbar');
    const toggleBtn = document.getElementById('nav-toggle-btn');
    const navLinks = document.querySelector('.nav-links');

    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }

      // Scroll Spy
      const sections = document.querySelectorAll('section[id]');
      const scrollPos = window.scrollY + 120;

      sections.forEach(sec => {
        const top = sec.offsetTop;
        const height = sec.offsetHeight;
        const id = sec.getAttribute('id');

        if (scrollPos >= top && scrollPos < top + height) {
          document.querySelectorAll('.nav-links a').forEach(a => {
            a.classList.remove('active');
            if (a.getAttribute('href') === '#' + id) {
              a.classList.add('active');
            }
          });
        }
      });
    });

    if (toggleBtn && navLinks) {
      toggleBtn.addEventListener('click', () => {
        const isShown = navLinks.style.display === 'flex';
        navLinks.style.display = isShown ? 'none' : 'flex';
        if (!isShown) {
          navLinks.style.flexDirection = 'column';
          navLinks.style.position = 'absolute';
          navLinks.style.top = '100%';
          navLinks.style.left = '0';
          navLinks.style.right = '0';
          navLinks.style.background = 'rgba(7, 9, 19, 0.98)';
          navLinks.style.padding = '1.5rem';
          navLinks.style.borderBottom = '1px solid rgba(255, 255, 255, 0.1)';
        }
      });
    }
  }

  // ==================== TOAST NOTIFICATIONS ====================
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'fa-solid fa-circle-info';
    if (type === 'success') icon = 'fa-solid fa-circle-check';
    if (type === 'error') icon = 'fa-solid fa-triangle-exclamation';

    toast.innerHTML = `<i class="${icon}"></i> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3800);
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
