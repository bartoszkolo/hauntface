// Phone remote: a tiny HTTP server on the local network. The phone opens the URL from the QR code,
// gets live status over Server-Sent Events and sends commands with POST. Every request must carry the
// secret token from the QR code; the server only runs while the remote is switched on in settings.
const http = require("http");
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const QR = require("qrcode");

const PREFERRED_PORT = 8743;
const COMMANDS = new Set(["say", "fx", "look", "mic", "hush", "ai", "family"]);

function lanAddress() {
  const all = Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === "IPv4" && !a.internal);
  const isPrivate = ip => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  return (all.find(a => isPrivate(a.address)) || all.find(a => !a.address.startsWith("169.254")) || { address: "127.0.0.1" }).address;
}

function createRemote({ userData, send }) {
  const tokenFile = path.join(userData, "remote.json");
  const page = fs.readFileSync(path.join(__dirname, "remote.html"));
  let server = null, token = "", status = {}, statusJson = "{}";
  const clients = new Set();

  function loadToken(fresh) {
    if (!fresh) try { const t = JSON.parse(fs.readFileSync(tokenFile, "utf8")).token; if (/^[a-f0-9]{32}$/.test(t)) return t; } catch {}
    const t = crypto.randomBytes(16).toString("hex"); // kept between launches so a phone bookmark keeps working
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(tokenFile, JSON.stringify({ token: t }), { mode: 0o600 });
    return t;
  }
  const authorized = (req, url) => {
    const t = url.searchParams.get("t") || "";
    return t.length === token.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(token));
  };

  function handle(req, res) {
    const url = new URL(req.url, "http://remote");
    if (!authorized(req, url)) { res.writeHead(403, { "content-type": "text/plain; charset=utf-8" }); return res.end("Scan the QR code in Hauntface settings (H → Phone remote)."); }
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" });
      return res.end(page);
    }
    if (req.method === "GET" && url.pathname === "/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      res.write(`data: ${statusJson}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (req.method === "POST" && url.pathname === "/cmd") {
      let body = "";
      req.on("data", c => { body += c; if (body.length > 4096) req.destroy(); });
      req.on("end", () => {
        try {
          const { cmd, arg } = JSON.parse(body || "{}");
          if (!COMMANDS.has(cmd)) throw new Error("bad command");
          send({ cmd, arg: typeof arg === "string" ? arg.slice(0, 300) : !!arg });
          res.writeHead(204); res.end();
        } catch { res.writeHead(400); res.end(); }
      });
      return;
    }
    res.writeHead(404); res.end();
  }

  async function info() {
    const url = `http://${lanAddress()}:${server.address().port}/?t=${token}`;
    return { url, qr: await QR.toDataURL(url, { margin: 1, width: 320 }) };
  }

  return {
    async start({ newToken } = {}) {
      if (newToken) { this.stop(); token = loadToken(true); }
      if (server) return info();
      token = token || loadToken(false);
      server = http.createServer(handle);
      await new Promise((resolve, reject) => {
        server.once("error", err => {
          if (err.code === "EADDRINUSE") { server.listen(0, "0.0.0.0", resolve); } else reject(err);
        });
        server.listen(PREFERRED_PORT, "0.0.0.0", resolve);
      });
      return info();
    },
    stop() {
      for (const c of clients) c.end();
      clients.clear();
      if (server) { server.close(); server = null; }
    },
    setStatus(s) {
      status = s; const json = JSON.stringify(status);
      if (json === statusJson) return;
      statusJson = json;
      for (const c of clients) c.write(`data: ${json}\n\n`);
    },
  };
}

module.exports = { createRemote };
