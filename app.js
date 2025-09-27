// =======================
// 📌 1. 基本設定
// =======================
const express = require("express");
const line = require("@line/bot-sdk");
const { google } = require("googleapis");

const app = express();
const port = process.env.PORT || 3000;

// LINE Bot 設定（⚠️ Render 環境變數要設好）
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);

// Google Sheets 設定（⚠️ Render 環境變數要設好）
const SHEET_ID = process.env.SHEET_ID;
const GOOGLE_CREDENTIALS = JSON.parse(process.env.GOOGLE_CREDENTIALS);

async function getAuth() {
  const auth = new google.auth.GoogleAuth({
    credentials: GOOGLE_CREDENTIALS,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return auth.getClient();
}

// =======================
// 📌 2. 健康檢查
// =======================
app.get("/", (req, res) => {
  res.send("LINE Bot + Google Sheets running ✅");
});

// =======================
// 📌 3. LINE Webhook
// =======================
app.post("/webhook", line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error("Webhook error:", err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  if (event.type === "message" && event.message.type === "text") {
    return handleTextMessage(event);
  } else if (event.type === "postback") {
    return handlePostback(event);
  }
  return Promise.resolve(null);
}

// =======================
// 📌 4. Google Sheets 操作
// =======================

// 讀取商品
async function getProducts() {
  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "products!A2:D",
  });

  const rows = res.data.values || [];
  let products = {};
  rows.forEach((row) => {
    const [item_id, name, price, description] = row;
    products[item_id] = { name, price: Number(price), description };
  });

  return products;
}

// 加入購物車
async function addToCart(userId, itemId) {
  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "cart!A:E",
    valueInputOption: "RAW",
    requestBody: {
      values: [[userId, itemId, 1, new Date().toISOString(), "active"]],
    },
  });
}

// 查看購物車
async function getCart(userId) {
  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "cart!A:E",
  });

  const rows = res.data.values || [];
  return rows.filter((r) => r[0] === userId && r[4] === "active");
}

// 建立訂單
async function createOrder(userId) {
  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const userCart = await getCart(userId);
  if (userCart.length === 0) return null;

  const orderId = "ORD" + Date.now();
  let total = 0;
  let orderItems = [];

  const products = await getProducts();
  for (let r of userCart) {
    const itemId = r[1];
    const qty = Number(r[2]);
    const product = products[itemId];
    if (product) {
      total += product.price * qty;
      orderItems.push(`${product.name} x${qty}`);

      // 寫入 order_items
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: "order_items!A:E",
        valueInputOption: "RAW",
        requestBody: {
          values: [[orderId, itemId, product.name, qty, product.price]],
        },
      });
    }
  }

  // 寫入 orders
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "orders!A:E",
    valueInputOption: "RAW",
    requestBody: {
      values: [[orderId, userId, total, new Date().toISOString(), "paid"]],
    },
  });

  // 清空購物車（標記 inactive）
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "cart!A:E",
  });
  const cartRows = res.data.values || [];
  for (let i = 0; i < cartRows.length; i++) {
    if (cartRows[i][0] === userId && cartRows[i][4] === "active") {
      const rowIndex = i + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `cart!E${rowIndex}`,
        valueInputOption: "RAW",
        requestBody: { values: [["inactive"]] },
      });
    }
  }

  return { orderId, total, items: orderItems };
}

// =======================
// 📌 5. 處理 LINE Bot 訊息
// =======================
async function handleTextMessage(event) {
  const userId = event.source.userId;
  const text = event.message.text.toLowerCase();

  if (text === "購物") {
    const products = await getProducts();

    return client.replyMessage(event.replyToken, {
      type: "flex",
      altText: "購物商品",
      contents: {
        type: "carousel",
        contents: Object.keys(products).map((itemId) => {
          const p = products[itemId];
          return {
            type: "bubble",
            body: {
              type: "box",
              layout: "vertical",
              contents: [
                { type: "text", text: p.name, weight: "bold", size: "xl" },
                { type: "text", text: p.description, size: "sm", wrap: true },
                { type: "text", text: `NT$${p.price}`, weight: "bold", color: "#ff5551" },
              ],
            },
            footer: {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "button",
                  style: "primary",
                  color: "#ff5551",
                  action: {
                    type: "postback",
                    label: "加入購物車",
                    data: `action=add_to_cart&item_id=${itemId}`,
                  },
                },
              ],
            },
          };
        }),
      },
    });
  } else if (text === "購物車") {
    const userCart = await getCart(userId);
    if (userCart.length === 0) {
      return client.replyMessage(event.replyToken, { type: "text", text: "🛒 購物車是空的" });
    }

    const products = await getProducts();
    let cartText = "🛒 購物車內容：\n\n";
    let total = 0;

    userCart.forEach((r) => {
      const itemId = r[1];
      const qty = Number(r[2]);
      const product = products[itemId];
      if (product) {
        cartText += `${product.name} x${qty} = NT$${product.price * qty}\n`;
        total += product.price * qty;
      }
    });
    cartText += `\n總計：NT$${total}\n👉 點「立即結帳」完成訂單`;

    return client.replyMessage(event.replyToken, {
      type: "flex",
      altText: "購物車內容",
      contents: {
        type: "bubble",
        body: { type: "box", layout: "vertical", contents: [{ type: "text", text: cartText, wrap: true }] },
        footer: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "button",
              style: "primary",
              color: "#00b300",
              action: { type: "postback", label: "立即結帳", data: "action=checkout" },
            },
          ],
        },
      },
    });
  } else if (text === "訂單") {
    return client.replyMessage(event.replyToken, { type: "text", text: "📋 訂單查詢功能開發中" });
  }

  return client.replyMessage(event.replyToken, {
    type: "text",
    text: "輸入「購物」查看商品\n輸入「購物車」查看購物車\n輸入「訂單」查看訂單",
  });
}

async function handlePostback(event) {
  const userId = event.source.userId;
  const data = new URLSearchParams(event.postback.data);
  const action = data.get("action");

  if (action === "add_to_cart") {
    const itemId = data.get("item_id");
    await addToCart(userId, itemId);
    return client.replyMessage(event.replyToken, { type: "text", text: "✅ 已加入購物車" });
  } else if (action === "checkout") {
    const order = await createOrder(userId);
    if (!order) {
      return client.replyMessage(event.replyToken, { type: "text", text: "⚠️ 購物車是空的" });
    }
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: `🎉 訂單成立！\n編號：${order.orderId}\n金額：NT$${order.total}\n${order.items.join("\n")}`,
    });
  }
}

// =======================
// 📌 6. 管理後台 (簡單示範)
// =======================
app.get("/admin", (req, res) => {
  res.send("<h1>🛒 Admin 後台</h1><p>這裡可以顯示訂單數據（之後加）</p>");
});

// =======================
// 📌 7. 啟動
// =======================
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
