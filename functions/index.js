const { onValueCreated } = require("firebase-functions/v2/database");
const admin = require("firebase-admin");

admin.initializeApp();

exports.sendVantoriumMessageNotification = onValueCreated(
  "messages/{chatId}/{messageId}",
  async (event) => {
    const msg = event.data.val() || {};
    const chatId = String(event.params.chatId || "");
    const senderUid = String(msg.senderUid || msg.senderId || "");

    if (!senderUid || !msg.text || chatId.startsWith("officialbot_")) {
      return null;
    }

    // Sohbet kimliğinden mesajı gönderen dışındaki kullanıcıları bul.
    const recipients = chatId
      .split("_")
      .filter(uid => uid && uid !== senderUid);

    if (!recipients.length) return null;

    const db = admin.database();
    const tokens = [];

    for (const uid of recipients) {
      const snap = await db.ref("fcmTokens/" + uid).get();
      const value = snap.val();

      if (value && value.token) {
        tokens.push({ uid, token: value.token });
      }
    }

    if (!tokens.length) return null;

    const title = String(
      msg.senderName || msg.senderUsername || "Yeni mesaj"
    );

    const body = String(msg.text)
      .replace(/\s+/g, " ")
      .slice(0, 180);

    const response = await admin.messaging().sendEachForMulticast({
      tokens: tokens.map(item => item.token),
      notification: {
        title: title,
        body: body
      },
      data: {
        chatId: chatId,
        messageId: String(event.params.messageId),
        senderUid: senderUid,
        title: title,
        body: body
      },
      android: {
        priority: "high"
      }
    });

    // Geçersiz tokenları temizle.
    const invalidUids = [];

    response.responses.forEach((result, index) => {
      const code = result.error && result.error.code
        ? result.error.code
        : "";

      if (
        code.includes("registration-token-not-registered") ||
        code.includes("invalid-registration-token")
      ) {
        invalidUids.push(tokens[index].uid);
      }
    });

    for (const uid of invalidUids) {
      await db.ref("fcmTokens/" + uid).remove();
    }

    return null;
  }
);
