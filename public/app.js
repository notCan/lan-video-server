const player = document.getElementById("player");
player.volume = 0.1;
const listEl = document.getElementById("list");
const videoTitleEl = document.getElementById("videoTitle");
const loginEl = document.getElementById("login");
const appEl = document.getElementById("app");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");

const fetchOpts = { credentials: "include" };
const RESUME_KEY = "videoServerResume";
const LAST_WATCHED_KEY = "videoServerLastWatched";
const FAVORITES_KEY = "videoServerFavorites";

let currentPath = "";
let lastWatchedExpanded = false;
let favoritesExpanded = false;
let currentVideoPath = null;
let currentVideoTitle = null;
let currentListItems = [];
let currentVideoList = [];
let currentVideoIndex = -1;
let searchQuery = "";
let searchDebounce = null;
let syncUserDataDebounce = null;
const END_BEHAVIOR_KEY = "videoServerEndBehavior";
const END_BEHAVIOR_ICONS = ["🔁✕", "🔁1", "🔁A"];
const END_BEHAVIOR_TITLES = ["Hiçbir şey", "Tekrar oynat", "Sonrakine geç"];
let endBehaviorIndex = 2;

const SUBTITLE_SETTINGS_KEY = "videoServerSubtitleSettings";
const SUBTITLE_FONT_MIN = 12;
const SUBTITLE_FONT_MAX = 36;
const SUBTITLE_WIDTH_MIN = 30;
const SUBTITLE_WIDTH_MAX = 100;
let subtitleCues = [];
let subtitleDelayMs = 0;
let subtitleOffsetX = 0;
let subtitleOffsetY = 0;
let subtitleFontSize = 18;
let subtitleWidthPct = 100;

function loadSubtitleSettings() {
  try {
    var s = localStorage.getItem(SUBTITLE_SETTINGS_KEY);
    if (s) {
      var o = JSON.parse(s);
      if (typeof o.delayMs === "number") subtitleDelayMs = o.delayMs;
      if (typeof o.offsetX === "number") subtitleOffsetX = o.offsetX;
      if (typeof o.offsetY === "number") subtitleOffsetY = o.offsetY;
      if (typeof o.fontSize === "number" && o.fontSize >= SUBTITLE_FONT_MIN && o.fontSize <= SUBTITLE_FONT_MAX) subtitleFontSize = o.fontSize;
      if (typeof o.widthPct === "number" && o.widthPct >= SUBTITLE_WIDTH_MIN && o.widthPct <= SUBTITLE_WIDTH_MAX) subtitleWidthPct = o.widthPct;
    }
  } catch (e) { }
}
function saveSubtitleSettings() {
  try {
    localStorage.setItem(SUBTITLE_SETTINGS_KEY, JSON.stringify({
      delayMs: subtitleDelayMs,
      offsetX: subtitleOffsetX,
      offsetY: subtitleOffsetY,
      fontSize: subtitleFontSize,
      widthPct: subtitleWidthPct
    }));
  } catch (e) { }
}
function updateSubtitleChips() {
  var delayChip = document.getElementById("subDelayChip");
  var fontSizeChip = document.getElementById("subFontSizeChip");
  if (delayChip) delayChip.textContent = subtitleDelayMs === 0 ? "Gecikme: 0 ms" : (subtitleDelayMs > 0 ? "+" : "") + subtitleDelayMs + " ms";
  if (fontSizeChip) fontSizeChip.textContent = "Font: " + subtitleFontSize + "px";
}

function parseVtt(vttText) {
  var cues = [];
  var lines = vttText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  var i = 0;
  while (i < lines.length && !/^\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}/.test(lines[i])) i++;
  while (i < lines.length) {
    var timeLine = lines[i];
    var m = timeLine.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
    if (!m) { i++; continue; }
    var start = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10) + parseInt(m[4], 10) / 1000;
    var end = parseInt(m[5], 10) * 3600 + parseInt(m[6], 10) * 60 + parseInt(m[7], 10) + parseInt(m[8], 10) / 1000;
    i++;
    var textLines = [];
    while (i < lines.length && lines[i].trim() !== "") {
      textLines.push(lines[i].trim());
      i++;
    }
    if (textLines.length) cues.push({ start: start, end: end, text: textLines.join("\n") });
    while (i < lines.length && lines[i].trim() === "") i++;
  }
  return cues;
}

function updateSubtitleOverlay() {
  var el = document.getElementById("subtitleOverlay");
  el.style.fontSize = subtitleFontSize + "px";
  el.style.maxWidth = subtitleWidthPct + "%";
  if (subtitleCues.length === 0) {
    el.textContent = "";
    el.style.transform = "";
    return;
  }
  var t = player.currentTime + subtitleDelayMs / 1000;
  var cue = subtitleCues.find(function (c) { return t >= c.start && t <= c.end; });
  if (cue) {
    el.textContent = cue.text;
    el.style.left = "calc(50% + " + subtitleOffsetX + "%)";
    el.style.bottom = "calc(12% + " + subtitleOffsetY + "%)";
    el.style.transform = "translateX(-50%)";
  } else {
    el.textContent = "";
  }
}

function loadEndBehavior() {
  try {
    var v = localStorage.getItem(END_BEHAVIOR_KEY);
    if (v !== null) { var n = parseInt(v, 10); if (n >= 0 && n <= 2) endBehaviorIndex = n; } else endBehaviorIndex = 2;
  } catch (e) { endBehaviorIndex = 2; }
}
function saveEndBehavior() {
  try { localStorage.setItem(END_BEHAVIOR_KEY, String(endBehaviorIndex)); } catch (e) { }
}

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ":" + String(s).padStart(2, "0");
}
function formatTimeLong(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  return m + ":" + String(s).padStart(2, "0");
}
function parseTimeInput(str) {
  const s = (str || "").trim();
  if (!s) return 0;
  const parts = s.split(":").map(p => parseInt(p, 10)).filter(n => !isNaN(n));
  if (parts.length === 1) return Math.max(0, parts[0]);
  if (parts.length === 2) return Math.max(0, parts[0] * 60 + parts[1]);
  if (parts.length >= 3) return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  return 0;
}
function syncUserDataToServer() {
  if (syncUserDataDebounce) clearTimeout(syncUserDataDebounce);
  syncUserDataDebounce = setTimeout(function () {
    syncUserDataDebounce = null;
    var payload = { favorites: getFavorites(), lastWatched: getLastWatched() };
    fetch("/api/user-data", {
      method: "POST",
      ...fetchOpts,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(function () { });
  }, 1500);
}

function getLastWatched() {
  try {
    const raw = localStorage.getItem(LAST_WATCHED_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, 10) : [];
  } catch (e) { return []; }
}
function addToLastWatched(path, title, time) {
  var arr = getLastWatched().filter(function (e) { return e.path !== path; });
  arr.unshift({ path: path, title: title, time: Math.floor(time || 0) });
  arr = arr.slice(0, 10);
  try { localStorage.setItem(LAST_WATCHED_KEY, JSON.stringify(arr)); } catch (e) { }
  syncUserDataToServer();
}
function updateLastWatchedTime(path, time) {
  var arr = getLastWatched();
  var found = arr.find(function (e) { return e.path === path; });
  if (found) { found.time = Math.floor(time || 0); try { localStorage.setItem(LAST_WATCHED_KEY, JSON.stringify(arr)); } catch (e) { } }
  syncUserDataToServer();
}
function clearLastWatched() {
  try { localStorage.removeItem(LAST_WATCHED_KEY); } catch (e) { }
  syncUserDataToServer();
  var q = (searchQuery || "").trim().toLowerCase();
  var filtered = q ? currentListItems.filter(function (i) { return i.name.toLowerCase().indexOf(q) >= 0; }) : currentListItems;
  renderListItems(filtered);
}

function getFavorites() {
  try {
    var raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    var arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}
function saveFavorites(arr) {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(arr)); } catch (e) { }
}
function isFavorite(path) {
  return getFavorites().some(function (e) { return e.path === path; });
}
function addToFavorites(path, title) {
  var arr = getFavorites().filter(function (e) { return e.path !== path; });
  arr.unshift({ path: path, title: title, time: 0 });
  saveFavorites(arr);
  syncUserDataToServer();
}
function removeFromFavorites(path) {
  saveFavorites(getFavorites().filter(function (e) { return e.path !== path; }));
  syncUserDataToServer();
}
function toggleFavorite(path, title, ev) {
  ev.preventDefault();
  ev.stopPropagation();
  if (isFavorite(path)) removeFromFavorites(path);
  else addToFavorites(path, title);
  var q = (searchQuery || "").trim().toLowerCase();
  var filtered = q ? currentListItems.filter(function (i) { return i.name.toLowerCase().indexOf(q) >= 0; }) : currentListItems;
  renderListItems(filtered);
}
function updateFavoriteTime(path, time) {
  var arr = getFavorites();
  var found = arr.find(function (e) { return e.path === path; });
  if (found) {
    found.time = Math.floor(time || 0);
    saveFavorites(arr);
    syncUserDataToServer();
  }
}
function getFavoriteTime(path) {
  var f = getFavorites().find(function (e) { return e.path === path; });
  return f && Number.isFinite(f.time) ? f.time : 0;
}

function getResumeState() {
  try {
    const raw = localStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d && typeof d.path === "string" && typeof d.title === "string" && Number.isFinite(d.time)) return d;
  } catch (e) { }
  return null;
}

function setResumeState(path, title, time) {
  try {
    localStorage.setItem(RESUME_KEY, JSON.stringify({ path, title, time: Math.floor(time) }));
  } catch (e) { }
}

function clearResumeState() {
  try { localStorage.removeItem(RESUME_KEY); } catch (e) { }
}

function showResumeBar(state) {
  const bar = document.getElementById("resumeBar");
  const text = bar.querySelector(".resume-text");
  text.innerHTML = "Kaldığınız yerden devam et: <strong>" + (state.title || "Video") + "</strong> (" + formatTime(state.time) + ")";
  bar.classList.add("visible");
}

function hideResumeBar() {
  document.getElementById("resumeBar").classList.remove("visible");
}

function showApp() {
  loginEl.classList.add("hidden");
  appEl.classList.remove("hidden");
  fetch("/api/user-data", fetchOpts)
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (data) {
        if (Array.isArray(data.favorites)) try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(data.favorites)); } catch (e) { }
        if (Array.isArray(data.lastWatched)) try { localStorage.setItem(LAST_WATCHED_KEY, JSON.stringify(data.lastWatched)); } catch (e) { }
      }
      loadList();
      var saved = getResumeState();
      if (saved) showResumeBar(saved);
      else hideResumeBar();
    })
    .catch(function () {
      loadList();
      var saved = getResumeState();
      if (saved) showResumeBar(saved);
      else hideResumeBar();
    });
}

function showLogin(msg) {
  appEl.classList.add("hidden");
  loginEl.classList.remove("hidden");
  if (msg) {
    loginError.textContent = msg;
    loginError.style.display = "block";
  } else {
    loginError.style.display = "none";
  }
}

function logout() {
  fetch("/api/auth/logout", {
    method: "POST",
    ...fetchOpts,
    headers: { "Content-Type": "application/json" }
  })
    .then(function () {
      closeVideo();
      showLogin();
    });
}

loginForm.addEventListener("submit", function (e) {
  e.preventDefault();
  loginError.style.display = "none";
  var rememberMe = document.getElementById("rememberMe").checked;
  fetch("/api/auth/login", {
    method: "POST",
    ...fetchOpts,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: document.getElementById("username").value.trim(),
      password: document.getElementById("password").value,
      rememberMe: rememberMe
    })
  })
    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
    .then(function (_ref) {
      var ok = _ref.ok, d = _ref.d;
      if (ok) { showApp(); } else { showLogin(d.error || "Giriş başarısız"); }
    })
    .catch(function () { showLogin("Bağlantı hatası"); });
});

(function initRegister() {
  var loginCard = document.getElementById("loginCard");
  var registerCard = document.getElementById("registerCard");
  var btnShowRegister = document.getElementById("btnShowRegister");
  var btnShowLogin = document.getElementById("btnShowLogin");
  var registerForm = document.getElementById("registerForm");
  var registerError = document.getElementById("registerError");
  if (btnShowRegister) btnShowRegister.addEventListener("click", function () {
    loginCard.classList.add("hidden"); registerCard.classList.remove("hidden"); registerError.style.display = "none";
  });
  if (btnShowLogin) btnShowLogin.addEventListener("click", function () {
    registerCard.classList.add("hidden"); loginCard.classList.remove("hidden"); loginError.style.display = "none";
  });
  if (registerForm) registerForm.addEventListener("submit", function (e) {
    e.preventDefault();
    registerError.style.display = "none";
    var username = document.getElementById("regUsername").value.trim();
    var password = document.getElementById("regPassword").value;
    fetch("/api/auth/register", {
      method: "POST",
      ...fetchOpts,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username, password: password })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (_ref) {
        if (_ref.ok) showApp(); else {
          registerError.textContent = _ref.d.error || "Kayıt olunamadı";
          registerError.style.display = "block";
        }
      })
      .catch(function () { registerError.textContent = "Bağlantı hatası"; registerError.style.display = "block"; });
  });
})();

document.getElementById("resumeBtn").addEventListener("click", function () {
  const saved = getResumeState();
  if (!saved) { hideResumeBar(); return; }
  currentVideoPath = saved.path;
  currentVideoTitle = saved.title;
  videoTitleEl.textContent = saved.title;
  player.src = "/video?file=" + encodeURIComponent(saved.path);
  function seekThenPlay() {
    player.removeEventListener("loadedmetadata", seekThenPlay);
    player.currentTime = saved.time;
    player.play().catch(function () { });
  }
  player.addEventListener("loadedmetadata", seekThenPlay);
  hideResumeBar();
});
document.getElementById("resumeDismissBtn").addEventListener("click", function () {
  clearResumeState();
  hideResumeBar();
});

(function initGoToTime() {
  var slider = document.getElementById("timeSlider");
  var tooltipWrap = document.getElementById("timeSliderTooltipWrap");
  var tooltipEl = document.getElementById("timeSliderTooltip");
  var display = document.getElementById("currentTimeDisplay");
  var inp = document.getElementById("gotoInput");
  var gotoBtn = document.getElementById("gotoBtn");
  function updateDisplay() {
    var cur = player.currentTime;
    var dur = player.duration;
    display.textContent = formatTimeLong(cur) + " / " + (Number.isFinite(dur) && dur > 0 ? formatTimeLong(dur) : "--:--");
  }
  function updateSlider() {
    var dur = player.duration;
    if (Number.isFinite(dur) && dur > 0) {
      slider.max = dur;
      slider.value = player.currentTime;
    }
  }
  function updateSliderTooltip() {
    var sec = parseFloat(slider.value, 10);
    var dur = parseFloat(slider.max, 10);
    if (Number.isFinite(dur) && dur > 0) {
      tooltipEl.textContent = formatTimeLong(sec) + " / " + formatTimeLong(dur);
    } else {
      tooltipEl.textContent = formatTimeLong(sec) + " / --:--";
    }
  }
  function showSliderTooltip() {
    updateSliderTooltip();
    if (tooltipWrap) tooltipWrap.classList.add("slider-active");
  }
  function hideSliderTooltip() {
    if (tooltipWrap) tooltipWrap.classList.remove("slider-active");
  }
  player.addEventListener("loadedmetadata", updateSlider);
  player.addEventListener("timeupdate", function () { updateDisplay(); updateSlider(); updateSubtitleOverlay(); });
  slider.addEventListener("input", function () {
    player.currentTime = parseFloat(slider.value, 10);
    updateSliderTooltip();
  });
  slider.addEventListener("mousedown", showSliderTooltip);
  slider.addEventListener("touchstart", showSliderTooltip, { passive: true });
  slider.addEventListener("mouseup", hideSliderTooltip);
  slider.addEventListener("mouseleave", hideSliderTooltip);
  slider.addEventListener("touchend", hideSliderTooltip, { passive: true });
  slider.addEventListener("touchcancel", hideSliderTooltip, { passive: true });
  if (tooltipWrap) tooltipWrap.addEventListener("mouseleave", hideSliderTooltip);
  gotoBtn.addEventListener("click", function () {
    var sec = parseTimeInput(inp.value);
    player.currentTime = sec;
    updateSlider();
  });
})();

(function initControlsRow2() {
  var toggle = document.getElementById("controlsRow2Toggle");
  var row = document.getElementById("controlsRow2");
  toggle.addEventListener("click", function () {
    row.classList.toggle("controls-row2-closed");
    this.textContent = row.classList.contains("controls-row2-closed") ? "▼" : "▲";
  });
})();
(function initExtraPanel() {
  var toggle = document.getElementById("extraPanelToggle");
  var panel = document.getElementById("extraPanel");
  toggle.addEventListener("click", function () {
    panel.classList.toggle("extra-panel-closed");
  });
})();
function updateMuteButtonLabel() {
  var btn = document.getElementById("muteBtn");
  if (!btn) return;
  var pct = Math.round((player.muted ? 0 : player.volume) * 100);
  btn.textContent = (player.muted ? "🔇 " : "🔊 ") + pct;
}

function toggleMute() {
  player.muted = !player.muted;
  updateMuteButtonLabel();
}

function volumeDown5() {
  player.volume = Math.max(0, player.volume - 0.05);
  player.muted = false;
  updateMuteButtonLabel();
  var s = document.getElementById("volumeSlider");
  if (s) s.value = Math.round(player.volume * 100);
}

function volumeUp5() {
  player.volume = Math.min(1, player.volume + 0.05);
  player.muted = false;
  updateMuteButtonLabel();
  var s = document.getElementById("volumeSlider");
  if (s) s.value = Math.round(player.volume * 100);
}

(function initVolumeSlider() {
  var slider = document.getElementById("volumeSlider");
  if (!slider) return;
  player.volume = parseInt(slider.value, 10) / 100;
  updateMuteButtonLabel();
  slider.addEventListener("input", function () {
    player.volume = parseInt(slider.value, 10) / 100;
    player.muted = false;
    updateMuteButtonLabel();
  });
  player.addEventListener("volumechange", function () {
    if (!player.muted) slider.value = Math.round(player.volume * 100);
    updateMuteButtonLabel();
  });
})();

fetch("/api/auth/me", fetchOpts)
  .then(function (r) {
    if (r.ok) return r.json().then(function (d) { showApp(); });
    showLogin();
  })
  .catch(function () { showLogin(); });

function seek(sec) {
  player.currentTime += sec;
}

function prevVideo() {
  if (currentVideoList.length === 0 || currentVideoIndex <= 0) return;
  var prev = currentVideoList[currentVideoIndex - 1];
  currentVideoPath = prev.path;
  currentVideoTitle = prev.name;
  currentVideoIndex--;
  videoTitleEl.textContent = prev.name;
  player.src = "/video?file=" + encodeURIComponent(prev.path);
  player.play().catch(function () { });
  loadSubtitleOptions(prev.path);
}

function nextVideo() {
  if (currentVideoList.length === 0 || currentVideoIndex < 0 || currentVideoIndex >= currentVideoList.length - 1) return;
  var next = currentVideoList[currentVideoIndex + 1];
  currentVideoPath = next.path;
  currentVideoTitle = next.name;
  currentVideoIndex++;
  videoTitleEl.textContent = next.name;
  player.src = "/video?file=" + encodeURIComponent(next.path);
  player.play().catch(function () { });
  loadSubtitleOptions(next.path);
}

function updatePlayPauseIcon() {
  const label = document.getElementById("playPauseLabel");
  if (!label) return;
  label.textContent = player.paused ? "▶️" : "⏸️";
}

function toggle() {
  player.paused ? player.play() : player.pause();
  updatePlayPauseIcon();
}

player.addEventListener("play", updatePlayPauseIcon);
player.addEventListener("pause", updatePlayPauseIcon);

var resumeSaveLast = 0;
player.addEventListener("timeupdate", function () {
  if (!currentVideoPath || !currentVideoTitle) return;
  var now = Date.now();
  if (now - resumeSaveLast < 2500) return;
  resumeSaveLast = now;
  setResumeState(currentVideoPath, currentVideoTitle, player.currentTime);
  if (isFavorite(currentVideoPath)) updateFavoriteTime(currentVideoPath, player.currentTime);
});
player.addEventListener("pause", function () {
  if (currentVideoPath && currentVideoTitle) {
    setResumeState(currentVideoPath, currentVideoTitle, player.currentTime);
    updateLastWatchedTime(currentVideoPath, player.currentTime);
    if (isFavorite(currentVideoPath)) updateFavoriteTime(currentVideoPath, player.currentTime);
  }
});

loadEndBehavior();
loadSubtitleSettings();
updateSubtitleOverlay();
updateSubtitleChips();
var endBehaviorBtnEl = document.getElementById("endBehaviorBtn");
endBehaviorBtnEl.textContent = END_BEHAVIOR_ICONS[endBehaviorIndex];
endBehaviorBtnEl.title = END_BEHAVIOR_TITLES[endBehaviorIndex];
endBehaviorBtnEl.addEventListener("click", function () {
  endBehaviorIndex = (endBehaviorIndex + 1) % 3;
  this.textContent = END_BEHAVIOR_ICONS[endBehaviorIndex];
  this.title = END_BEHAVIOR_TITLES[endBehaviorIndex];
  saveEndBehavior();
});
player.addEventListener("ended", function () {
  if (endBehaviorIndex === 1) {
    player.currentTime = 0;
    player.play().catch(function () { });
  } else if (endBehaviorIndex === 2 && currentVideoList.length && currentVideoIndex >= 0 && currentVideoIndex + 1 < currentVideoList.length) {
    var next = currentVideoList[currentVideoIndex + 1];
    currentVideoPath = next.path;
    currentVideoTitle = next.name;
    currentVideoIndex++;
    videoTitleEl.textContent = next.name;
    player.src = "/video?file=" + encodeURIComponent(next.path);
    player.play().catch(function () { });
    loadSubtitleOptions(next.path);
  }
});

function loadSubtitleOptions(videoPath, optSelectPath) {
  var sel = document.getElementById("subtitleSelect");
  sel.innerHTML = "<option value=\"\">Yok</option>";
  if (!videoPath) return;
  fetch("/api/subtitles?file=" + encodeURIComponent(videoPath), fetchOpts)
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (files) {
      files.forEach(function (f) {
        var opt = document.createElement("option");
        opt.value = f.path;
        opt.textContent = f.name;
        sel.appendChild(opt);
      });
      if (optSelectPath && Array.prototype.some.call(sel.options, function (o) { return o.value === optSelectPath; })) {
        sel.value = optSelectPath;
        sel.dispatchEvent(new Event("change"));
      }
    })
    .catch(function () { });
}
document.getElementById("subtitleSelect").addEventListener("change", function () {
  var path = this.value;
  var tracks = player.querySelectorAll("track");
  tracks.forEach(function (t) { t.remove(); });
  subtitleCues = [];
  document.getElementById("subtitleOverlay").textContent = "";
  if (path) {
    fetch("/subtitle?file=" + encodeURIComponent(path), fetchOpts)
      .then(function (r) { return r.ok ? r.text() : Promise.reject(); })
      .then(function (text) {
        subtitleCues = parseVtt(text);
        updateSubtitleOverlay();
      })
      .catch(function () { });
  }
});

(function initSubtitleSettings() {
  var row = document.getElementById("subtitleSettingsRow");
  var toggle = document.getElementById("subtitleSettingsToggle");
  toggle.addEventListener("click", function () {
    row.classList.toggle("visible");
    row.setAttribute("aria-hidden", row.classList.contains("visible") ? "false" : "true");
  });
  var stepX = 8;
  var stepY = 5;
  document.getElementById("subFontSmaller").addEventListener("click", function () {
    if (subtitleFontSize > SUBTITLE_FONT_MIN) {
      subtitleFontSize -= 2;
      saveSubtitleSettings();
      updateSubtitleOverlay();
      updateSubtitleChips();
    }
  });
  document.getElementById("subFontBigger").addEventListener("click", function () {
    if (subtitleFontSize < SUBTITLE_FONT_MAX) {
      subtitleFontSize += 2;
      saveSubtitleSettings();
      updateSubtitleOverlay();
      updateSubtitleChips();
    }
  });
  document.getElementById("subDelayBack").addEventListener("click", function () {
    subtitleDelayMs -= 100;
    saveSubtitleSettings();
    updateSubtitleOverlay();
    updateSubtitleChips();
  });
  document.getElementById("subLeft").addEventListener("click", function () {
    subtitleOffsetX -= stepX;
    saveSubtitleSettings();
    updateSubtitleOverlay();
  });
  document.getElementById("subDown").addEventListener("click", function () {
    subtitleOffsetY += stepY;
    saveSubtitleSettings();
    updateSubtitleOverlay();
  });
  document.getElementById("subUp").addEventListener("click", function () {
    subtitleOffsetY -= stepY;
    saveSubtitleSettings();
    updateSubtitleOverlay();
  });
  document.getElementById("subRight").addEventListener("click", function () {
    subtitleOffsetX += stepX;
    saveSubtitleSettings();
    updateSubtitleOverlay();
  });
  document.getElementById("subDelayFwd").addEventListener("click", function () {
    subtitleDelayMs += 100;
    saveSubtitleSettings();
    updateSubtitleOverlay();
    updateSubtitleChips();
  });
  document.getElementById("subWidthNarrow").addEventListener("click", function () {
    if (subtitleWidthPct > SUBTITLE_WIDTH_MIN) {
      subtitleWidthPct = Math.max(SUBTITLE_WIDTH_MIN, subtitleWidthPct - 10);
      saveSubtitleSettings();
      updateSubtitleOverlay();
      updateSubtitleChips();
    }
  });
  document.getElementById("subWidthWiden").addEventListener("click", function () {
    if (subtitleWidthPct < SUBTITLE_WIDTH_MAX) {
      subtitleWidthPct = Math.min(SUBTITLE_WIDTH_MAX, subtitleWidthPct + 10);
      saveSubtitleSettings();
      updateSubtitleOverlay();
      updateSubtitleChips();
    }
  });
  updateSubtitleChips();
})();

(function initSubtitleSearch() {
  var searchRow = document.getElementById("subtitleSearchRow");
  var searchToggle = document.getElementById("subtitleSearchToggle");
  var searchInput = document.getElementById("subtitleSearchInput");
  var searchLang = document.getElementById("subtitleSearchLang");
  var searchBtn = document.getElementById("subtitleSearchBtn");
  var searchResults = document.getElementById("subtitleSearchResults");

  searchToggle.addEventListener("click", function () {
    searchRow.classList.toggle("visible");
    searchRow.setAttribute("aria-hidden", searchRow.classList.contains("visible") ? "false" : "true");
    if (searchRow.classList.contains("visible") && currentVideoPath) {
      var base = currentVideoPath.replace(/^.*\//, "").replace(/\.[^.]+$/, "");
      if (base && !searchInput.value.trim()) searchInput.value = base;
    }
  });

  searchBtn.addEventListener("click", function () {
    var q = searchInput.value.trim();
    if (!q) return;
    var lang = searchLang.value || "tr";
    searchResults.innerHTML = "<span class=\"subtitle-search-status\">Aranıyor...</span>";
    fetch("/api/subtitles/search?q=" + encodeURIComponent(q) + "&languages=" + encodeURIComponent(lang), fetchOpts)
      .then(function (r) {
        if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || "Arama başarısız"); });
        return r.json();
      })
      .then(function (list) {
        searchResults.innerHTML = "";
        if (!list || list.length === 0) {
          searchResults.innerHTML = "<span class=\"subtitle-search-status\">Sonuç yok</span>";
          return;
        }
        list.forEach(function (item) {
          var fileId = item.file_id;
          var name = item.release_name || "Altyazı #" + fileId;
          var row = document.createElement("div");
          row.className = "subtitle-search-result-item";
          var nameEl = document.createElement("span");
          nameEl.className = "name";
          nameEl.textContent = name;
          row.appendChild(nameEl);
          var actions = document.createElement("div");
          actions.className = "actions";
          var useBtn = document.createElement("button");
          useBtn.type = "button";
          useBtn.className = "btn";
          useBtn.textContent = "Kullan";
          useBtn.title = "Overlay'de göster";
          useBtn.addEventListener("click", function () {
            useBtn.disabled = true;
            fetch("/api/subtitles/download?file_id=" + encodeURIComponent(fileId), fetchOpts)
              .then(function (r) { return r.ok ? r.text() : Promise.reject(new Error("İndirilemedi")); })
              .then(function (text) {
                subtitleCues = parseVtt(text);
                updateSubtitleOverlay();
                useBtn.disabled = false;
              })
              .catch(function () { useBtn.disabled = false; });
          });
          var saveBtn = document.createElement("button");
          saveBtn.type = "button";
          saveBtn.className = "btn";
          saveBtn.textContent = "İndir";
          saveBtn.title = "Videonun klasörüne kaydet";
          saveBtn.addEventListener("click", function () {
            if (!currentVideoPath) return;
            saveBtn.disabled = true;
            fetch("/api/subtitles/save?file_id=" + encodeURIComponent(fileId) + "&videoPath=" + encodeURIComponent(currentVideoPath), fetchOpts)
              .then(function (r) {
                if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || "Kaydedilemedi"); });
                return r.json();
              })
              .then(function (data) {
                loadSubtitleOptions(currentVideoPath, data.path);
                saveBtn.disabled = false;
              })
              .catch(function () { saveBtn.disabled = false; });
          });
          actions.appendChild(useBtn);
          actions.appendChild(saveBtn);
          row.appendChild(actions);
          searchResults.appendChild(row);
        });
      })
      .catch(function (err) {
        searchResults.innerHTML = "<span class=\"subtitle-search-status\" style=\"color:#e55;\">" + (err.message || "Hata") + "</span>";
      });
  });
})();

function closeVideo() {
  player.pause();
  player.removeAttribute("src");
  player.load();
  videoTitleEl.textContent = "";
  currentVideoPath = null;
  currentVideoTitle = null;
  currentVideoIndex = -1;
  subtitleCues = [];
  document.getElementById("subtitleOverlay").textContent = "";
  clearResumeState();
  document.getElementById("subtitleSelect").innerHTML = "<option value=\"\">Yok</option>";
}

function showError(msg) {
  listEl.innerHTML = "<div class=\"item\" style=\"color:#e55;cursor:default;\">⚠ " + (msg || "Liste yüklenemedi") + "</div>";
}

function renderListItems(itemsToShow) {
  listEl.innerHTML = "";
  var q = (searchQuery || "").toLowerCase();

  if (!currentPath) {
    var favorites = getFavorites();
    if (favorites.length > 0) {
      var favFolder = document.createElement("div");
      favFolder.className = "list-folder-toggle" + (favoritesExpanded ? " expanded" : "");
      favFolder.innerHTML = "<span class=\"folder-icon\">📁</span><span class=\"name\">Favoriler</span><span class=\"chevron\">▶</span>";
      favFolder.onclick = function () {
        favoritesExpanded = !favoritesExpanded;
        favFolder.classList.toggle("expanded", favoritesExpanded);
        favFolder.nextElementSibling.classList.toggle("visible", favoritesExpanded);
      };
      listEl.appendChild(favFolder);
      var favContents = document.createElement("div");
      favContents.className = "list-folder-contents" + (favoritesExpanded ? " visible" : "");
      favorites.forEach(function (e) {
        var row = document.createElement("div");
        row.className = "item";
        var name = document.createElement("div");
        name.className = "name";
        name.textContent = "🎬 " + e.title + (e.time > 0 ? " (" + formatTime(e.time) + ")" : "");
        var favBtn = document.createElement("button");
        favBtn.type = "button";
        favBtn.className = "btn-fav is-fav";
        favBtn.textContent = "⭐";
        favBtn.title = "Favorilerden kaldır";
        favBtn.onclick = function (ev) { toggleFavorite(e.path, e.title, ev); };
        row.onclick = function () {
          currentVideoPath = e.path;
          currentVideoTitle = e.title;
          videoTitleEl.textContent = e.title;
          player.src = "/video?file=" + encodeURIComponent(e.path);
          var startTime = getFavoriteTime(e.path);
          function seekThenPlay() {
            player.removeEventListener("loadedmetadata", seekThenPlay);
            player.currentTime = startTime;
            player.play().catch(function () { });
          }
          player.addEventListener("loadedmetadata", seekThenPlay);
          hideResumeBar();
          loadSubtitleOptions(e.path);
        };
        row.appendChild(name);
        row.appendChild(favBtn);
        favContents.appendChild(row);
      });
      listEl.appendChild(favContents);
    }

    var last = getLastWatched();
    if (last.length > 0) {
      var lastFolder = document.createElement("div");
      lastFolder.className = "list-folder-toggle" + (lastWatchedExpanded ? " expanded" : "");
      lastFolder.innerHTML = "<span class=\"folder-icon\">📂</span><span class=\"name\">Son izlenenler</span><span class=\"chevron\">▶</span>";
      lastFolder.onclick = function () {
        lastWatchedExpanded = !lastWatchedExpanded;
        lastFolder.classList.toggle("expanded", lastWatchedExpanded);
        lastFolder.nextElementSibling.classList.toggle("visible", lastWatchedExpanded);
      };
      listEl.appendChild(lastFolder);
      var lastContents = document.createElement("div");
      lastContents.className = "list-folder-contents" + (lastWatchedExpanded ? " visible" : "");
      last.forEach(function (e) {
        var row = document.createElement("div");
        row.className = "item";
        var name = document.createElement("div");
        name.className = "name";
        name.textContent = "🎬 " + e.title + " (" + formatTime(e.time) + ")";
        row.onclick = function () {
          currentVideoPath = e.path;
          currentVideoTitle = e.title;
          videoTitleEl.textContent = e.title;
          player.src = "/video?file=" + encodeURIComponent(e.path);
          function seekThenPlay() {
            player.removeEventListener("loadedmetadata", seekThenPlay);
            player.currentTime = e.time;
            player.play().catch(function () { });
          }
          player.addEventListener("loadedmetadata", seekThenPlay);
          hideResumeBar();
          loadSubtitleOptions(e.path);
        };
        row.appendChild(name);
        lastContents.appendChild(row);
      });
      listEl.appendChild(lastContents);
    }
  }

  if (currentPath) {
    var backRow = document.createElement("div");
    backRow.className = "list-back-row";
    var back = document.createElement("div");
    back.id = "back";
    back.textContent = "⬅";
    back.title = "Geri";
    back.onclick = function () {
      currentPath = currentPath.split("/").slice(0, -1).join("/");
      loadList();
    };
    var fileCount = document.createElement("span");
    fileCount.className = "list-file-count";
    var numFiles = itemsToShow.filter(function (i) { return i.type === "file"; }).length;
    fileCount.textContent = numFiles + " dosya";
    backRow.appendChild(back);
    backRow.appendChild(fileCount);
    listEl.appendChild(backRow);
  }

  itemsToShow.forEach(function (item, idx) {
    var row = document.createElement("div");
    row.className = "item";
    var name = document.createElement("div");
    name.className = "name";
    if (item.type === "root") {
      name.classList.add("folder");
      name.textContent = "📁 " + item.name;
      row.onclick = function () {
        currentPath = item.id;
        loadList();
      };
      row.appendChild(name);
    } else if (item.type === "folder") {
      name.classList.add("folder");
      name.textContent = "📁 " + item.name;
      row.onclick = function () {
        currentPath = currentPath ? currentPath + "/" + item.name : item.name;
        loadList();
      };
      row.appendChild(name);
    } else {
      var videoPath = currentPath ? currentPath + "/" + item.name : item.name;
      var fileIndex = currentVideoList.findIndex(function (v) { return v.path === videoPath; });
      var isFav = isFavorite(videoPath);
      name.textContent = "🎬 " + item.name;
      row.onclick = function () {
        if (currentVideoPath && currentVideoTitle) {
          addToLastWatched(currentVideoPath, currentVideoTitle, player.currentTime);
          if (isFavorite(currentVideoPath)) updateFavoriteTime(currentVideoPath, player.currentTime);
        }
        addToLastWatched(videoPath, item.name, 0);
        currentVideoPath = videoPath;
        currentVideoTitle = item.name;
        currentVideoIndex = fileIndex >= 0 ? fileIndex : -1;
        videoTitleEl.textContent = item.name;
        player.src = "/video?file=" + encodeURIComponent(videoPath);
        var startTime = isFavorite(videoPath) ? getFavoriteTime(videoPath) : 0;
        function seekThenPlay() {
          player.removeEventListener("loadedmetadata", seekThenPlay);
          if (startTime > 0) player.currentTime = startTime;
          player.play().catch(function () { });
        }
        player.addEventListener("loadedmetadata", seekThenPlay);
        hideResumeBar();
        loadSubtitleOptions(videoPath);
      };
      var favBtn = document.createElement("button");
      favBtn.type = "button";
      favBtn.className = "btn-fav" + (isFav ? " is-fav" : "");
      favBtn.textContent = isFav ? "⭐" : "☆";
      favBtn.title = isFav ? "Favorilerden kaldır" : "Favorilere ekle";
      favBtn.onclick = function (ev) { toggleFavorite(videoPath, item.name, ev); };
      row.appendChild(name);
      row.appendChild(favBtn);
    }
    listEl.appendChild(row);
  });
}

function loadList() {
  fetch("/api/tree?path=" + encodeURIComponent(currentPath), fetchOpts)
    .then(function (r) {
      if (r.status === 401) { showLogin(); throw new Error("Giriş gerekli"); }
      if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || "Hata " + r.status); });
      return r.json();
    })
    .then(function (items) {
      currentListItems = items;
      currentVideoList = items.filter(function (i) { return i.type === "file"; }).map(function (i) {
        var path = currentPath ? currentPath + "/" + i.name : i.name;
        return { path: path, name: i.name };
      });
      var q = (searchQuery || "").trim().toLowerCase();
      var filtered = q ? items.filter(function (i) { return i.name.toLowerCase().indexOf(q) >= 0; }) : items;
      renderListItems(filtered);
    })
    .catch(function (err) { if (err.message !== "Giriş gerekli") showError(err.message); });
}

(function initSearchClear() {
  var searchInput = document.getElementById("searchInput");
  var searchClearBtn = document.getElementById("searchClearBtn");
  function toggleClearBtn() {
    searchClearBtn.classList.toggle("visible", searchInput.value.length > 0);
  }
  searchInput.addEventListener("input", toggleClearBtn);
  searchInput.addEventListener("focus", toggleClearBtn);
  searchClearBtn.addEventListener("click", function () {
    searchInput.value = "";
    searchQuery = "";
    toggleClearBtn();
    var filtered = currentListItems;
    renderListItems(filtered);
  });
})();

document.getElementById("searchInput").addEventListener("input", function () {
  if (searchDebounce) clearTimeout(searchDebounce);
  var self = this;
  searchDebounce = setTimeout(function () {
    searchQuery = self.value.trim();
    var q = searchQuery.toLowerCase();
    var filtered = q ? currentListItems.filter(function (i) { return i.name.toLowerCase().indexOf(q) >= 0; }) : currentListItems;
    renderListItems(filtered);
  }, 500);
});

let startX = 0, startTime = 0;
player.addEventListener("touchstart", e => {
  startX = e.touches[0].clientX;
  startTime = Date.now();
});
player.addEventListener("touchend", e => {
  const endX = e.changedTouches[0].clientX;
  const diffX = endX - startX;
  const duration = Date.now() - startTime;
  if (Math.abs(diffX) > 50 && duration < 500) {
    player.currentTime += diffX > 0 ? 10 : -10;
  }
});
player.addEventListener("click", () => { player.paused ? player.play() : player.pause(); });

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}
