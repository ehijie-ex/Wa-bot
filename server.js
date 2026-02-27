// ==============================================
// DOM-X WHATSAPP BOT — FULL PAIRING ENABLED
// ==============================================

const { default: makeWASocket, DisconnectReason, useSingleFileAuthState } = require('@whiskeysockets/baileys');
const P = require('pino');
const axios = require('axios');

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// ===== BOT AUTH STATE =====
const { state, saveState } = useSingleFileAuthState('./auth_info.json');

// ===== PAIRING STORAGE =====
const activePairs = {}; // phoneNumber -> WhatsApp JID

// ===== RENDER SERVER URL =====
const SERVER_URL = "https://domgen-bot2.onrender.com";

// ===== INIT BOT =====
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
      console.log('✅ Bot connected!');
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
        await sock.sendMessage(from, { text: '❌ Usage: /pair <your 6-digit code from website>' });
        return;
      }

      const code = args[1];

      try {
        const { data } = await axios.get(`${SERVER_URL}/verify?code=${code}&number=${from.replace('@s.whatsapp.net','')}`);
        if (data.success) {
          activePairs[from] = true;
          await sock.sendMessage(from, { text: '✅ Pairing successful! You can now use bot commands.' });
        } else {
          await sock.sendMessage(from, { text: '❌ Invalid or expired code. Please get a new code from the website.' });
        }
      } catch (err) {
        console.error(err);
        await sock.sendMessage(from, { text: '❌ Error connecting to the server. Try again later.' });
      }
      return;
    }

    // ===== SAMPLE COMMAND AFTER PAIRING =====
    if (text.startsWith('/hello')) {
      if (!activePairs[from]) {
        await sock.sendMessage(from, { text: '❌ You must pair first using /pair <code>' });
        return;
      }
      await sock.sendMessage(from, { text: '👋 Hello! Bot is active.' });
    }
  });

  sock.ev.on('creds.update', saveState);
}

startBot().catch(console.error);

// ===== OPTIONAL EXPRESS API =====
// You can also host a small API if needed
app.get('/', (req, res) => res.send('DOM-X Bot is running!'));

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
