const express = require("express");
const line = require("@line/bot-sdk");
const fetch = require("node-fetch");
const app = express();

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);

const API_URL = process.env.GS_API_URL; // 你的 GAS API URL

app.get("/", (req, res) => res.send("LINE Shopping Bot ✅"));

app.post("/webhook", line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(r => res.json(r))
    .catch(err => {console.error(err); res.status(500).end();});
});

async function handleEvent(event) {
  if (event.type==="message" && event.message.type==="text") return handleText(event);
  return null;
}

async function handleText(event) {
  const userId = event.source.userId;
  const text = event.message.text.trim();

  if (text==="購物") return client.replyMessage(event.replyToken, await createShoppingMenu());
  if (text==="購物車") return client.replyMessage(event.replyToken, await getCartMessage(userId));
  if (text==="結帳") return client.replyMessage(event.replyToken, await checkoutOrder(userId));
  if (text==="訂單") return client.replyMessage(event.replyToken, await getOrdersMessage(userId));

  return client.replyMessage(event.replyToken, {type:"text", text:"輸入「購物」「購物車」「結帳」「訂單」"});
}

// === 功能 ===

// 商品選單
async function createShoppingMenu() {
  const resp = await fetch(`${API_URL}?action=products`);
  const products = await resp.json();

  return {
    type:"flex", altText:"購物商品",
    contents:{
      type:"carousel",
      contents:products.map(p=>({
        type:"bubble",
        body:{
          type:"box", layout:"vertical", contents:[
            {type:"text", text:p.name, weight:"bold", size:"xl"},
            {type:"text", text:p.description, wrap:true, size:"sm", color:"#666"},
            {type:"text", text:`NT$${p.price}`, size:"lg", color:"#e53935", weight:"bold"}
          ]
        },
        footer:{
          type:"box", layout:"vertical", contents:[
            {
              type:"button", style:"primary", color:"#ff5551",
              action:{type:"postback", label:"加入購物車", data:`action=add_to_cart&item_id=${p.item_id}`}
            }
          ]
        }
      }))
    }
  };
}

// 購物車訊息
async function getCartMessage(userId) {
  const resp = await fetch(`${API_URL}?action=cart&user_id=${userId}`);
  const data = await resp.json();
  if (!data.items || data.items.length===0) return {type:"text", text:"🛒 購物車是空的"};

  let text="🛒 你的購物車：\n\n";
  data.items.forEach(i=> text+=`${i.name} x${i.quantity} ＝ NT$${i.subtotal}\n`);
  text+=`\n總計：NT$${data.total}\n👉 輸入「結帳」即可完成訂單`;
  return {type:"text", text};
}

// 結帳
async function checkoutOrder(userId) {
  const resp = await fetch(API_URL,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"checkout", user_id:userId})
  });
  const result = await resp.json();

  if (result.status==="success") {
    return {
      type:"flex", altText:"訂單確認",
      contents:{
        type:"bubble",
        body:{
          type:"box", layout:"vertical", contents:[
            {type:"text", text:"🎉 訂單確認", weight:"bold", size:"xl", color:"#2e7d32"},
            {type:"text", text:`訂單編號：${result.order_id}`, wrap:true, margin:"md"},
            {type:"text", text:`總金額：NT$${result.total}`, margin:"sm", weight:"bold", color:"#d32f2f"}
          ]
        }
      }
    };
  } else {
    return {type:"text", text:"❌ 結帳失敗："+result.message};
  }
}

// 訂單查詢
async function getOrdersMessage(userId) {
  const resp = await fetch(`${API_URL}?action=orders&user_id=${userId}`);
  const orders = await resp.json();
  if (!orders || orders.length===0) return {type:"text", text:"📋 尚無訂單記錄"};

  let text="📋 訂單記錄：\n\n";
  orders.forEach(o=>{
    text+=`訂單 ${o.order_id}\n金額：NT$${o.total}\n狀態：${o.status}\n\n`;
  });
  return {type:"text", text};
}

const port=process.env.PORT||3000;
app.listen(port,()=>console.log("Bot running on "+port));
