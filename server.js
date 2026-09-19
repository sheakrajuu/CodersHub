const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'content.json');
const AUTH_FILE = path.join(__dirname, 'data', 'admin-auth.json');
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || '';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';

app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- storage helpers ----------
function loadData() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return { pictures: [], videos: [], blogs: [], links: [], mangas: [], ...data };
  } catch (e) {
    return { pictures: [], videos: [], blogs: [], links: [], mangas: [] };
  }
}
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
function id() {
  return crypto.randomBytes(6).toString('hex');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function passwordMatches(password, stored) {
  if (!stored || typeof stored.salt !== 'string' || typeof stored.hash !== 'string') return false;
  const candidate = Buffer.from(hashPassword(password, stored.salt).hash, 'hex');
  const expected = Buffer.from(stored.hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function isStrongPassword(password) {
  return typeof password === 'string'
    && password.length >= 12
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z\d]/.test(password);
}

function loadAuth() {
  const resetPassword = process.env.ADMIN_PASSWORD_RESET === 'true';
  if (resetPassword && process.env.ADMIN_PASSWORD) {
    const auth = hashPassword(process.env.ADMIN_PASSWORD);
    fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2), { mode: 0o600 });
    console.warn('[CodersHub] Admin password reset from ADMIN_PASSWORD. Remove ADMIN_PASSWORD_RESET after signing in.');
    return auth;
  }
  try {
    return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  } catch (error) {
    const initialPassword = process.env.ADMIN_PASSWORD;
    if (!initialPassword) {
      throw new Error('ADMIN_PASSWORD must be set the first time the server starts.');
    }
    if (!isStrongPassword(initialPassword)) {
      throw new Error('ADMIN_PASSWORD must be 12+ characters and include uppercase, lowercase, a number, and a symbol.');
    }
    const auth = hashPassword(initialPassword);
    fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2), { mode: 0o600 });
    return auth;
  }
}

let adminAuth;
try {
  adminAuth = loadAuth();
} catch (error) {
  console.error(`[CodersHub] ${error.message}`);
  process.exit(1);
}

// ---------- admin auth (single-user, token in memory) ----------
const sessions = new Set();
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token && sessions.has(token)) return next();
  return res.status(401).json({ error: 'Not authorized. Please log in again.' });
}

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (typeof password === 'string' && passwordMatches(password, adminAuth)) {
    const token = crypto.randomBytes(24).toString('hex');
    sessions.add(token);
    return res.json({ token });
  }
  return res.status(401).json({ error: 'Wrong password.' });
});

app.post('/api/admin/password', requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || !passwordMatches(currentPassword, adminAuth)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({ error: 'Use 12+ characters with uppercase, lowercase, a number, and a symbol.' });
  }

  const nextAuth = hashPassword(newPassword);
  fs.writeFileSync(AUTH_FILE, JSON.stringify(nextAuth, null, 2), { mode: 0o600 });
  adminAuth = nextAuth;
  sessions.clear();
  res.json({ ok: true });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  sessions.delete(req.headers['x-admin-token']);
  res.json({ ok: true });
});

// ---------- public read ----------
app.get('/api/content', (req, res) => {
  res.json(loadData());
});

// ---------- video embed helper ----------
function toEmbed(url) {
  url = url.trim();
  // raw iframe pasted in
  const iframeMatch = url.match(/<iframe[^>]*src=["']([^"']+)["']/i);
  if (iframeMatch) return iframeMatch[1];

  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;

  const vim = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vim) return `https://player.vimeo.com/video/${vim[1]}`;

  // already an embed-style url or unknown platform - use as-is
  return url;
}

// ---------- pictures ----------
app.post('/api/admin/pictures', requireAdmin, (req, res) => {
  const { urls, caption } = req.body || {};
  if (!urls || !String(urls).trim()) return res.status(400).json({ error: 'Give at least one image URL.' });
  const list = Array.isArray(urls)
    ? urls.map(url => String(url).trim()).filter(Boolean)
    : String(urls).split(/[\n,]/).map(u => u.trim()).filter(Boolean);
  const data = loadData();
  const added = [{
    id: id(),
    url: list[0],
    images: list,
    caption: caption || '',
    addedAt: Date.now()
  }];
  data.pictures.unshift(...added);
  saveData(data);
  res.json({ added });
});
app.delete('/api/admin/pictures/:id', requireAdmin, (req, res) => {
  const data = loadData();
  data.pictures = data.pictures.filter(p => p.id !== req.params.id);
  saveData(data);
  res.json({ ok: true });
});

// ---------- videos ----------
app.post('/api/admin/videos', requireAdmin, (req, res) => {
  const { url, title } = req.body || {};
  if (!url || !url.trim()) return res.status(400).json({ error: 'Give a video URL or embed code.' });
  const embed = toEmbed(url);
  const data = loadData();
  const entry = { id: id(), embed, title: title || '', addedAt: Date.now() };
  data.videos.unshift(entry);
  saveData(data);
  res.json({ added: entry });
});
app.delete('/api/admin/videos/:id', requireAdmin, (req, res) => {
  const data = loadData();
  data.videos = data.videos.filter(v => v.id !== req.params.id);
  saveData(data);
  res.json({ ok: true });
});

// ---------- blog ----------
app.post('/api/admin/blogs', requireAdmin, (req, res) => {
  const { title, body, imageUrls } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'A post needs a title.' });
  const data = loadData();
  const images = Array.isArray(imageUrls)
    ? imageUrls.map(url => String(url).trim()).filter(Boolean)
    : String(imageUrls || '').split(/[\n,]/).map(url => url.trim()).filter(Boolean);
  const entry = { id: id(), title, body: body || '', images, addedAt: Date.now() };
  data.blogs.unshift(entry);
  saveData(data);
  res.json({ added: entry });
});
app.delete('/api/admin/blogs/:id', requireAdmin, (req, res) => {
  const data = loadData();
  data.blogs = data.blogs.filter(b => b.id !== req.params.id);
  saveData(data);
  res.json({ ok: true });
});

// ---------- links ----------
app.post('/api/admin/links', requireAdmin, (req, res) => {
  const { url, title, description } = req.body || {};
  if (!url || !url.trim()) return res.status(400).json({ error: 'Give a URL.' });
  const data = loadData();
  const entry = {
    id: id(),
    url,
    title: title || url,
    description: description || '',
    addedAt: Date.now()
  };
  data.links.unshift(entry);
  saveData(data);
  res.json({ added: entry });
});
app.delete('/api/admin/links/:id', requireAdmin, (req, res) => {
  const data = loadData();
  data.links = data.links.filter(l => l.id !== req.params.id);
  saveData(data);
  res.json({ ok: true });
});

// ---------- AI-assisted fetch (search external sources, admin reviews before adding) ----------
app.get('/api/admin/fetch/images', requireAdmin, async (req, res) => {
  const query = (req.query.query || '').trim();
  if (!query) return res.status(400).json({ error: 'Give a search term.' });
  if (!PEXELS_API_KEY) {
    return res.status(400).json({ error: 'No PEXELS_API_KEY set in the environment. Add one to enable image fetching.' });
  }
  try {
    const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=12`, {
      headers: { Authorization: PEXELS_API_KEY }
    });
    const json = await r.json();
    const results = (json.photos || []).map(p => ({
      url: p.src.large,
      thumbnail: p.src.medium,
      caption: p.alt || query,
      credit: p.photographer
    }));
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: 'Could not reach the image source right now.' });
  }
});

app.get('/api/admin/fetch/videos', requireAdmin, async (req, res) => {
  const query = (req.query.query || '').trim();
  if (!query) return res.status(400).json({ error: 'Give a search term.' });
  if (!YOUTUBE_API_KEY) {
    return res.status(400).json({ error: 'No YOUTUBE_API_KEY set in the environment. Add one to enable video fetching.' });
  }
  try {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=12&q=${encodeURIComponent(query)}&key=${YOUTUBE_API_KEY}`);
    const json = await r.json();
    const results = (json.items || []).map(v => ({
      videoId: v.id.videoId,
      embed: `https://www.youtube.com/embed/${v.id.videoId}`,
      title: v.snippet.title,
      thumbnail: v.snippet.thumbnails.medium.url
    }));
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: 'Could not reach the video source right now.' });
  }
});

app.get('/api/admin/fetch/custom', requireAdmin, async (req, res) => {
  const target = String(req.query.url || '').trim();
  if (!/^https?:\/\//i.test(target)) return res.status(400).json({ error: 'Use a full http:// or https:// API URL.' });
  try {
    const headers = { Accept: 'application/json, text/plain;q=0.9, */*;q=0.8' };
    const apiKey = req.headers['x-custom-api-key'];
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const response = await fetch(target, { headers });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch (error) { data = text; }
    if (!response.ok) return res.status(response.status).json({ error: `The API returned ${response.status}.`, data });
    res.json({ url: target, status: response.status, data });
  } catch (error) {
    res.status(502).json({ error: 'Could not reach that API from the server.' });
  }
});

app.listen(PORT, () => console.log(`[CodersHub] running on port ${PORT}`));
