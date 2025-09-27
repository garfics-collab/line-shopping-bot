const express = require('express');
const line = require('@line/bot-sdk');

const app = express();

// 檢查環境變數
console.log('Environment check:');
console.log('CHANNEL_ACCESS_TOKEN:', process.env.CHANNEL_ACCESS_TOKEN ? 'Set' : 'Missing');
console.log('CHANNEL_SECRET:', process.env.CHANNEL_SECRET ? 'Set' : 'Missing');

// LINE Bot 設定
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const client = new line.Client(config);

// 簡單的記憶體儲存
let cart = {};
let orders = {};

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

// 健康檢查路由 - 放在最前面
app.get('/', (req, res) => {
  console.log('GET / - Health check');
  res.send('LINE Shopping Bot is running! 🛒');
});

// 測試 webhook 路由
app.get('/webhook', (req, res) => {
  console.log('GET /webhook - Test endpoint');
  res.send('Webhook endpoint is working! Use POST for LINE events.');
});

// LINE Webhook 處理
app.post('/webhook', line.middleware(config), (req, res) => {
  console.log('POST /webhook - Received LINE event');
  
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => {
      console.log('Events processed successfully');
      res.json(result);
    })
    .catch((err) => {
      console.error('Error processing events:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
});

// 錯誤處理中間件
app.use((error, req, res, next) => {
  if (error instanceof line.SignatureValidationFailed) {
    console.error('Signature validation failed:', error.message);
    return res.status(401).send('Signature validation failed');
  } else if (error instanceof line.JSONParseError) {
    console.error('JSON parse error:', error.message);
    return res.status(400).send('Invalid JSON');
  }
  
  console.error('Unknown error:', error);
  return res.status(500).send('Internal server error');
});

// 處理事件
async function handleEvent(event) {
  console.log('Event type:', event.type);
  
  try {
    if (event.type === 'message' && event.message.type === 'text') {
      return await handleTextMessage(event);
    } else if (event.type === 'postback') {
      return await handlePostback(event);
    }
    
    console.log('Unhandled event type:', event.type);
    return Promise.resolve(null);
    
  } catch (error) {
    console.error('Error handling event:', error);
    return Promise.resolve(null);
  }
}

// 處理文字訊息
async function handleTextMessage(event) {
  const userId = event.source.userId;
  const text = event.message.text.toLowerCase();
  
  console.log(`User ${userId} sent: ${text}`);
  
  let replyMessage;
  
  if (text === '購物' || text === 'shop') {
    replyMessage = createShoppingMenu();
  } else if (text === '購物車' || text === 'cart') {
    replyMessage = createCartMessage(userId);
  } else if (text === '訂單' || text === 'orders') {
    replyMessage = createOrdersMessage(userId);
  } else if (text === 'test' || text === '測試') {
    replyMessage = {
      type: 'text',
      text: '機器人運作正常！✅'
    };
  } else {
    replyMessage = {
      type: 'text',
      text: '歡迎來到咖啡購物！\n\n輸入「購物」查看商品\n輸入「購物車」查看購物車\n輸入「訂單」查看訂單記錄\n\n輸入「測試」檢查機器人狀態'
    };
  }
  
  return client.replyMessage(event.replyToken, replyMessage);
}

// 處理 Postback
async function handlePostback(event) {
  const userId = event.source.userId;
  const data = event.postback.data;
  
  console.log(`Postback from ${userId}: ${data}`);
  
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
  
  console.log(`Added ${itemId} to cart for user ${userId}`);
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
  
  console.log(`Created order ${orderId} for user ${userId}`);
  
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

// 404 處理
app.use('*', (req, res) => {
  console.log('404 - Route not found:', req.method, req.originalUrl);
  res.status(404).send('Route not found');
});

// 啟動伺服器
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log('Available routes:');
  console.log('GET  / - Health check');
  console.log('GET  /webhook - Webhook test');
  console.log('POST /webhook - LINE events');
});
