const express = require("express");
const P = require("pino");
const QRCode = require("qrcode");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const app = express();
const PORT = process.env.PORT || 3000;

// 🔥 For Render Persistent Disk
const SESSION_PATH = "/opt/render/project/src/session";

let sock;
let qrCodeData = null;
let startTime = Date.now();

// ================= START BOT =================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger: P({ level: "silent" }),
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, P({ level: "silent" })),
    },
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCodeData = qr;
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) startBot();
    }

    if (connection === "open") {
      console.log("✅ Bot Connected");
      qrCodeData = null;
    }
  });

  // ================= COMMAND HANDLER =================
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    if (!text.startsWith(".")) return;

    const command = text.slice(1).toLowerCase();

    if (command === "ping") {
      await sock.sendMessage(from, { text: "🏓 Pong!" });
    }

    if (command === "uptime") {
      const uptime = Math.floor((Date.now() - startTime) / 1000);
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = uptime % 60;

      const uptimeText = `
> ╭━━━━━━━━
> ┃ *Uptime:* ${hours}h ${minutes}m ${seconds}s
> ╰━━━━━━━━
> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝐃Ω𝐌𝐆Ξ𝐍©*
`;

      await sock.sendMessage(from, { text: uptimeText });
    }
  });
}

startBot();

// ================= SERVE WEBSITE =================
app.use(express.static("public"));

// Pairing Code Route
app.get("/code", async (req, res) => {
  const number = req.query.number;

  if (!number) {
    return res.json({ code: "ENTER NUMBER" });
  }

  try {
    const code = await sock.requestPairingCode(number);
    res.json({ code });
  } catch (err) {
    res.json({ code: "FAILED" });
  }
});

// QR Route
app.get("/qr", async (req, res) => {
  if (!qrCodeData) {
    return res.send("<h2>No QR available. Restart server.</h2>");
  }

  const qrImage = await QRCode.toDataURL(qrCodeData);

  res.send(`
    <html>
    <head><title>QR Code</title></head>
    <body style="text-align:center;background:#121212;color:white;">
        <h2>Scan QR Code</h2>
        <img src="${qrImage}" />
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});

// Prevent Render sleep spam
setInterval(() => {
  console.log("Bot still alive...");
}, 30000);
