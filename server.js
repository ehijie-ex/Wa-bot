// ==============================================
// XPROVERCE MINI - BOT SERVER + PAIRING API
// ==============================================

const express = require('express');
const { default: makeWASocket, useSingleFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const P = require('pino');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS so the website can call this server
app.use(cors());

// ===== AUTH STATE FOR BOT =====
const { state, saveState } = useSingleFileAuthState('./auth_info.json');

// ===== IN-MEMORY STORAGE =====
const pairingCodes = {};  // code -> { number, expires }
const activePairs = {};   // number -> true

// ===== API: Generate Pairing Code =====
app.get('/numx', (req, res) => {
  const number = req.query.number;
  if (!number) return res.status(400).json({ error: 'Missing number' });

  // Generate 6-digit code
  const code = crypto.randomInt(100000, 999999).toString();

  // Save code with 10-min expiration
  pairingCodes[code] = { number, expires: Date.now() + 10 * 60 * 1000 };

  console.log(`[API] Generated code ${code} for ${number}`);
  res.json({ code });
});

// ===== API: Verify Code =====
app.get('/verify', (req, res) => {
  const { code, number } = req.query;
  if (!code || !number) return res.status(400).json({ success: false });

  const entry = pairingCodes[code];
  if (!entry) return res.json({ success: false });
  if (entry.number !== number) return res.json({ success: false });
  if (entry.expires < Date.now()) {
    delete pairingCodes[code];
    return res.json({ success: false });
  }

  // Code is valid
  activePairs[number] = true;
  delete pairingCodes[code];

  console.log(`[API] Verified code ${code} for ${number}`);
  res.json({ success: true });
});

// ===== START EXPRESS SERVER =====
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// ===== START WHATSAPP BOT =====
async function startBot() {
  const sock = makeWASocket({
    logger: P({ level: 'silent' }),
    printQRInTerminal: true,
    auth: state
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      if ((lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut) {
        startBot();
      }
    }
    if (connection === 'open') {
      console.log('✅ WhatsApp Bot connected!');
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
    if (!text) return;

    // ===== PAIR COMMAND =====
    if (text.startsWith('/pair')) {
      const args = text.split(' ');
      if (args.length < 2) {
        await sock.sendMessage(from, { text: '❌ Usage: /pair <6-digit code from website>' });
        return;
      }

      const code = args[1];
      const phoneNumber = from.replace('@s.whatsapp.net','');

      // Call server API to verify
      try {
        const axios = require('axios');
        const { data } = await axios.get(`http://localhost:${PORT}/verify?code=${code}&number=${phoneNumber}`);
        if (data.success) {
          await sock.sendMessage(from, { text: '✅ Pairing successful! You can now use bot commands.' });
        } else {
          await sock.sendMessage(from, { text: '❌ Invalid or expired code. Get a new code from the website.' });
        }
      } catch (err) {
        console.error(err);
        await sock.sendMessage(from, { text: '❌ Error verifying code. Try again later.' });
      }
      return;
    }

    // ===== SAMPLE BOT COMMAND AFTER PAIRING =====
    if (text.startsWith('/hello')) {
      const phoneNumber = from.replace('@s.whatsapp.net','');
      if (!activePairs[phoneNumber]) {
        await sock.sendMessage(from, { text: '❌ You must pair first using /pair <code>' });
        return;
      }
      await sock.sendMessage(from, { text: '👋 Hello! Bot is active and paired.' });
    }
  });

  sock.ev.on('creds.update', saveState);
}

startBot().catch(console.error);
