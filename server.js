const express = require("express");
const P = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const app = express();
const PORT = process.env.PORT || 3000;

// 🔥 IMPORTANT FOR RENDER PERSISTENT DISK
const SESSION_PATH = "/opt/render/project/src/session";

let sock;
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
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) startBot();
    }

    if (connection === "open") {
      console.log("✅ Bot Connected");
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

    const prefix = ".";
    if (!text.startsWith(prefix)) return;

    const args = text.slice(1).trim().split(" ");
    const command = args.shift().toLowerCase();

    // ========= UPTIME =========
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

      await sock.sendMessage(from, {
        text: uptimeText,
        contextInfo: {
          forwardingScore: 999,
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: "120363413766641596@newsletter",
            newsletterName: "𝐃Ω𝐌𝐆Ξ𝐍-𝑴𝑫 𝑩𝑶𝑻",
            serverMessageId: Math.floor(Math.random() * 1_000_000_000),
          },
        },
      });
    }

    // ========= PING =========
    if (command === "ping") {
      await sock.sendMessage(from, { text: "🏓 Pong!" });
    }
  });
}

startBot();

// ================= WEBSITE ROUTES =================

// Pairing Code API
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

// Home Route
app.get("/", (req, res) => {
  res.send("𝐃Ω𝐌𝐆Ξ𝐍-𝑴𝑫 BOT + WEBSITE CONNECTED ✅");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// 🔥 Prevent Render idle freeze
setInterval(() => {
  console.log("Bot still alive...");
}, 30000);
