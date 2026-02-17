const path = require("path");
const fs = require("fs");
const iconv = require("iconv-lite");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;

const APP_DIR = typeof process.pkg !== "undefined" ? path.dirname(process.execPath) : __dirname;
require("dotenv").config({ path: path.join(APP_DIR, ".env") });
const express = require("express");
const cors = require("cors");

const DATA_DIR = path.join(APP_DIR, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const USER_DATA_PATH = path.join(APP_DIR, ".user-data.json");
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "video-lan-jwt-secret-change-in-production";
const COOKIE_NAME = "token";
const REMEMBER_ME_DAYS = 30;

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  try {
    fs.accessSync(USERS_FILE);
  } catch {
    fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
  }
}

function readUsers() {
  const raw = fs.readFileSync(USERS_FILE, "utf8");
  return JSON.parse(raw);
}

function writeUsers(data) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
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
  fs.writeFileSync(USER_DATA_PATH, JSON.stringify(data), "utf8");
}

function getCurrentUserData(userId) {
  if (!userId || typeof userId !== "string") return { favorites: [], lastWatched: [] };
  const all = loadUserData();
  const user = all[userId];
  if (!user || typeof user !== "object") return { favorites: [], lastWatched: [] };
  const favorites = Array.isArray(user.favorites) ? user.favorites : [];
  const lastWatched = Array.isArray(user.lastWatched) ? user.lastWatched : [];
  return {
    favorites: favorites.slice(0, 500),
    lastWatched: lastWatched.slice(0, 10)
  };
}

function setCurrentUserData(userId, payload) {
  if (!userId || typeof userId !== "string") return;
  const all = loadUserData();
  all[userId] = {
    favorites: Array.isArray(payload.favorites) ? payload.favorites.slice(0, 500) : [],
    lastWatched: Array.isArray(payload.lastWatched) ? payload.lastWatched.slice(0, 10) : []
  };
  saveUserData(all);
}

function authFromCookie(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return { id: payload.userId, username: payload.username };
  } catch {
    return null;
  }
}

const app = express();
const PORT = 3333;

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

const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".avi", ".mov", ".webm", ".m4v", ".wmv", ".flv", ".mpeg", ".mpg"];
const MIME_BY_EXT = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".wmv": "video/x-ms-wmv",
  ".flv": "video/x-flv",
  ".mpeg": "video/mpeg",
  ".mpg": "video/mpeg"
};
const BROWSER_NATIVE = [".mp4", ".m4v", ".webm"];
ffmpeg.setFfmpegPath(ffmpegPath);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

function requireAuth(req, res, next) {
  const user = authFromCookie(req);
  if (!user) return res.status(401).json({ error: "Giriş gerekli" });
  req.user = user;
  next();
}

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "Kullanıcı adı ve şifre gerekli" });
    const trimmed = (String(username)).trim().toLowerCase();
    if (trimmed.length < 2) return res.status(400).json({ error: "Kullanıcı adı en az 2 karakter olmalı" });
    const data = readUsers();
    if (data.users.some(u => u.username.toLowerCase() === trimmed)) return res.status(400).json({ error: "Bu kullanıcı adı alınmış" });
    const hash = await bcrypt.hash(password, 10);
    const user = { id: uuidv4(), username: trimmed, passwordHash: hash };
    data.users.push(user);
    writeUsers(data);
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: REMEMBER_ME_DAYS + "d" });
    res.cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: "lax", maxAge: REMEMBER_ME_DAYS * 24 * 60 * 60 * 1000 });
    res.status(201).json({ user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Kayıt olunamadı" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password, rememberMe } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "Kullanıcı adı ve şifre gerekli" });
    const data = readUsers();
    const user = data.users.find(u => u.username.toLowerCase() === String(username).trim().toLowerCase());
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: "Kullanıcı adı veya şifre hatalı" });
    const maxAge = REMEMBER_ME_DAYS * 24 * 60 * 60 * 1000;
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: REMEMBER_ME_DAYS + "d" });
    res.cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: "lax", maxAge });
    res.json({ user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Giriş yapılamadı" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.status(204).end();
});

app.get("/api/auth/me", (req, res) => {
  const user = authFromCookie(req);
  if (!user) return res.status(401).json({ error: "Oturum açmanız gerekiyor" });
  res.json({ user: { id: user.id, username: user.username } });
});

app.get("/api/user-data", requireAuth, (req, res) => {
  const data = getCurrentUserData(req.user.id);
  res.json(data);
});

app.post("/api/user-data", requireAuth, (req, res) => {
  const favorites = req.body && req.body.favorites;
  const lastWatched = req.body && req.body.lastWatched;
  setCurrentUserData(req.user.id, {
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

function needsTranscode(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return !BROWSER_NATIVE.includes(ext);
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

  if (needsTranscode(filePath)) {
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Accept-Ranges", "none");
    res.status(200);
    ffmpeg(filePath)
      .outputOptions("-c", "copy", "-movflags", "frag_keyframe+empty_moov+default_base_moof+omit_tfhd_offset")
      .format("mp4")
      .on("error", (err) => {
        if (!res.writableEnded) {
          if (!res.headersSent) res.sendStatus(500);
          else res.end();
        }
        console.error("ffmpeg hata:", err.message);
      })
      .pipe(res, { end: true });
    return;
  }

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
const OPENSUBTITLES_API_KEY = process.env.OPENSUBTITLES_API_KEY || "";
const OPENSUBTITLES_BASE = "https://api.opensubtitles.com/api/v1";

function opensubtitlesMissing(res) {
  if (!OPENSUBTITLES_API_KEY || OPENSUBTITLES_API_KEY === "your_open_subtitles_api_key_here") {
    res.status(503).json({ error: "OpenSubtitles API anahtarı yapılandırılmamış" });
    return true;
  }
  return false;
}

app.get("/api/subtitles/search", requireAuth, async (req, res) => {
  if (opensubtitlesMissing(res)) return;
  const q = (req.query.q || req.query.query || "").trim();
  const languages = (req.query.languages || req.query.lang || "tr").trim() || "tr";
  if (!q) return res.status(400).json({ error: "Arama sorgusu (q) gerekli" });
  try {
    const url = new URL(OPENSUBTITLES_BASE + "/subtitles");
    url.searchParams.set("query", q);
    url.searchParams.set("languages", languages);
    const r = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Api-Key": OPENSUBTITLES_API_KEY,
        "Content-Type": "application/json",
        "User-Agent": "lan-video-server/1.0"
      }
    });
    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status === 429 ? 429 : 502).json({
        error: r.status === 429 ? "Çok fazla istek, lütfen bekleyin." : "OpenSubtitles arama hatası",
        details: text.slice(0, 200)
      });
    }
    const data = await r.json();
    const list = [];
    const items = Array.isArray(data.data) ? data.data : [];
    for (const item of items) {
      const att = item && item.attributes ? item.attributes : {};
      const files = Array.isArray(att.files) ? att.files : [];
      const fileId = files[0] && (files[0].file_id != null) ? files[0].file_id : (att.file_id != null ? att.file_id : null);
      if (fileId == null) continue;
      const release = att.release || att.file_name || att.filename || String(fileId);
      const lang = (att.language || att.lang || "").toLowerCase();
      list.push({
        file_id: fileId,
        release_name: release,
        language: lang,
        format: (files[0] && files[0].file_name) ? path.extname(files[0].file_name).toLowerCase() : ".srt"
      });
    }
    res.json(list);
  } catch (err) {
    console.error("OpenSubtitles search error:", err.message);
    res.status(500).json({ error: "Arama sırasında hata oluştu" });
  }
});

async function fetchSubtitleContent(fileId) {
  const url = OPENSUBTITLES_BASE + "/download";
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Api-Key": OPENSUBTITLES_API_KEY,
      "Content-Type": "application/json",
      "User-Agent": "lan-video-server/1.0"
    },
    body: JSON.stringify({ file_id: Number(fileId) })
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(r.status + " " + text.slice(0, 200));
  }
  const contentType = (r.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    const data = await r.json();
    const link = data && (data.link != null ? data.link : data.url);
    if (link) {
      const r2 = await fetch(link, { headers: { "User-Agent": "lan-video-server/1.0" } });
      if (!r2.ok) throw new Error("Download link failed " + r2.status);
      return await r2.text();
    }
    if (typeof data.content === "string") return data.content;
    if (data.data && typeof data.data.content === "string") return data.data.content;
  } else {
    return await r.text();
  }
  throw new Error("Altyazı içeriği alınamadı");
}

app.get("/api/subtitles/download", requireAuth, async (req, res) => {
  if (opensubtitlesMissing(res)) return;
  const fileId = req.query.file_id;
  if (fileId == null || fileId === "") return res.status(400).json({ error: "file_id gerekli" });
  try {
    const content = await fetchSubtitleContent(fileId);
    const isVtt = /^\s*WEBVTT\b/m.test(content);
    res.setHeader("Content-Type", "text/vtt; charset=utf-8");
    res.send(isVtt ? content : srtToVtt(content));
  } catch (err) {
    console.error("OpenSubtitles download error:", err.message);
    res.status(err.message.startsWith("429") ? 429 : 502).json({ error: "Altyazı indirilemedi" });
  }
});

app.get("/api/subtitles/save", requireAuth, async (req, res) => {
  if (opensubtitlesMissing(res)) return;
  const fileId = req.query.file_id;
  const rawVideoPath = (req.query.videoPath || "").replace(/\\/g, "/").trim();
  if (fileId == null || fileId === "" || !rawVideoPath) {
    return res.status(400).json({ error: "file_id ve videoPath gerekli" });
  }
  const parts = rawVideoPath.split("/").filter(Boolean);
  if (parts.length === 0) return res.status(400).json({ error: "Geçersiz videoPath" });
  const rootIndex = parseInt(parts[0], 10);
  if (isNaN(rootIndex) || rootIndex < 0 || rootIndex >= VIDEO_ROOTS.length) {
    return res.status(400).json({ error: "Geçersiz video kökü" });
  }
  const rootDir = VIDEO_ROOTS[rootIndex].path;
  const innerPath = path.normalize(parts.slice(1).join(path.sep)).replace(/\\/g, "/");
  const videoFilePath = path.resolve(rootDir, innerPath);
  if (!videoFilePath.startsWith(path.resolve(rootDir))) return res.status(400).json({ error: "Geçersiz videoPath" });
  const targetDir = path.dirname(videoFilePath);
  const videoBaseName = path.basename(videoFilePath, path.extname(videoFilePath));
  const srtPath = path.join(targetDir, videoBaseName + ".srt");
  try {
    const content = await fetchSubtitleContent(fileId);
    const isVtt = /^\s*WEBVTT\b/m.test(content);
    const toWrite = isVtt ? vttToSrt(content) : content;
    fs.writeFileSync(srtPath, toWrite, "utf8");
    const rel = path.relative(rootDir, srtPath).replace(/\\/g, "/");
    res.json({ path: String(rootIndex) + "/" + rel });
  } catch (err) {
    console.error("OpenSubtitles save error:", err.message);
    res.status(err.message.startsWith("429") ? 429 : 502).json({ error: "Altyazı kaydedilemedi" });
  }
});

function vttToSrt(vtt) {
  return vtt
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/^WEBVTT\s*\n*/i, "")
    .replace(/(\d{2}:\d{2}:\d{2})\.(\d{3})/g, "$1,$2")
    .trim();
}

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

function srtToVtt(srt) {
  const vtt = srt
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/^\d+\s*\n/gm, "")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return "WEBVTT\n\n" + vtt.trim() + "\n";
}

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
  res.setHeader("Content-Type", "text/vtt; charset=utf-8");
  try {
    let raw = null;
    if (ext === ".vtt") {
      raw = readSubtitleFileUtf8OrCp1254(filePath);
      res.send(raw);
    } else if (ext === ".srt") {
      raw = readSubtitleFileUtf8OrCp1254(filePath);
      res.send(srtToVtt(raw));
    } else {
      return res.sendStatus(400);
    }
  } catch (err) {
    res.sendStatus(500);
  }
});

function readSubtitleFileUtf8OrCp1254(filePath) {
  const buf = fs.readFileSync(filePath);
  let text = buf.toString("utf8");
  if (text.length && text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  if (!/\uFFFD/.test(text)) return text;
  if (iconv.encodingExists("win1254")) {
    const decoded = iconv.decode(buf, "win1254");
    if (decoded && !/\uFFFD/.test(decoded)) return decoded;
  }
  return text;
}

app.listen(PORT, "0.0.0.0", () => {
  ensureDirs();
  VIDEO_ROOTS.forEach((r, i) => {
    if (!fs.existsSync(r.path)) {
      fs.mkdirSync(r.path, { recursive: true });
      console.log(`[${r.name}] klasörü oluşturuldu: ${r.path}`);
    }
  });
  console.log(`Server çalışıyor → http://0.0.0.0:${PORT}`);
});
