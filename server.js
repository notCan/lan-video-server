const path = require("path");
const crypto = require("crypto");

const APP_DIR = typeof process.pkg !== "undefined" ? path.dirname(process.execPath) : __dirname;
require("dotenv").config({ path: path.join(APP_DIR, ".env") });
const express = require("express");
const fs = require("fs");
const cors = require("cors");
const session = require("express-session");

const REMEMBER_TOKENS_PATH = path.join(APP_DIR, ".remember-tokens.json");
const USER_DATA_PATH = path.join(APP_DIR, ".user-data.json");
const REMEMBER_TOKEN_DAYS = 30;

function loadRememberTokens() {
  try {
    const raw = fs.readFileSync(REMEMBER_TOKENS_PATH, "utf8");
    const data = JSON.parse(raw);
    return typeof data === "object" && data !== null ? data : {};
  } catch (e) {
    return {};
  }
}

function saveRememberTokens(tokens) {
  try {
    fs.writeFileSync(REMEMBER_TOKENS_PATH, JSON.stringify(tokens), "utf8");
  } catch (e) {}
}

function createRememberToken() {
  const tokens = loadRememberTokens();
  const now = Date.now();
  const expire = now + REMEMBER_TOKEN_DAYS * 24 * 60 * 60 * 1000;
  for (const t of Object.keys(tokens)) {
    if (tokens[t].expire < now) delete tokens[t];
  }
  const token = crypto.randomBytes(32).toString("hex");
  tokens[token] = { expire };
  saveRememberTokens(tokens);
  return token;
}

function validateRememberToken(token) {
  if (!token || typeof token !== "string") return false;
  const tokens = loadRememberTokens();
  const now = Date.now();
  const ent = tokens[token];
  return !!(ent && ent.expire >= now);
}

function revokeRememberToken(token) {
  if (!token || typeof token !== "string") return;
  const tokens = loadRememberTokens();
  delete tokens[token];
  saveRememberTokens(tokens);
}

function loadUserData() {
  try {
    const raw = fs.readFileSync(USER_DATA_PATH, "utf8");
    const data = JSON.parse(raw);
    return typeof data === "object" && data !== null ? data : {};
  } catch (e) {
    return {};
  }
}

function saveUserData(data) {
  try {
    fs.writeFileSync(USER_DATA_PATH, JSON.stringify(data), "utf8");
  } catch (e) {}
}

function getCurrentUserData(username) {
  if (!username || typeof username !== "string") return { favorites: [], lastWatched: [] };
  const all = loadUserData();
  const user = all[username];
  if (!user || typeof user !== "object") return { favorites: [], lastWatched: [] };
  const favorites = Array.isArray(user.favorites) ? user.favorites : [];
  const lastWatched = Array.isArray(user.lastWatched) ? user.lastWatched : [];
  return {
    favorites: favorites.slice(0, 500),
    lastWatched: lastWatched.slice(0, 10)
  };
}

function setCurrentUserData(username, payload) {
  if (!username || typeof username !== "string") return;
  const all = loadUserData();
  all[username] = {
    favorites: Array.isArray(payload.favorites) ? payload.favorites.slice(0, 500) : [],
    lastWatched: Array.isArray(payload.lastWatched) ? payload.lastWatched.slice(0, 10) : []
  };
  saveUserData(all);
}

const app = express();
const PORT = 3366;

const LOGIN_USER = (process.env.LOGIN_USERNAME || process.env.USERNAME || "").trim();
const LOGIN_PASS = (process.env.LOGIN_PASSWORD || process.env.PASSWORD || "").trim();
if (!LOGIN_USER || !LOGIN_PASS) {
  console.error(".env dosyasında USERNAME ve PASSWORD (veya LOGIN_USERNAME ve LOGIN_PASSWORD) tanımlı olmalı.");
  process.exit(1);
}

const CONFIG_PATH = path.join(APP_DIR, "config.json");

function loadVideoDirs() {
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  const config = JSON.parse(raw);
  if (!Array.isArray(config.videoDirs) || config.videoDirs.length === 0) {
    throw new Error("config.json içinde en az bir videoDirs girişi olmalı");
  }
  return config.videoDirs.map((d, i) => ({
    name: d.name || "Klasör " + (i + 1),
    path: path.isAbsolute(d.path) ? d.path : path.resolve(APP_DIR, d.path)
  }));
}

let VIDEO_ROOTS = [];
try {
  VIDEO_ROOTS = loadVideoDirs();
} catch (err) {
  console.error("config.json okunamadı:", err.message);
  process.exit(1);
}

const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".avi", ".mov", ".webm"];
const MIME_BY_EXT = {
  ".mp4": "video/mp4",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".mov": "video/quicktime",
  ".webm": "video/webm"
};

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "video-lan-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: "lax"
    }
  })
);

app.use((req, res, next) => {
  const payload = {
    method: req.method,
    url: req.originalUrl || req.url,
    query: req.query && Object.keys(req.query).length ? req.query : undefined
  };
  if (req.body && typeof req.body === "object" && Object.keys(req.body).length) {
    const body = { ...req.body };
    if (body.password !== undefined) body.password = "[REDACTED]";
    if (body.token !== undefined) body.token = body.token ? "[REDACTED]" : "";
    payload.body = body;
  }
  next();
});

app.use(express.static(path.join(__dirname, "public")));

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.status(401).json({ error: "Giriş gerekli" });
}

app.post("/api/login", (req, res) => {
  const username = (req.body && req.body.username != null ? String(req.body.username) : "").trim();
  const password = (req.body && req.body.password != null ? String(req.body.password) : "").trim();
  const rememberMe = !!(req.body && req.body.rememberMe);
  if (username === LOGIN_USER && password === LOGIN_PASS) {
    req.session.user = username;
    if (rememberMe) {
      const token = createRememberToken();
      return res.json({ ok: true, token });
    }
    return res.json({ ok: true });
  }
  res.status(401).json({ error: "Kullanıcı adı veya şifre hatalı" });
});

app.post("/api/restore-session", (req, res) => {
  const token = (req.body && req.body.token != null ? String(req.body.token) : "").trim();
  if (!validateRememberToken(token)) {
    return res.status(401).json({ error: "Geçersiz veya süresi dolmuş token" });
  }
  req.session.user = LOGIN_USER;
  res.json({ ok: true });
});

app.get("/api/auth-check", (req, res) => {
  if (req.session && req.session.user) return res.json({ ok: true });
  res.status(401).json({ error: "Giriş gerekli" });
});

app.post("/api/logout", (req, res) => {
  const token = (req.body && req.body.token != null ? String(req.body.token) : "").trim();
  if (token) revokeRememberToken(token);
  req.session.destroy(() => {});
  res.json({ ok: true });
});

app.get("/api/user-data", requireAuth, (req, res) => {
  const data = getCurrentUserData(req.session.user);
  res.json(data);
});

app.post("/api/user-data", requireAuth, (req, res) => {
  const favorites = req.body && req.body.favorites;
  const lastWatched = req.body && req.body.lastWatched;
  setCurrentUserData(req.session.user, {
    favorites: Array.isArray(favorites) ? favorites : [],
    lastWatched: Array.isArray(lastWatched) ? lastWatched : []
  });
  res.json({ ok: true });
});

/* ================================
   NESTED KLASÖR + VIDEO LİSTESİ
================================ */
app.get("/api/tree", requireAuth, (req, res) => {
  const rawPath = (req.query.path || "").replace(/\\/g, "/").trim();
  const parts = rawPath ? rawPath.split("/").filter(Boolean) : [];

  if (parts.length === 0) {
    const roots = VIDEO_ROOTS.map((r, i) => ({
      name: r.name,
      type: "root",
      id: String(i)
    }));
    return res.json(roots);
  }

  const rootIndex = parseInt(parts[0], 10);
  if (isNaN(rootIndex) || rootIndex < 0 || rootIndex >= VIDEO_ROOTS.length) {
    return res.status(400).json({ error: "Geçersiz kök dizin" });
  }

  const rootDir = VIDEO_ROOTS[rootIndex].path;
  const innerPath = path.normalize(parts.slice(1).join(path.sep)).replace(/\\/g, "/");
  const absPath = path.resolve(rootDir, innerPath);

  if (!absPath.startsWith(path.resolve(rootDir))) {
    return res.sendStatus(403);
  }

  try {
    const items = fs.readdirSync(absPath, { withFileTypes: true })
      .filter(e =>
        e.isDirectory() ||
        VIDEO_EXTENSIONS.includes(path.extname(e.name).toLowerCase())
      )
      .map(e => ({
        name: e.name,
        type: e.isDirectory() ? "folder" : "file"
      }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });

    res.json(items);
  } catch (err) {
    res.status(500).json({ error: "Klasör okunamadı" });
  }
});

/* ================================
   VIDEO STREAM (RANGE DESTEKLİ)
================================ */
function getVideoMime(filePath) {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] || "video/mp4";
}

app.get("/video", requireAuth, (req, res) => {
  const rawPath = (req.query.file || "").replace(/\\/g, "/").trim();
  const parts = rawPath.split("/").filter(Boolean);
  if (parts.length === 0) {
    return res.sendStatus(400);
  }
  const rootIndex = parseInt(parts[0], 10);
  if (isNaN(rootIndex) || rootIndex < 0 || rootIndex >= VIDEO_ROOTS.length) {
    return res.sendStatus(400);
  }
  const rootDir = VIDEO_ROOTS[rootIndex].path;
  const innerPath = path.normalize(parts.slice(1).join(path.sep)).replace(/\\/g, "/");
  const filePath = path.resolve(rootDir, innerPath);

  if (!filePath.startsWith(path.resolve(rootDir))) {
    return res.sendStatus(403);
  }

  if (!fs.existsSync(filePath)) {
    return res.sendStatus(404);
  }

  const stat = fs.statSync(filePath);
  const range = req.headers.range;

  if (!range) {
    res.status(416).send("Range header gerekli");
    return;
  }

  const match = range.match(/bytes=(\d+)-(\d*)/);
  if (!match) {
    res.status(416).send("Geçersiz Range");
    return;
  }
  const start = parseInt(match[1], 10);
  const requestedEnd = match[2] ? parseInt(match[2], 10) : null;
  const CHUNK_SIZE = 1024 * 1024;
  const end =
    requestedEnd != null
      ? Math.min(requestedEnd, stat.size - 1)
      : Math.min(start + CHUNK_SIZE - 1, stat.size - 1);

  res.writeHead(206, {
    "Content-Range": `bytes ${start}-${end}/${stat.size}`,
    "Accept-Ranges": "bytes",
    "Content-Length": end - start + 1,
    "Content-Type": getVideoMime(filePath)
  });

  fs.createReadStream(filePath, { start, end }).pipe(res);
});

const SUBTITLE_EXTENSIONS = [".vtt", ".srt"];

app.get("/api/subtitles", requireAuth, (req, res) => {
  const rawPath = (req.query.file || "").replace(/\\/g, "/").trim();
  const parts = rawPath.split("/").filter(Boolean);
  if (parts.length === 0) return res.json([]);
  const rootIndex = parseInt(parts[0], 10);
  if (isNaN(rootIndex) || rootIndex < 0 || rootIndex >= VIDEO_ROOTS.length) {
    return res.json([]);
  }
  const rootDir = VIDEO_ROOTS[rootIndex].path;
  const innerPath = path.normalize(parts.slice(1).join(path.sep)).replace(/\\/g, "/");
  const filePath = path.resolve(rootDir, innerPath);
  if (!filePath.startsWith(path.resolve(rootDir))) return res.json([]);
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  try {
    const files = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isFile() && e.name.startsWith(base + "."))
      .filter(e => SUBTITLE_EXTENSIONS.includes(path.extname(e.name).toLowerCase()))
      .map(e => {
        const rel = path.relative(rootDir, path.join(dir, e.name)).replace(/\\/g, "/");
        return { name: e.name, path: String(rootIndex) + "/" + rel };
      });
    res.json(files);
  } catch (err) {
    res.json([]);
  }
});

app.get("/subtitle", requireAuth, (req, res) => {
  const rawPath = (req.query.file || "").replace(/\\/g, "/").trim();
  const parts = rawPath.split("/").filter(Boolean);
  if (parts.length === 0) return res.sendStatus(400);
  const rootIndex = parseInt(parts[0], 10);
  if (isNaN(rootIndex) || rootIndex < 0 || rootIndex >= VIDEO_ROOTS.length) {
    return res.sendStatus(400);
  }
  const rootDir = VIDEO_ROOTS[rootIndex].path;
  const innerPath = path.normalize(parts.slice(1).join(path.sep)).replace(/\\/g, "/");
  const filePath = path.resolve(rootDir, innerPath);
  if (!filePath.startsWith(path.resolve(rootDir)) || !fs.existsSync(filePath)) {
    return res.sendStatus(404);
  }
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === ".vtt" ? "text/vtt" : "text/plain";
  res.setHeader("Content-Type", mime);
  fs.createReadStream(filePath).pipe(res);
});

app.listen(PORT, "0.0.0.0", () => {
  VIDEO_ROOTS.forEach((r, i) => {
    if (!fs.existsSync(r.path)) {
      fs.mkdirSync(r.path, { recursive: true });
      console.log(`[${r.name}] klasörü oluşturuldu: ${r.path}`);
    }
  });
  console.log(`Server çalışıyor → http://0.0.0.0:${PORT}`);
});
