const express = require('express');
const line = require('@line/bot-sdk');

const app = express();

// LINE Bot 設定
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const client = new line.Client(config);

// 簡單的記憶體儲存（生產環境建議使用資料庫）
let cart = {}; // { userId: [{ itemId, quantity }] }
let orders = {}; // { userId: [{ orderId, items, total }] }

// 商品資料
const products = {
  coffee001: {
    name: '精品咖啡豆',
    price: 680,
    description: '哥倫比亞中度烘焙',
    image: 'https://scdn.line-apps.com/n/channel_devcenter/img/fx/01_1_cafe.png'
  },
  dripper001: {
    name: '手沖咖啡器具組',
    price: 1280,
    description: '不鏽鋼材質600ml',
    image: 'https://scdn.line-apps.com/n/channel_devcenter/img/fx/01_2_restaurant.png'
  }
};

// 處理 LINE Webhook
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error('Error:', err);
      res.status(500).end();
    });
});

// 處理事件
async function handleEvent(event) {
  if (event.type === 'message' && event.message.type === 'text') {
    return handleTextMessage(event);
  } else if (event.type === 'postback') {
    return handlePostback(event);
  }
  
  return Promise.resolve(null);
}

// 處理文字訊息
async function handleTextMessage(event) {
  const userId = event.source.userId;
  const text = event.message.text.toLowerCase();
  
  let replyMessage;
  
  if (text === '購物' || text === 'shop') {
    replyMessage = createShoppingMenu();
  } else if (text === '購物車' || text === 'cart') {
    replyMessage = createCartMessage(userId);
  } else if (text === '訂單' || text === 'orders') {
    replyMessage = createOrdersMessage(userId);
  } else {
    replyMessage = {
      type: 'text',
      text: '歡迎來到咖啡購物！\n\n輸入「購物」查看商品\n輸入「購物車」查看購物車\n輸入「訂單」查看訂單記錄'
    };
  }
  
  return client.replyMessage(event.replyToken, replyMessage);
}

// 處理 Postback
async function handlePostback(event) {
  const userId = event.source.userId;
  const data = event.postback.data;
  const params = new URLSearchParams(data);
  const action = params.get('action');
  
  let replyMessage;
  
  switch (action) {
    case 'add_to_cart':
      const itemId = params.get('item_id');
      addToCart(userId, itemId);
      replyMessage = {
        type: 'text',
        text: '✅ 商品已加入購物車！\n輸入「購物車」查看內容'
      };
      break;
      
    case 'checkout':
      const orderId = createOrder(userId);
      replyMessage = {
        type: 'text',
        text: `🎉 訂購成功！\n訂單編號：${orderId}\n\n感謝您的購買，我們會盡快為您處理訂單。`
      };
      break;
      
    default:
      replyMessage = {
        type: 'text',
        text: '未知的操作'
      };
  }
  
  return client.replyMessage(event.replyToken, replyMessage);
}

// 建立購物選單
function createShoppingMenu() {
  return {
    type: 'flex',
    altText: '購物商品',
    contents: {
      type: 'carousel',
      contents: Object.keys(products).map(itemId => {
        const product = products[itemId];
        return {
          type: 'bubble',
          hero: {
            type: 'image',
            url: product.image,
            size: 'full',
            aspectRatio: '20:13',
            aspectMode: 'cover'
          },
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: product.name,
                weight: 'bold',
                size: 'xl'
              },
              {
                type: 'text',
                text: product.description,
                size: 'sm',
                color: '#666666',
                margin: 'md'
              },
              {
                type: 'text',
                text: `NT$ ${product.price}`,
                size: 'lg',
                color: '#ff5551',
                weight: 'bold',
                margin: 'md'
              }
            ]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'button',
                style: 'primary',
                action: {
                  type: 'postback',
                  label: '加入購物車',
                  data: `action=add_to_cart&item_id=${itemId}`
                },
                color: '#ff5551'
              }
            ]
          }
        };
      })
    }
  };
}

// 加入購物車
function addToCart(userId, itemId) {
  if (!cart[userId]) {
    cart[userId] = {};
  }
  
  if (cart[userId][itemId]) {
    cart[userId][itemId]++;
  } else {
    cart[userId][itemId] = 1;
  }
}

// 建立購物車訊息
function createCartMessage(userId) {
  const userCart = cart[userId];
  
  if (!userCart || Object.keys(userCart).length === 0) {
    return {
      type: 'text',
      text: '🛒 購物車是空的\n輸入「購物」開始選購商品'
    };
  }
  
  let total = 0;
  let cartText = '🛒 購物車內容：\n\n';
  
  Object.keys(userCart).forEach(itemId => {
    const product = products[itemId];
    const quantity = userCart[itemId];
    const subtotal = product.price * quantity;
    total += subtotal;
    
    cartText += `${product.name} x${quantity}\nNT$ ${subtotal}\n\n`;
  });
  
  cartText += `總計：NT$ ${total}`;
  
  return {
    type: 'flex',
    altText: '購物車內容',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: cartText,
            wrap: true
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            style: 'primary',
            action: {
              type: 'postback',
              label: '立即結帳',
              data: 'action=checkout'
            },
            color: '#ff5551'
          }
        ]
      }
    }
  };
}

// 建立訂單
function createOrder(userId) {
  const userCart = cart[userId];
  const orderId = 'ORD' + Date.now();
  
  let total = 0;
  const items = {};
  
  Object.keys(userCart).forEach(itemId => {
    const product = products[itemId];
    const quantity = userCart[itemId];
    total += product.price * quantity;
    items[itemId] = quantity;
  });
  
  if (!orders[userId]) {
    orders[userId] = [];
  }
  
  orders[userId].push({
    orderId,
    items,
    total,
    timestamp: new Date().toISOString()
  });
  
  // 清空購物車
  cart[userId] = {};
  
  return orderId;
}

// 建立訂單記錄訊息
function createOrdersMessage(userId) {
  const userOrders = orders[userId];
  
  if (!userOrders || userOrders.length === 0) {
    return {
      type: 'text',
      text: '📋 尚無訂單記錄'
    };
  }
  
  let orderText = '📋 訂單記錄：\n\n';
  
  userOrders.forEach(order => {
    orderText += `訂單編號：${order.orderId}\n`;
    orderText += `金額：NT$ ${order.total}\n`;
    orderText += `時間：${new Date(order.timestamp).toLocaleString('zh-TW')}\n\n`;
  });
  
  return {
    type: 'text',
    text: orderText
  };
}

// 健康檢查路由
app.get('/', (req, res) => {
  res.send('LINE Shopping Bot is running! 🛒');
});

// 啟動伺服器
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
