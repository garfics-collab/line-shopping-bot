const express = require('express');
const line = require('@line/bot-sdk');

const app = express();
const port = process.env.PORT || 3000;

// ⚠️ 確認 Render 環境變數有設置
// CHANNEL_ACCESS_TOKEN, CHANNEL_SECRET
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const client = new line.Client(config);

// 健康檢查
app.get('/', (req, res) => {
  res.send('Server is running ✅');
});

// Webhook 接收 LINE 訊息
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// 處理事件
function handleEvent(event) {
  if (event.type === 'message' && event.message.type === 'text') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `你說了：${event.message.text}`
    });
  }
  return Promise.resolve(null);
}

// 啟動
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
