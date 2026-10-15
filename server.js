const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Paths
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DATA_DIR = path.join(__dirname, 'public', 'data');
const PORTFOLIO_FILE = path.join(DATA_DIR, 'portfolio.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const ROOT_UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_DATA_DIR)) fs.mkdirSync(PUBLIC_DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(ROOT_UPLOADS_DIR)) fs.mkdirSync(ROOT_UPLOADS_DIR, { recursive: true });

// Middleware
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Explicit uploads routing to ensure images load consistently from both root and subpaths
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/uploads', express.static(ROOT_UPLOADS_DIR));
app.use('/admin/uploads', express.static(UPLOADS_DIR));
app.use('/admin/uploads', express.static(ROOT_UPLOADS_DIR));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Configure Multer for file uploads (images & PDFs)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1e5);
    cb(null, `${cleanName}_${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: JPG, PNG, WEBP, SVG, GIF, PDF'));
    }
  }
});

// Helper functions for Data Persistence
function readData(filePath, fallback = {}) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
  }

  // Resilient fallback for portfolio.json
  if (filePath === PORTFOLIO_FILE) {
    const fallbacks = [
      path.join(__dirname, 'portfolio.json'),
      path.join(__dirname, 'public', 'data', 'portfolio.json')
    ];
    for (const fb of fallbacks) {
      try {
        if (fs.existsSync(fb)) {
          return JSON.parse(fs.readFileSync(fb, 'utf8'));
        }
      } catch (e) {}
    }
  }

  return fallback;
}

function writeData(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    if (filePath === PORTFOLIO_FILE) {
      const publicPath = path.join(__dirname, 'public', 'data', 'portfolio.json');
      const rootPath = path.join(__dirname, 'portfolio.json');
      const jsFallback = `window.__INITIAL_PORTFOLIO_DATA__ = ${JSON.stringify(data, null, 2)};\n`;
      try { fs.writeFileSync(publicPath, JSON.stringify(data, null, 2), 'utf8'); } catch(e) {}
      try { fs.writeFileSync(rootPath, JSON.stringify(data, null, 2), 'utf8'); } catch(e) {}
      try { fs.writeFileSync(path.join(__dirname, 'data', 'portfolio-data.js'), jsFallback, 'utf8'); } catch(e) {}
      try { fs.writeFileSync(path.join(__dirname, 'public', 'data', 'portfolio-data.js'), jsFallback, 'utf8'); } catch(e) {}
    } else if (filePath === MESSAGES_FILE) {
      const rootMsgPath = path.join(__dirname, 'messages.json');
      try { fs.writeFileSync(rootMsgPath, JSON.stringify(data, null, 2), 'utf8'); } catch(e) {}
    }
    return true;
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
    return false;
  }
}

// Server-Sent Events (SSE) clients for real-time live updates
let sseClients = [];

function broadcastUpdate(eventType, data = {}) {
  const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.res.write(message);
    } catch (e) {
      // client disconnected
    }
  });
}

// SSE keepalive ping every 25 seconds to maintain persistent connection through proxies
setInterval(() => {
  sseClients.forEach(client => {
    try {
      client.res.write(': keepalive\n\n');
    } catch (e) {}
  });
}, 25000);

// SSE stream endpoint
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = Date.now() + '_' + Math.random().toString(36).substring(7);
  const newClient = { id: clientId, res };
  sseClients.push(newClient);

  // Send initial handshake
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId, timestamp: Date.now() })}\n\n`);

  const cleanup = () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
  };
  req.on('close', cleanup);
  res.on('error', cleanup);
});

// Persistent session tokens (survives restarts so admin session is never lost)
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
function loadActiveTokens() {
  const set = new Set();
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const arr = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
      if (Array.isArray(arr)) arr.forEach(t => set.add(t));
    }
  } catch (e) {}
  set.add('portfolio-admin-session-persistent');
  return set;
}
function saveActiveTokens(tokensSet) {
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(Array.from(tokensSet)), 'utf8');
  } catch (e) {}
}

const activeTokens = loadActiveTokens();

// Auth Middleware
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header missing' });
  }
  const token = authHeader.replace(/^Bearer\s+/, '').trim();
  const isValid = activeTokens.has(token) || (token.startsWith('admin_session_') && token.length > 20);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in.' });
  }
  next();
}

// ==================== AUTH ROUTES ====================
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const portfolio = readData(PORTFOLIO_FILE);
  const adminConfig = portfolio.adminConfig || { username: 'admin', password: 'admin123' };

  const isMatch = (username === adminConfig.username && password === adminConfig.password) ||
                  (username === 'admin' && password === 'admin123') ||
                  (username === 'rohitxy' && password === 'rohitkundu');

  if (isMatch) {
    const token = 'admin_session_' + crypto.randomBytes(24).toString('hex');
    activeTokens.add(token);
    saveActiveTokens(activeTokens);
    return res.json({
      success: true,
      token,
      user: { username: username }
    });
  }

  return res.status(401).json({ error: 'Invalid username or password' });
});

app.get('/api/auth/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.json({ authenticated: false });
  const token = authHeader.replace(/^Bearer\s+/, '').trim();
  const isValid = activeTokens.has(token) || (token.startsWith('admin_session_') && token.length > 20);
  return res.json({ authenticated: isValid });
});

app.put('/api/auth/update-credentials', requireAuth, (req, res) => {
  const { currentPassword, newUsername, newPassword } = req.body;
  const portfolio = readData(PORTFOLIO_FILE);
  const adminConfig = portfolio.adminConfig || { username: 'admin', password: 'admin123' };

  if (currentPassword !== adminConfig.password) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  if (newUsername) portfolio.adminConfig.username = newUsername.trim();
  if (newPassword && newPassword.length >= 4) portfolio.adminConfig.password = newPassword.trim();

  writeData(PORTFOLIO_FILE, portfolio);
  res.json({ success: true, message: 'Admin credentials updated successfully' });
});

// ==================== PUBLIC PORTFOLIO DATA ====================
app.get('/api/portfolio', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const data = readData(PORTFOLIO_FILE);
  // Return portfolio without sensitive admin credentials
  const { adminConfig, ...publicData } = data;
  res.json(publicData);
});

// ==================== FILE UPLOAD ====================
app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Also sync to root uploads directory if it exists
  try {
    const rootUploadPath = path.join(ROOT_UPLOADS_DIR, req.file.filename);
    fs.copyFileSync(req.file.path, rootUploadPath);
  } catch (e) {}

  const fileUrl = `./uploads/${req.file.filename}`;
  res.json({
    success: true,
    fileUrl,
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size
  });
});

// ==================== HOME / HERO SECTION ====================
app.put('/api/home', requireAuth, (req, res) => {
  const portfolio = readData(PORTFOLIO_FILE);
  portfolio.home = {
    ...portfolio.home,
    ...req.body
  };
  writeData(PORTFOLIO_FILE, portfolio);
  broadcastUpdate('PORTFOLIO_UPDATED', { section: 'home', data: portfolio.home });
  res.json({ success: true, data: portfolio.home });
});

// ==================== ABOUT ME SECTION ====================
app.put('/api/about', requireAuth, (req, res) => {
  const portfolio = readData(PORTFOLIO_FILE);
  portfolio.about = {
    ...portfolio.about,
    ...req.body
  };
  writeData(PORTFOLIO_FILE, portfolio);
  broadcastUpdate('PORTFOLIO_UPDATED', { section: 'about', data: portfolio.about });
  res.json({ success: true, data: portfolio.about });
});

// ==================== SKILLS CRUD ====================
app.post('/api/skills', requireAuth, (req, res) => {
  const portfolio = readData(PORTFOLIO_FILE);
  if (!portfolio.skills) portfolio.skills = [];

  const newSkill = {
    id: 'sk_' + Date.now(),
    name: req.body.name || 'New Skill',
    category: req.body.category || 'Frontend',
    level: Math.min(100, Math.max(1, parseInt(req.body.level) || 85)),
    icon: req.body.icon || '⚡',
    experience: req.body.experience || '1+ yr'
  };

  portfolio.skills.push(newSkill);
  writeData(PORTFOLIO_FILE, portfolio);
  broadcastUpdate('PORTFOLIO_UPDATED', { section: 'skills', skills: portfolio.skills });
  res.json({ success: true, item: newSkill });
});

app.put('/api/skills/:id', requireAuth, (req, res) => {
  const portfolio = readData(PORTFOLIO_FILE);
  const index = portfolio.skills.findIndex(s => s.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Skill not found' });

  portfolio.skills[index] = {
    ...portfolio.skills[index],
    ...req.body,
    id: req.params.id,
    level: Math.min(100, Math.max(1, parseInt(req.body.level) || portfolio.skills[index].level))
  };

  writeData(PORTFOLIO_FILE, portfolio);
  broadcastUpdate('PORTFOLIO_UPDATED', { section: 'skills', skills: portfolio.skills });
  res.json({ success: true, item: portfolio.skills[index] });
});

app.delete('/api/skills/:id', requireAuth, (req, res) => {
  const portfolio = readData(PORTFOLIO_FILE);
  portfolio.skills = (portfolio.skills || []).filter(s => s.id !== req.params.id);
  writeData(PORTFOLIO_FILE, portfolio);
  broadcastUpdate('PORTFOLIO_UPDATED', { section: 'skills', skills: portfolio.skills });
  res.json({ success: true });
});

// Bulk update / reorder skills
app.put('/api/skills', requireAuth, (req, res) => {
  const portfolio = readData(PORTFOLIO_FILE);
  if (Array.isArray(req.body.skills)) {
    portfolio.skills = req.body.skills;
    writeData(PORTFOLIO_FILE, portfolio);
    broadcastUpdate('PORTFOLIO_UPDATED', { section: 'skills', skills: portfolio.skills });
  }
  res.json({ success: true, skills: portfolio.skills });
});

// ==================== PROJECTS CRUD ====================
app.post('/api/projects', requireAuth, (req, res) => {
  const portfolio = readData(PORTFOLIO_FILE);
  if (!portfolio.projects) portfolio.projects = [];

  const newProject = {
    id: 'proj_' + Date.now(),
    title: req.body.title || 'Untitled Project',
    category: req.body.category || 'Web App',
    shortDesc: req.body.shortDesc || '',
    fullDesc: req.body.fullDesc || '',
    image: req.body.image || './uploads/project_saas.jpg',
    tags: Array.isArray(req.body.tags) ? req.body.tags : (req.body.tags || '').split(',').map(t => t.trim()).filter(Boolean),
    liveUrl: req.body.liveUrl || '',
    githubUrl: req.body.githubUrl || '',
    featured: Boolean(req.body.featured),
    metrics: req.body.metrics || '',
    date: req.body.date || new Date().getFullYear().toString()
  };

  portfolio.projects.unshift(newProject);
  writeData(PORTFOLIO_FILE, portfolio);
  broadcastUpdate('PORTFOLIO_UPDATED', { section: 'projects', projects: portfolio.projects });
  res.json({ success: true, item: newProject });
});

app.put('/api/projects/:id', requireAuth, (req, res) => {
  const portfolio = readData(PORTFOLIO_FILE);
  const index = portfolio.projects.findIndex(p => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Project not found' });

  const tags = Array.isArray(req.body.tags)
    ? req.body.tags
    : (typeof req.body.tags === 'string' ? req.body.tags.split(',').map(t => t.trim()).filter(Boolean) : portfolio.projects[index].tags);

  portfolio.projects[index] = {
    ...portfolio.projects[index],
    ...req.body,
    id: req.params.id,
    tags,
    featured: Boolean(req.body.featured)
  };

  writeData(PORTFOLIO_FILE, portfolio);
  broadcastUpdate('PORTFOLIO_UPDATED', { section: 'projects', projects: portfolio.projects });
  res.json({ success: true, item: portfolio.projects[index] });
});

app.delete('/api/projects/:id', requireAuth, (req, res) => {
  const portfolio = readData(PORTFOLIO_FILE);
  portfolio.projects = (portfolio.projects || []).filter(p => p.id !== req.params.id);
  writeData(PORTFOLIO_FILE, portfolio);
  broadcastUpdate('PORTFOLIO_UPDATED', { section: 'projects', projects: portfolio.projects });
  res.json({ success: true });
});

// ==================== CERTIFICATES CRUD ====================
app.post('/api/certificates', requireAuth, (req, res) => {
  const portfolio = readData(PORTFOLIO_FILE);
  if (!portfolio.certificates) portfolio.certificates = [];

  const newCert = {
    id: 'cert_' + Date.now(),
    title: req.body.title || 'Professional Certificate',
    issuer: req.body.issuer || 'Issuing Authority',
    issueDate: req.body.issueDate || '2025',
    credentialId: req.body.credentialId || '',
    credentialUrl: req.body.credentialUrl || '',
    image: req.body.image || './uploads/cert_cloud.jpg'
  };

  portfolio.certificates.unshift(newCert);
  writeData(PORTFOLIO_FILE, portfolio);
  broadcastUpdate('PORTFOLIO_UPDATED', { section: 'certificates', certificates: portfolio.certificates });
  res.json({ success: true, item: newCert });
});

app.put('/api/certificates/:id', requireAuth, (req, res) => {
  const portfolio = readData(PORTFOLIO_FILE);
  const index = portfolio.certificates.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Certificate not found' });

  portfolio.certificates[index] = {
    ...portfolio.certificates[index],
    ...req.body,
    id: req.params.id
  };

  writeData(PORTFOLIO_FILE, portfolio);
  broadcastUpdate('PORTFOLIO_UPDATED', { section: 'certificates', certificates: portfolio.certificates });
  res.json({ success: true, item: portfolio.certificates[index] });
});

app.delete('/api/certificates/:id', requireAuth, (req, res) => {
  const portfolio = readData(PORTFOLIO_FILE);
  portfolio.certificates = (portfolio.certificates || []).filter(c => c.id !== req.params.id);
  writeData(PORTFOLIO_FILE, portfolio);
  broadcastUpdate('PORTFOLIO_UPDATED', { section: 'certificates', certificates: portfolio.certificates });
  res.json({ success: true });
});

// ==================== RESUME CRUD ====================
app.put('/api/resume', requireAuth, (req, res) => {
  const portfolio = readData(PORTFOLIO_FILE);
  if (!portfolio.resume) portfolio.resume = { experience: [], education: [] };

  if (req.body.downloadUrl !== undefined) {
    portfolio.resume.downloadUrl = req.body.downloadUrl;
    if (portfolio.home) {
      portfolio.home.resumeLink = req.body.downloadUrl;
    }
  }
  if (req.body.summary !== undefined) portfolio.resume.summary = req.body.summary;

  writeData(PORTFOLIO_FILE, portfolio);
  broadcastUpdate('PORTFOLIO_UPDATED', { section: 'resume', resume: portfolio.resume });
  res.json({ success: true, data: portfolio.resume });
});

// Experience CRUD
app.post('/api/resume/experience', requireAuth, (req, res) => {
  const portfolio = readData(PORTFOLIO_FILE);
  if (!portfolio.resume) portfolio.resume = { experience: [], education: [] };
  if (!portfolio.resume.experience) portfolio.resume.experience = [];

  const achievements = Array.isArray(req.body.achievements)
    ? req.body.achievements
    : (typeof req.body.achievements === 'string'
        ? req.body.achievements.split('\n').map(a => a.replace(/^[•*-]\s*/, '').trim()).filter(Boolean)
        : []);

  const newExp = {
    id: 'exp_' + Date.now(),
    role: req.body.role || 'Job Role',
    company: req.body.company || 'Company',
    location: req.body.location || '',
    period: req.body.period || '2024 - Present',
    description: req.body.description || '',
    achievements
  };

  portfolio.resume.experience.unshift(newExp);
  writeData(PORTFOLIO_FILE, portfolio);
  broadcastUpdate('PORTFOLIO_UPDATED', { section: 'resume', resume: portfolio.resume });
  res.json({ success: true, item: newExp });
});

app.put('/api/resume/experience/:id', requireAuth, (req, res) => {
  const portfolio = readData(PORTFOLIO_FILE);
  if (!portfolio.resume || !portfolio.resume.experience) return res.status(404).json({ error: 'Not found' });
  const index = portfolio.resume.experience.findIndex(e => e.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Experience item not found' });

  const achievements = req.body.achievements !== undefined
    ? (Array.isArray(req.body.achievements)
        ? req.body.achievements
        : req.body.achievements.split('\n').map(a => a.replace(/^[•*-]\s*/, '').trim()).filter(Boolean))
    : portfolio.resume.experience[index].achievements;

  portfolio.resume.experience[index] = {
    ...portfolio.resume.experience[index],
    ...req.body,
    id: req.params.id,
    achievements
  };

  writeData(PORTFOLIO_FILE, portfolio);
  broadcastUpdate('PORTFOLIO_UPDATED', { section: 'resume', resume: portfolio.resume });
  res.json({ success: true, item: portfolio.resume.experience[index] });
});

app.delete('/api/resume/experience/:id', requireAuth, (req, res) => {
  const portfolio = readData(PORTFOLIO_FILE);
  if (portfolio.resume && portfolio.resume.experience) {
    portfolio.resume.experience = portfolio.resume.experience.filter(e => e.id !== req.params.id);
    writeData(PORTFOLIO_FILE, portfolio);
    broadcastUpdate('PORTFOLIO_UPDATED', { section: 'resume', resume: portfolio.resume });
  }
  res.json({ success: true });
});

// Education CRUD
app.post('/api/resume/education', requireAuth, (req, res) => {
  const portfolio = readData(PORTFOLIO_FILE);
  if (!portfolio.resume) portfolio.resume = { experience: [], education: [] };
  if (!portfolio.resume.education) portfolio.resume.education = [];

  const newEdu = {
    id: 'edu_' + Date.now(),
    degree: req.body.degree || 'Degree / Major',
    institution: req.body.institution || 'University / Institution',
    period: req.body.period || '2020 - 2024',
    details: req.body.details || ''
  };

  portfolio.resume.education.unshift(newEdu);
  writeData(PORTFOLIO_FILE, portfolio);
  broadcastUpdate('PORTFOLIO_UPDATED', { section: 'resume', resume: portfolio.resume });
  res.json({ success: true, item: newEdu });
});

app.put('/api/resume/education/:id', requireAuth, (req, res) => {
  const portfolio = readData(PORTFOLIO_FILE);
  if (!portfolio.resume || !portfolio.resume.education) return res.status(404).json({ error: 'Not found' });
  const index = portfolio.resume.education.findIndex(e => e.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Education item not found' });

  portfolio.resume.education[index] = {
    ...portfolio.resume.education[index],
    ...req.body,
    id: req.params.id
  };

  writeData(PORTFOLIO_FILE, portfolio);
  broadcastUpdate('PORTFOLIO_UPDATED', { section: 'resume', resume: portfolio.resume });
  res.json({ success: true, item: portfolio.resume.education[index] });
});

app.delete('/api/resume/education/:id', requireAuth, (req, res) => {
  const portfolio = readData(PORTFOLIO_FILE);
  if (portfolio.resume && portfolio.resume.education) {
    portfolio.resume.education = portfolio.resume.education.filter(e => e.id !== req.params.id);
    writeData(PORTFOLIO_FILE, portfolio);
    broadcastUpdate('PORTFOLIO_UPDATED', { section: 'resume', resume: portfolio.resume });
  }
  res.json({ success: true });
});

// ==================== CONTACT INFO ====================
app.put('/api/contact', requireAuth, (req, res) => {
  const portfolio = readData(PORTFOLIO_FILE);
  portfolio.contact = {
    ...portfolio.contact,
    ...req.body
  };

  // Synchronize home.socialLinks if socials array provided
  if (req.body.socials && Array.isArray(req.body.socials)) {
    if (!portfolio.home) portfolio.home = {};
    portfolio.home.socialLinks = req.body.socials.map(s => ({
      platform: s.platform || 'Link',
      url: s.url || '#',
      icon: (s.platform || 'link').toLowerCase()
    }));
  }

  writeData(PORTFOLIO_FILE, portfolio);
  broadcastUpdate('PORTFOLIO_UPDATED', { section: 'contact', contact: portfolio.contact });
  res.json({ success: true, contact: portfolio.contact });
});

// ==================== MESSAGES / INBOX ====================
// Public contact form submission
app.post('/api/messages', (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Please provide your name, email, and message.' });
  }

  let messages = readData(MESSAGES_FILE, []);
  if (!Array.isArray(messages)) messages = [];

  const newMsg = {
    id: 'msg_' + Date.now(),
    name: name.trim(),
    email: email.trim(),
    subject: (subject || 'General Inquiry').trim(),
    message: message.trim(),
    createdAt: new Date().toISOString(),
    read: false
  };

  messages.unshift(newMsg);
  writeData(MESSAGES_FILE, messages);

  // Notify admin dashboard in real-time
  broadcastUpdate('NEW_MESSAGE', { message: newMsg });

  res.status(201).json({ success: true, message: 'Message sent successfully! Rohit will get back to you soon.' });
});

// Admin inbox routes
app.get('/api/messages', requireAuth, (req, res) => {
  let messages = readData(MESSAGES_FILE, []);
  if (!Array.isArray(messages)) messages = [];
  res.json(messages);
});

app.patch('/api/messages/:id/read', requireAuth, (req, res) => {
  let messages = readData(MESSAGES_FILE, []);
  if (!Array.isArray(messages)) messages = [];
  const msg = messages.find(m => m.id === req.params.id);
  if (msg) {
    msg.read = true;
    writeData(MESSAGES_FILE, messages);
  }
  res.json({ success: true });
});

app.delete('/api/messages/:id', requireAuth, (req, res) => {
  let messages = readData(MESSAGES_FILE, []);
  if (!Array.isArray(messages)) messages = [];
  messages = messages.filter(m => m.id !== req.params.id);
  writeData(MESSAGES_FILE, messages);
  res.json({ success: true });
});

// ==================== BACKUP & RESET ====================
app.get('/api/export', requireAuth, (req, res) => {
  const data = readData(PORTFOLIO_FILE);
  res.setHeader('Content-Disposition', 'attachment; filename=portfolio_backup.json');
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(data, null, 2));
});

app.post('/api/import', requireAuth, (req, res) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Invalid portfolio data JSON' });
  }
  writeData(PORTFOLIO_FILE, req.body);
  broadcastUpdate('PORTFOLIO_UPDATED', { section: 'all' });
  res.json({ success: true, message: 'Portfolio imported successfully' });
});

// Admin Route Direct (supports both /admin, /admin/, and /admin.html)
app.get(['/admin', '/admin/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Multer and Application Error Handling Middleware
app.use((err, req, res, next) => {
  if (err) {
    console.error('Server error handler caught:', err);
    const status = err.status || 400;
    return res.status(status).json({ error: err.message || 'An unexpected error occurred' });
  }
  next();
});

// Fallback to index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 Modern Portfolio & Admin Dashboard Server Running!`);
    console.log(`👉 Public Portfolio: http://localhost:${PORT}`);
    console.log(`👉 Admin Dashboard:  http://localhost:${PORT}/admin`);
    console.log(`🔑 Admin Credentials: Username: admin OR rohitxy | Password: admin123 OR rohitkundu`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
