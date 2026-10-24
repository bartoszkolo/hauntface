// Dev helper: launches the real app, waits for both shaders, and saves screenshots of each monster.
//   npx electron tools/shots.js [outDir]      (default: ../site/assets)
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const out = path.resolve(process.argv.find(a => a.startsWith("--out="))?.slice(6) || path.join(__dirname, "..", "..", "site", "assets"));
const wait = ms => new Promise(r => setTimeout(r, ms));

app.on("child-process-gone", (_e, d) => console.log("CHILD GONE", JSON.stringify(d)));
app.on("render-process-gone", (_e, _w, d) => console.log("RENDER GONE", JSON.stringify(d)));
app.on("before-quit", () => console.log("BEFORE QUIT"));
app.on("browser-window-created", (_e, win) => {
  win.on("closed", () => console.log("WINDOW CLOSED"));
  win.webContents.on("console-message", e => { if (e.level === "error" || /shader|webgl/i.test(e.message)) console.log("[renderer]", e.message.slice(0, 300)); });
  win.webContents.once("did-finish-load", async () => {
    const js = s => win.webContents.executeJavaScript(s);
    try {
      const ready = async key => { // first compile can take a while on integrated GPUs
        for (let i = 0; i < 240; i++) {
          if (await js(`!!(PROGS.${key} && PROGS.${key}.ready) && !loadingGL`)) return true;
          if (i % 15 === 0) console.log("compiling", key, i + "s");
          await wait(1000);
        }
        return false;
      };
      await js("document.getElementById('start')?.remove(); cfg.lang = 'en'; S.mode = 'idle'; HEAD.nextLook = 1e12; S.nextAuto = 1e12; true");
      fs.mkdirSync(out, { recursive: true });
      for (const [look, key, yaw, name] of [...(process.env.SHOTS_SKIP_REAPER ? [] : [["reaper", "s", 0.16, "shot-reaper"]]), ["skull", "s", -0.12, "shot-skull"], ["witch", "w", 0.38, "shot-witch"]]) {
        await js(`cfg.look = '${look}'; HEAD.lookYaw = ${yaw}; HEAD.lookPitch = 0; S.flare = .5; true`);
        await ready(key);
        await wait(4000);
        const img = await win.webContents.capturePage();
        fs.writeFileSync(path.join(out, name + ".png"), img.toPNG());
        console.log("saved", name, img.getSize());
      }
    } catch (e) { console.error(e); }
    app.quit();
  });
});

require("../main.js");
