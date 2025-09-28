const express = require("express");
const line = require("@line/bot-sdk");

const app = express();
const port = process.env.PORT || 3000;

// LINE Bot 設定（Render 環境變數）
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);

// JSON parser
app.use(express.json());

// 健康檢查
app.get("/", (req, res) => {
  res.send("LINE Bot running ✅");
});

// Webhook
app.post("/webhook", line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error("❌ Webhook error:", err);
      res.status(200).end(); // 🔑 一定要回 200
    });
});

async function handleEvent(event) {
  if (event.type === "message" && event.message.type === "text") {
    const userId = event.source.userId;
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
