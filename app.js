const express = require("express");
const line = require("@line/bot-sdk");

const app = express();
app.use(express.json());

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);

// 1️⃣ LINE 官方 Webhook (防呆用)
app.post("/webhook", (req, res) => {
  res.json({ status: "ok" });
});

// 2️⃣ 訂單通知 API (給 Vercel 呼叫)
app.post("/notify-order", async (req, res) => {
  try {
    const { orderId, total, cart, buyerName, buyerPhone, pickup, storeName } = req.body;

    const message = 
`📦 新訂單通知
編號：${orderId}
金額：NT$${total}
姓名：${buyerName}
電話：${buyerPhone}
取貨方式：${pickup}${pickup === "7-11" ? `（${storeName}）` : ""}
商品：
${cart.map(i => `${i.name} x${i.qty}`).join("\n")}`;

    await client.pushMessage(process.env.ADMIN_USER_ID, {
      type: "text",
      text: message,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("❌ LINE Notify error:", err);
    res.status(500).json({ error: "Failed to notify LINE" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`✅ LINE Bot running on ${port}`));
