// =======================
// 📌 1. 基本設定
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

// 讀取商品（含庫存與行號）
async function getProducts() {
  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "products!A2:E", // A:item_id B:name C:price D:description E:stock
  });

  const rows = res.data.values || [];
  const products = {};
  rows.forEach((row, idx) => {
    const [item_id, name, price, description, stock] = row;
    products[item_id] = {
      name,
      price: Number(price),
      description,
      stock: Number(stock),
      rowIndex: idx + 2, // 對應表格行數（從第2列開始）
    };
  });
  return products;
}

// 加入購物車（先檢查庫存；成功時不回覆訊息以省額度）
async function addToCart(userId, itemId, qty) {
  const products = await getProducts();
  const product = products[itemId];
  if (!product) throw new Error("找不到商品");

  if (qty > product.stock) {
    throw new Error(`${product.name} 庫存不足，剩餘 ${product.stock}`);
  }

  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "cart!A:E",
    valueInputOption: "RAW",
    requestBody: {
      values: [[userId, itemId, qty, new Date().toISOString(), "active"]],
    },
  });
}

// 讀取購物車（active）
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

// 建立訂單（再次檢查並扣庫存）
async function createOrder(userId) {
  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const userCart = await getCart(userId);
  if (userCart.length === 0) return null;

  const orderId = "ORD" + Date.now();
  let total = 0;
  const orderItems = [];

  const products = await getProducts();

  for (const r of userCart) {
    const itemId = r[1];
    const qty = Number(r[2]);
    const product = products[itemId];
    if (!product) continue;

    // 再次檢查庫存（避免並發超賣）
    if (qty > product.stock) {
      throw new Error(`${product.name} 庫存不足，剩餘 ${product.stock}`);
    }

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

    // 扣庫存（更新 products!E）
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `products!E${product.rowIndex}`,
      valueInputOption: "RAW",
      requestBody: { values: [[product.stock - qty]] },
    });
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

  // 標記購物車為 inactive
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "cart!A:E",
  });
  const cartRows = res.data.values || [];
  for (let i = 0; i < cartRows.length; i++) {
    if (cartRows[i][0] === userId && cartRows[i][4] === "active") {
      const rowIndex = i + 1; // 讀的是整張表，從第1列算
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
  const text = (event.message.text || "").toLowerCase();

  if (text === "購物") {
    const products = await getProducts();

    const bubbles = Object.keys(products).map((itemId) => {
      const p = products[itemId];
      return {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            { type: "text", text: p.name, weight: "bold", size: "xl" },
            { type: "text", text: p.description, size: "sm", color: "#666666", margin: "md", wrap: true },
            { type: "text", text: `NT$ ${p.price}`, size: "lg", color: "#ff5551", weight: "bold", margin: "md" },
            { type: "text", text: `📦 庫存：${p.stock}`, size: "sm", color: "#333333", margin: "md" },
          ],
        },
        footer: {
          type: "box",
          layout: "horizontal",
          spacing: "md",
          contents: [1, 2, 3].map((qty) => ({
            type: "button",
            style: "primary",
            color: "#ff5551",
            action: {
              type: "postback",
              label: `${qty}包`,
              data: `action=add_to_cart&item_id=${itemId}&qty=${qty}`,
            },
          })),
        },
      };
    });

    return client.replyMessage(event.replyToken, {
      type: "flex",
      altText: "商品列表",
      contents: { type: "carousel", contents: bubbles },
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
      const p = products[itemId];
      if (p) {
        cartText += `${p.name} x${qty} = NT$${p.price * qty}\n`;
        total += p.price * qty;
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
    // 你要我再補完整的「訂單查詢」也可以，先保留提示
    return client.replyMessage(event.replyToken, { type: "text", text: "📋 訂單查詢功能開發中" });

  } else {
    return client.replyMessage(event.replyToken, {
      type: "text",
      text:
        "輸入「購物」查看商品\n" +
        "輸入「購物車」查看購物車\n" +
        "輸入「訂單」查看訂單",
    });
  }
}

// =======================
// 📌 6. Postback（加入購物車不回覆；錯誤才回覆）
// =======================
async function handlePostback(event) {
  const userId = event.source.userId;
  const data = new URLSearchParams(event.postback.data);
  const action = data.get("action");

  try {
    if (action === "add_to_cart") {
      const itemId = data.get("item_id");
      const qty = Number(data.get("qty")) || 1;
      await addToCart(userId, itemId, qty);
      // 成功時不回覆，省訊息額度
      return Promise.resolve(null);
    }
    else if (action === "checkout") {
      const order = await createOrder(userId);
      if (!order) {
        return client.replyMessage(event.replyToken, { type: "text", text: "⚠️ 購物車是空的" });
      }
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: `🎉 訂單成立！\n編號：${order.orderId}\n金額：NT$${order.total}\n${order.items.join("\n")}`,
      });
    }
  } catch (err) {
    // 只有錯誤時才回覆，讓用戶知道（這一則會算訊息）
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: `❌ 錯誤：${err.message}`,
    });
  }
}

// =======================
// 📌 7. 管理後台（占位）
// =======================
app.get("/admin", (req, res) => {
  res.send("<h1>🛒 Admin 後台</h1><p>這裡可以顯示訂單數據（之後加）</p>");
});

// =======================
// 📌 8. 啟動
// =======================
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
