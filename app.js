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

// JSON 解析
app.use(express.json());

// 健康檢查
app.get("/", (req, res) => {
  res.send("LINE Bot running ✅");
});

// Webhook
app.post("/webhook", line.middleware(config), async (req, res) => {
  try {
    const results = await Promise.all(req.body.events.map(handleEvent));
    res.json(results); // ✅ 確保回 200
  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.status(200).end(); // ❗️就算出錯也回 200
  }
});

// 測試 handler
async function handleEvent(event) {
  if (event.type === "message" && event.message.type === "text") {
    const userId = event.source.userId;
    console.log("🔍 收到 userId:", userId);

    return client.replyMessage(event.replyToken, {
      type: "text",
      text: `你的 userId 是：${userId}`,
    });
  }
  return Promise.resolve(null);
}

// 啟動
app.listen(port, () => {
  console.log(`✅ LINE Bot server running on port ${port}`);
});
