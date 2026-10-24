// Bridge between the face (renderer) and the main process. Only these functions are exposed.
const { contextBridge, ipcRenderer } = require("electron");

async function call(channel, ...args) {
  try {
    return await ipcRenderer.invoke(channel, ...args);
  } catch (e) {
    const msg = String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
    throw Object.assign(new Error(msg), msg === "NO_KEY" ? { code: "NO_KEY" } : {});
  }
}

contextBridge.exposeInMainWorld("hauntDesktop", {
  flags: { autostart: process.argv.includes("--autostart") },
  keys: {
    status: () => call("hf:keys-status"),
    set: (name, value) => call("hf:keys-set", name, value),
  },
  chat: o => call("hf:chat", o),
  transcribe: o => call("hf:stt", o),
  speak: o => call("hf:tts", o),
  setFullscreen: on => ipcRenderer.send("hf:fullscreen", !!on),
  toggleFullscreen: () => ipcRenderer.send("hf:fullscreen-toggle"),
});
