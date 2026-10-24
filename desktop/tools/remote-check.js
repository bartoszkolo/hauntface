// Dev helper: starts the app with the phone remote on, prints the remote URL and keeps running for a while.
//   npx electron tools/remote-check.js [--seconds=120]
const { app } = require("electron");
const secs = +(process.argv.find(a => a.startsWith("--seconds="))?.slice(10) || 120);

app.on("browser-window-created", (_e, win) => {
  win.webContents.on("console-message", e => { if (e.level === "error") console.log("[renderer]", e.message.slice(0, 300)); });
  win.webContents.once("did-finish-load", async () => {
    await new Promise(r => setTimeout(r, 1500));
    const url = await win.webContents.executeJavaScript(
      "cfg.remote = true; saveCfg(); setRemote(true).then(() => document.getElementById('remote-url').textContent)");
    console.log("REMOTE", url);
    setTimeout(() => app.quit(), secs * 1000);
  });
});

require("../main.js");
