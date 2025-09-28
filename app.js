// =======================
// 1. 基本設定
// =======================
const express = require("express");
const line = require("@line/bot-sdk");

const app = express();
const port = process.env.PORT || 3000;

// LINE Bot 設定（環境變數要在 Render 設定好）
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);

// =======================
// 2. 健康檢查
// =======================
app.get("/", (req, res) => {
  res.send("LINE Bot running ✅");
});

// =======================
// 3. LINE Webhook
// =======================
app.post("/webhook", line.middleware(config), async (req, res) => {
  try {
    const results = await Promise.all(req.body.events.map(handleEvent));
    res.json(results); // ✅ 永遠回 200
  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.status(200).end(); // 就算失敗也回 200
  }
});

// webhook handler
async function handleEvent(event) {
  if (event.type === "message" && event.message.type === "text") {
    const userId = event.source.userId;
    const text = event.message.text.trim();

    if (text === "綁定") {
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: `✅ 綁定成功！你的 userId 是：${userId}\n我會在訂單成立時通知你。`,
      });
    }

    console.log("🔍 收到 userId:", userId);
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: `你的 userId 是：${userId}\n輸入「綁定」可接收訂單通知`,
    });
  }
  return Promise.resolve(null);
}

// =======================
// 4. Notify API (Vercel → LINE)
// =======================

// ⚠️ 這裡才加 express.json()
app.use(express.json());

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

    // 推送給老闆
    if (bossId) {
      await client.pushMessage(bossId, { type: "text", text: orderText });
    }

    // 如果有 userId，推送給買家
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
