# LAN Video Server

A Node.js server to browse and play videos from configured folders over LAN in your browser. Supports login, favorites, recently watched, and resume position.

**Version:** 1.0.0

---

## What you need to add (before first run)

| Item | Action |
|------|--------|
| **`.env`** | **Required.** Copy from `.env.example`: `copy .env.example .env` (Windows) or `cp .env.example .env` (Linux/macOS). Set `LOGIN_USERNAME` and `LOGIN_PASSWORD`. Optional: `SESSION_SECRET` for session security. On Windows use `LOGIN_USERNAME` / `LOGIN_PASSWORD` to avoid conflict with the system `USERNAME` variable. |
| **`config.json`** | **Required.** Define video root folders. Repo includes a sample. Edit to add your paths, e.g. `{ "videoDirs": [ { "name": "Videos", "path": "docs" }, { "name": "Movies", "path": "D:/movies" } ] }`. `name` = label in UI; `path` = relative to project or absolute. Create the folders if they don’t exist. |
| **Video folders** | Create or point to folders that contain your video files (e.g. `.mp4`, `.mkv`, `.avi`, `.mov`, `.webm`). |

No need to create `.remember-tokens.json` or `.user-data.json`; the server creates them at runtime.

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create environment file

Create a **`.env`** file in the project root with login credentials (required):

```env
LOGIN_USERNAME=admin
LOGIN_PASSWORD=your_password_here
```

On Windows, use `LOGIN_USERNAME` / `LOGIN_PASSWORD` to avoid conflict with the system `USERNAME` variable. Optional: `SESSION_SECRET` (session security). See `.env.example` for a template.

### 3. Configure video folders

Define video root directories in **`config.json`**:

```json
{
  "videoDirs": [
    { "name": "Videos", "path": "docs" },
    { "name": "Movies", "path": "D:/movies" }
  ]
}
```

- **name:** Folder name shown in the UI
- **path:** Relative to project (e.g. `docs`) or absolute (e.g. `D:/movies`). The server creates missing folders on first run; subfolders are supported.

Supported video formats: `.mp4`, `.mkv`, `.avi`, `.mov`, `.webm`

---

## Running

| Method | Command / File |
|--------|----------------|
| Terminal | `npm start` or `node server.js` |
| Windows (IP + QR) | `start.bat` |
| Exe (Windows) | `npm run build` → `dist/video-server.exe` |

The server listens on **http://0.0.0.0:3366**.

- **Computer:** Open `http://YOUR_IP:3366` in a browser
- **Phone:** Same URL or scan the QR code shown by the batch file

When using the exe, **`config.json`** and **`.env`** must be in the same folder as the exe; video paths are relative to that folder or can be absolute.

---

## Usage (UI)

### Login

- The login screen appears when you open the page; sign in with the username and password from `.env`.
- **Remember me** keeps the session across browser restarts (token stored on the server).

### Home

- **Favorites:** The "Favorites" section at the top. Use the star (☆/⭐) on each video to add or remove. Favorites are stored per user on the server and persist after restart.
- **Recently watched:** The "Recently watched" section lists the last 10 items; click to expand/collapse. Stored per user on the server.
- **Folders:** Click folders to navigate; select a video from the list to play.

### Player controls

- **−30 / −10 / −5** and **+5 / +10 / +30:** Seek by seconds
- **▶/⏸:** Play / Pause | **⏹:** Close video
- **Time slider:** Drag to seek; a tooltip shows the time while dragging
- **▼ (next to slider):** Toggle the volume row and volume slider

### Settings (⚙️, next to the search bar)

- **Seek to time:** Jump to a specific time (e.g. `1:30`, `90`) via "Go"
- **Subtitles:** Choose `.vtt` / `.srt` files that match the video name
- **On end (🔁):** Do nothing / Repeat / Play next
- **Clear recently watched (🗑):** Clear the recently watched list
- **Logout (🚪):** End the session

### Favorites and resume

- Playback position for favorited videos is saved on the server; opening from Favorites resumes from that position.
- Recently watched is also stored per user on the server and is restored after a server restart.

---

## Server data files

These files are created at runtime and are listed in `.gitignore`:

| File | Description |
|------|-------------|
| `.remember-tokens.json` | "Remember me" session tokens |
| `.user-data.json` | Per-user favorites and recently watched (persists across restarts) |

---

## Features summary

- Login (username / password)
- Folder tree and video list (multiple roots)
- Range-based streaming (seek)
- Favorites (per user on server, persistent)
- Recently watched (last 10, per user on server, persistent)
- Resume from favorites (position saved)
- Subtitle selection (.vtt / .srt)
- PWA: can be added to home screen
- Touch swipe for ±10 second seek
- Time tooltip on slider while dragging
