// =======================
// 1. 基本設定
// =======================
const express = require("express");
const line = require("@line/bot-sdk");
const { google } = require("googleapis");

const app = express();
const port = process.env.PORT || 3000;

// LINE Bot 設定
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);

// Google Sheets 設定
const SHEET_ID = process.env.SHEET_ID;
const GOOGLE_CREDENTIALS = JSON.parse(process.env.GOOGLE_CREDENTIALS);

async function getAuth() {
  const auth = new google.auth.GoogleAuth({
    credentials: GOOGLE_CREDENTIALS,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return auth.getClient();
}

// JSON 解析
app.use(express.json());

// =======================
// 2. 健康檢查
// =======================
app.get("/", (req, res) => {
  res.send("LINE Bot running ✅");
});

// =======================
// 3. LINE Webhook (綁定用)
// =======================
app.post("/webhook", line.middleware(config), async (req, res) => {
  try {
    const results = await Promise.all(req.body.events.map(handleEvent));
    res.json(results);
  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.status(500).end();
  }
});

async function handleEvent(event) {
  if (event.type === "message" && event.message.type === "text") {
    const userId = event.source.userId;
    const text = event.message.text.trim();

    if (text.startsWith("綁定")) {
      // 格式：綁定 王小明 0912345678
      const parts = text.split(" ");
      const name = parts[1] || "";
      const phone = parts[2] || "";

      const auth = await getAuth();
      const sheets = google.sheets({ version: "v4", auth });

      // 寫入 users 表: userId, name, phone, timestamp
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: "users!A:D",
        valueInputOption: "RAW",
        requestBody: {
          values: [[userId, name, phone, new Date().toISOString()]],
        },
      });

      return client.replyMessage(event.replyToken, {
        type: "text",
        text: `✅ 綁定成功！\n名字：${name}\n電話：${phone}\n以後訂單會自動通知您。`,
      });
    }

    // 印出 userId 方便測試
    console.log("🔍 userId:", userId);
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: `你的 userId 是：${userId}\n若要綁定請輸入：綁定 姓名 電話`,
    });
  }
  return Promise.resolve(null);
}

// =======================
// 4. Vercel 通知訂單 API
// =======================
app.post("/notify", async (req, res) => {
  try {
    const { orderId, buyerName, buyerPhone, pickup, storeName, cart, total, userId } = req.body;
    const bossId = process.env.BOSS_LINE_ID; // 老闆的 LINE UserId

    const orderText =
      `📦 新訂單通知\n` +
      `編號：${orderId}\n` +
      `姓名：${buyerName}\n` +
      `電話：${buyerPhone}\n` +
      `取貨：${pickup}${pickup === "7-11" ? ` (${storeName})` : ""}\n\n` +
      `商品：\n${cart.map(i => `${i.name} x${i.qty}`).join("\n")}\n\n` +
      `💰 總計：NT$${total}`;

    // 通知老闆
    await client.pushMessage(bossId, { type: "text", text: orderText });

    // 如果使用者有綁定，通知使用者
    if (userId) {
      await client.pushMessage(userId, {
        type: "text",
        text: `🎉 訂單成立！\n編號：${orderId}\n金額：NT$${total}\n感謝您的訂購 🙏`,
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Notify error:", err);
    res.status(500).json({ error: "Notify failed" });
  }
});

// =======================
// 5. 啟動
// =======================
app.listen(port, () => {
  console.log(`✅ LINE Bot server running on port ${port}`);
});
