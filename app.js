const express = require("express");
const line = require("@line/bot-sdk");

const app = express();
const port = process.env.PORT || 3000;

// LINE Bot 設定
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);

// 解析 JSON
app.use(express.json());

// 健康檢查
app.get("/", (req, res) => {
  res.send("LINE Bot running ✅");
});

// ✅ 接收 Vercel 傳來的訂單
app.post("/notify", async (req, res) => {
  try {
    const { orderId, buyerName, buyerPhone, pickup, storeName, cart, total } = req.body;

    // 老闆的 LINE UserId
    const bossId = process.env.BOSS_LINE_ID;

    const orderText =
      `📦 新訂單通知\n` +
      `編號：${orderId}\n` +
      `姓名：${buyerName}\n` +
      `電話：${buyerPhone}\n` +
      `取貨：${pickup}${pickup === "7-11" ? ` (${storeName})` : ""}\n\n` +
      `商品：\n${cart.map(i => `${i.name} x${i.qty}`).join("\n")}\n\n` +
      `💰 總計：NT$${total}`;

    await client.pushMessage(bossId, { type: "text", text: orderText });

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Notify error:", err);
    res.status(500).json({ error: "Notify failed" });
  }
});

// 啟動
app.listen(port, () => {
  console.log(`✅ LINE Bot server running on port ${port}`);
});
