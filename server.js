// ==============================================
// DOM-X BOT — FULL REBUILD WITH COMMANDS
// ==============================================
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const P = require('pino');
const axios = require('axios');

const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// -------------------
// In-memory storage
// -------------------
let pairingCodes = {}; // senderId -> code

// -------------------
// Express endpoint to fetch pairing code from your website
// -------------------
app.get('/code', async (req, res) => {
    const { number } = req.query;
    if (!number) return res.json({ code: 'Failed', message: 'No number provided' });

    try {
        const response = await axios.get(`https://domgen-bot2.onrender.com/code?number=${number}`);
        res.json({ code: response.data.code || 'Failed' });
    } catch (err) {
        res.json({ code: 'Failed', message: 'Error fetching code' });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// -------------------
// WhatsApp Bot Setup
// -------------------
(async () => {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
        logger: P({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if(connection === 'close') {
            const reason = lastDisconnect.error?.output?.statusCode;
            console.log('Disconnected:', reason);
        } else if(connection === 'open') {
            console.log('Bot connected!');
        }
    });

    // -------------------
    // Command handling
    // -------------------
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!text) return;

        const cmd = text.toLowerCase();

        // --- START ---
        if (cmd === '/start') {
            await sock.sendMessage(sender, { text: 'Hello! Welcome to DOM-X Bot.\nUse /pair to get your pairing code.\nUse /help for commands.' });
        }

        // --- HELP ---
        else if (cmd === '/help') {
            await sock.sendMessage(sender, { text: 'Available commands:\n/start - Welcome message\n/pair - Get pairing code\n/help - Show commands' });
        }

        // --- PAIR ---
        else if (cmd === '/pair') {
            try {
                // fetch pairing code from your website
                const res = await axios.get(`https://domgen-bot2.onrender.com/code?number=${sender.replace('@s.whatsapp.net','')}`);
                const code = res.data.code || Math.floor(100000 + Math.random() * 900000).toString();
                pairingCodes[sender] = code;

                await sock.sendMessage(sender, { text: `Your pairing code is:\n${code}\nEnter this code in your website to link your device.` });
            } catch (err) {
                await sock.sendMessage(sender, { text: 'Error fetching pairing code. Try again later.' });
                console.error(err);
            }
        }
    });

})();
