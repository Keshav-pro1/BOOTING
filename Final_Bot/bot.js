const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
} = require("@whiskeysockets/baileys");
const P = require("pino");
const qrcode = require("qrcode-terminal");
const fs = require("fs");

const OWNER_NUMBERS = [
  "919810796194@s.whatsapp.net",
  "918595872876@s.whatsapp.net",
  "919971382945@s.whatsapp.net",
  "919818879172@s.whatsapp.net",
];

const latestHackathons = [
  "https://devfolio.co/hackathons",
  "https://dorahacks.io/hackathon",
  "https://unstop.com/hackathons",
  "https://mlh.io",
];

const GREET_STORE_FILE = "greeted.json";
let greetedMembers = {};
if (fs.existsSync(GREET_STORE_FILE)) {
  greetedMembers = JSON.parse(fs.readFileSync(GREET_STORE_FILE));
}
function saveGreeted() {
  fs.writeFileSync(GREET_STORE_FILE, JSON.stringify(greetedMembers));
}

async function startBot() {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

  const sock = makeWASocket({
    auth: state,
    version,
    logger: P({ level: "silent" }),
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, qr, lastDisconnect }) => {
    if (qr) qrcode.generate(qr, { small: true });
    if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
      if (shouldReconnect) startBot();
    }
    if (connection === "open") {
      console.log("Connected to WhatsApp");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const msg = messages[0];
    if (!msg.message) return;
    if (!msg.key.remoteJid.endsWith("@g.us")) return;

    const sender = jidNormalizedUser(msg.key.participant || msg.key.remoteJid);
    const text =
      msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    let trimmedText = text.trim();
    const groupId = msg.key.remoteJid;

    const lowerText = trimmedText.toLowerCase();

    // .ping command
    if (lowerText === ".ping") {
      await sock.sendMessage(groupId, { text: "Pong!" }, { quoted: msg });
      return;
    }

    // .tagall command (owners only)
    if (lowerText === ".tagall") {
      if (!OWNER_NUMBERS.includes(sender)) {
        await sock.sendMessage(
          groupId,
          { text: "You are not authorized to use this command." },
          { quoted: msg }
        );
        return;
      }
      const groupMeta = await sock.groupMetadata(groupId);
      const participants = groupMeta.participants;
      const mentionText = participants
        .map((p) => {
          const isAdmin = p.admin === "admin" || p.admin === "superadmin";
          const username = `@${p.id.split("@")[0]}`;
          return isAdmin ? `${username} 👑` : username;
        })
        .join("\n");
      const mentionIDs = participants.map((p) => p.id);
      await sock.sendMessage(
        groupId,
        { text: `Tagging everyone:\n${mentionText}`, mentions: mentionIDs },
        { quoted: msg }
      );
      return;
    }

    // .hackathon command
    if (lowerText === ".hackathon") {
      const message =
        "Here are some links for the latest hackathons:\n" +
        latestHackathons.map((link) => `- ${link}`).join("\n");
      await sock.sendMessage(groupId, { text: message }, { quoted: msg });
      return;
    }

    // .spammessage command (owners only)
    if (lowerText.startsWith(".spammessage ")) {
      if (!OWNER_NUMBERS.includes(sender)) {
        await sock.sendMessage(
          groupId,
          { text: "You are not authorized to use this command." },
          { quoted: msg }
        );
        return;
      }
      const spamMsg = trimmedText.slice(12).trim();
      if (!spamMsg) {
        await sock.sendMessage(
          groupId,
          { text: "Please provide a message to spam. Usage: .spamMessage your message" },
          { quoted: msg }
        );
        return;
      }
      for (let i = 0; i < 5; i++) {
        await sock.sendMessage(groupId, { text: spamMsg });
        await new Promise((r) => setTimeout(r, 1000));
      }
      return;
    }

    // Garuda help command
    if (lowerText === "garuda -h") {
      const helpText = `Garuda Bot Commands:
- .ping : Check if bot is responsive
- .tagall : Tag all members (owners only)
- .hackathon : Get latest hackathon links
- .spamMessage <message> : Bot spams the message (owners only)
- Garuda -h : Show this help message
- .greet <name or number> : Greet member by display name or number (admin only, partial match allowed)`;
      await sock.sendMessage(groupId, { text: helpText }, { quoted: msg });
      return;
    }

    // .greet <name or number> command (admin only)
    if (lowerText.startsWith(".greet ")) {
      const groupMeta = await sock.groupMetadata(groupId);

      // Admin check
      const isAdmin = groupMeta.participants.some(
        (p) =>
          p.id === sender && (p.admin === "admin" || p.admin === "superadmin")
      );
      if (!OWNER_NUMBERS.includes(sender) || !isAdmin) {
        await sock.sendMessage(
          groupId,
          { text: "Only group admins can use the .greet command. 😎" },
          { quoted: msg }
        );
        return;
      }

      // Get name/number argument without .greet prefix
      const searchName = trimmedText.slice(7).replace(/^@/, "").trim().toLowerCase();
      if (!searchName) {
        await sock.sendMessage(
          groupId,
          { text: "Usage: .greet <name or number> (partial match allowed)" },
          { quoted: msg }
        );
        return;
      }
      
      const participants = groupMeta.participants;

      // Match by notify or number substring
      const matched = participants.filter(
        (p) =>
          (p.notify && p.notify.toLowerCase().includes(searchName)) ||
          (p.id && p.id.includes(searchName))
      );

      if (matched.length === 0) {
        await sock.sendMessage(
          groupId,
          { text: `No member found matching "${searchName}". Try .listmembers to see valid names.` },
          { quoted: msg }
        );
        return;
      }

      const mentionIDs = matched.map((p) => p.id);
      const mentionNames = matched.map((p) =>
        p.notify ? p.notify : "New Teammate 🔥"
      ).join(", ");

      const greetMessage = 
        `🚀 Hey there, Techie! 🌟\n` +
        `Welcome to the coolest corner of the internet!🤖✨\n` +
        `Glad to have you onboard, ${mentionNames}!\n\n` +
        `Remember: Here we hack, we snack, and we never back down! 🍕💻🔥\n` +
        `Drop your Skills and let the fun Begin`;

      await sock.sendMessage(
        groupId,
        { text: greetMessage, mentions: mentionIDs },
        { quoted: msg }
      );
      return;
    }
  });
}

startBot();
