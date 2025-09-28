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
    res.json(results); // ✅ 永遠回 200
  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.status(200).end(); // 就算失敗也回 200，避免 LINE 重試
  }
});

// webhook handler
async function handleEvent(event) {
  if (event.type === "message" && event.message.type === "text") {
    const userId = event.source.userId;
    const text = event.message.text.trim();

    if (text === "購物") {
      return client.replyMessage(event.replyToken, {
        type: "text",
        text:
          "🛒 歡迎來到 Brain-Fog-Cafe\n\n" +
          "👉 請點擊以下連結進入購物網站：\n" +
          "https://brain-fog-rho.vercel.app\n\n" +
          "📌 使用方式：\n" +
          "1. 選購商品並下單\n" +
          "2. 取貨方式可選 7-11 或 北投 STORY\n" +
          "3. 下單後您會收到 LINE 通知\n\n" +
          "若要接收訂單更新，請先輸入：\n「綁定 姓名(與7-11取貨證件姓名相同) 電話(與7-11取貨通知手機相同)」",
      });
    }

    if (text.startsWith("綁定")) {
      // 保留綁定的程式
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: `✅ 綁定成功！你的 userId 是：${userId}`,
      });
    }

    // 其他訊息
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: `🔍 你的 userId 是：${userId}\n輸入「購物」可獲得購物網站連結`,
    });
  }
  return Promise.resolve(null);
}


// =======================
// 4. Notify API (Vercel → LINE)
// =======================
// Vercel 呼叫這個 API，傳進 bossText / buyerText
app.post("/notify", async (req, res) => {
  try {
    const { bossText, buyerText, userId } = req.body;
    const bossId = process.env.BOSS_LINE_ID;

    const results = {};

    if (bossId && bossText) {
      try {
        await client.pushMessage(bossId, { type: "text", text: bossText });
        results.boss = "✅ 已發送給老闆";
      } catch (err) {
        results.boss = `❌ 老闆訊息失敗: ${err.message}`;
      }
    }

    if (userId && buyerText) {
      try {
        await client.pushMessage(userId, { type: "text", text: buyerText });
        results.buyer = "✅ 已發送給買家";
      } catch (err) {
        results.buyer = `❌ 買家訊息失敗: ${err.message}`;
      }
    }

    res.json(results);
  } catch (err) {
    console.error("❌ Notify error:", err);
    res.status(500).json({ error: "Notify failed", detail: err.message });
  }
});


// =======================
// 5. 啟動
// =======================
app.listen(port, () => {
  console.log(`✅ LINE Bot server running on port ${port}`);
});
