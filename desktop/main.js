// Hauntface — desktop shell.
// The renderer (app/) never sees API keys and makes no network calls: keys live here, encrypted with
// the OS keychain (safeStorage), and all AI requests go through IPC handlers below.
const { app, BrowserWindow, ipcMain, safeStorage, session, shell, Menu, powerSaveBlocker, protocol, net, systemPreferences } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { createRemote } = require("./remote");

const isMac = process.platform === "darwin";
const APP_DIR = app.isPackaged ? path.join(process.resourcesPath, "app") : path.join(__dirname, "..", "app");
const ICON = path.join(__dirname, "build", process.platform === "win32" ? "icon.ico" : "icon.png");
const core = require(path.join(APP_DIR, "providers-core.js"));
const KEY_NAMES = ["nvidia", "anthropic", "openai"];
const SCHEME = "hauntface";

// A real origin (hauntface://app) instead of file:// — stable localStorage, fetch works, CSP applies.
protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

// Sound may start without a click, so the prop can wake up by itself after a reboot (--autostart).
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

if (!app.requestSingleInstanceLock()) app.quit();
let win = null;
app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

// ---------------------------------------------------------------- keys
const keysFile = () => path.join(app.getPath("userData"), "keys.json");
function readKeys() {
  try { return JSON.parse(fs.readFileSync(keysFile(), "utf8")); } catch { return {}; }
}
function getKey(name) {
  const v = readKeys()[name];
  if (!v) return "";
  try {
    if (v.startsWith("enc:")) return safeStorage.decryptString(Buffer.from(v.slice(4), "base64"));
    if (v.startsWith("plain:")) return v.slice(6);
  } catch {}
  return "";
}
function setKey(name, value) {
  if (!KEY_NAMES.includes(name) || typeof value !== "string" || value.length > 500) throw new Error("bad key");
  const all = readKeys();
  if (!value) delete all[name];
  else all[name] = safeStorage.isEncryptionAvailable()
    ? "enc:" + safeStorage.encryptString(value.trim()).toString("base64")
    : "plain:" + value.trim(); // e.g. Linux without a keyring
  fs.mkdirSync(path.dirname(keysFile()), { recursive: true });
  fs.writeFileSync(keysFile(), JSON.stringify(all), { mode: 0o600 });
}
const ctx = ms => ({ key: getKey, signal: AbortSignal.timeout(ms) });
const clean = e => new Error(e && e.code === "NO_KEY" ? "NO_KEY" : (e && e.name === "TimeoutError" ? "timeout" : String((e && e.message) || e)));

ipcMain.handle("hf:keys-status", () => Object.fromEntries(KEY_NAMES.map(n => [n, !!getKey(n)])));
ipcMain.handle("hf:keys-set", (_e, name, value) => { setKey(name, value); return true; });
ipcMain.handle("hf:chat", async (_e, o) => {
  try {
    if (!["nvidia", "anthropic"].includes(o.provider)) throw new Error("bad provider");
    return await core.chat({ provider: o.provider, model: String(o.model), system: String(o.system), messages: o.messages }, ctx(20000));
  } catch (e) { throw clean(e); }
});
ipcMain.handle("hf:stt", async (_e, o) => {
  try {
    const blob = new Blob([Buffer.from(o.audio)], { type: String(o.mime || "audio/webm") });
    return await core.transcribe({ blob, url: String(o.url), model: String(o.model), lang: String(o.lang) }, ctx(15000));
  } catch (e) { throw clean(e); }
});
ipcMain.handle("hf:tts", async (_e, o) => {
  try { return await core.speak({ text: String(o.text), voice: String(o.voice), instructions: String(o.instructions) }, ctx(15000)); }
  catch (e) { throw clean(e); }
});
ipcMain.on("hf:fullscreen", (_e, on) => win && win.setFullScreen(!!on));

// ---------------------------------------------------------------- phone remote
let remote = null;
const getRemote = () => remote || (remote = createRemote({
  userData: app.getPath("userData"),
  send: c => win && !win.isDestroyed() && win.webContents.send("hf:remote-cmd", c),
}));
ipcMain.handle("hf:remote", async (_e, on, newToken) => {
  try { if (!on) { getRemote().stop(); return null; } return await getRemote().start({ newToken: !!newToken }); }
  catch (e) { throw clean(e); }
});
ipcMain.on("hf:remote-status", (_e, st) => remote && remote.setStatus(st));
app.on("before-quit", () => remote && remote.stop());
ipcMain.on("hf:fullscreen-toggle", () => win && win.setFullScreen(!win.isFullScreen()));

// ---------------------------------------------------------------- window
function serveApp() {
  const root = path.resolve(APP_DIR);
  protocol.handle(SCHEME, async req => {
    const { pathname } = new URL(req.url);
    const file = path.resolve(root, "." + decodeURIComponent(pathname === "/" ? "/index.html" : pathname));
    if (!file.startsWith(root + path.sep)) return new Response("forbidden", { status: 403 });
    const res = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(res.headers);
    headers.set("Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: mediastream:; connect-src 'self'");
    return new Response(res.body, { status: res.status, headers });
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 640, minHeight: 400, backgroundColor: "#000000",
    autoHideMenuBar: true, show: false, icon: ICON, title: "Hauntface",
    kiosk: process.argv.includes("--kiosk"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      backgroundThrottling: false, // the prop keeps running when the window is not focused
      additionalArguments: process.argv.includes("--autostart") ? ["--autostart"] : [],
    },
  });
  win.once("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(`${SCHEME}://`)) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); } });
  win.webContents.on("render-process-gone", () => { if (!win.isDestroyed()) win.reload(); }); // a crash at the door must not end the night
  win.loadURL(`${SCHEME}://app/index.html`);
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: "appMenu" }] : []),
    { label: "File", submenu: [{ role: "quit" }] },
    { role: "editMenu" },
    { label: "View", submenu: [{ role: "reload" }, { role: "togglefullscreen" }, { role: "toggleDevTools" }] },
    { label: "Help", submenu: [
      { label: "Hauntface on GitHub", click: () => shell.openExternal("https://github.com/bartoszkolo/hauntface") },
      { label: "Report a problem", click: () => shell.openExternal("https://github.com/bartoszkolo/hauntface/issues/new/choose") },
    ] },
  ]));
}

app.whenReady().then(async () => {
  // Only the microphone, camera and fullscreen are ever allowed.
  const allowed = new Set(["media", "fullscreen"]);
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(allowed.has(perm)));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => allowed.has(perm));
  if (isMac) {
    await systemPreferences.askForMediaAccess("microphone").catch(() => {});
    await systemPreferences.askForMediaAccess("camera").catch(() => {});
  }
  powerSaveBlocker.start("prevent-display-sleep"); // the monitor in the prop must not go to sleep
  serveApp();
  buildMenu();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => app.quit());
