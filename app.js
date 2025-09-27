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
// 在現有的 app.js 最後加入這些路由

// 管理員後台路由
app.get('/admin', (req, res) => {
  // 簡單的管理後台 HTML
  const adminHTML = `
    <!DOCTYPE html>
    <html lang="zh-TW">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>購物 Bot 管理後台</title>
        <style>
            body { 
                font-family: Arial, sans-serif; 
                max-width: 1200px; 
                margin: 0 auto; 
                padding: 20px;
                background-color: #f5f5f5;
            }
            .header { 
                background: #ff5551; 
                color: white; 
                padding: 20px; 
                border-radius: 8px; 
                margin-bottom: 20px;
            }
            .stats {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 20px;
                margin-bottom: 30px;
            }
            .stat-card {
                background: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                text-align: center;
            }
            .stat-number { font-size: 2em; font-weight: bold; color: #ff5551; }
            .orders-table { 
                background: white; 
                border-radius: 8px; 
                overflow: hidden;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            table { 
                width: 100%; 
                border-collapse: collapse; 
            }
            th, td { 
                padding: 12px; 
                text-align: left; 
                border-bottom: 1px solid #ddd; 
            }
            th { 
                background-color: #f8f9fa; 
                font-weight: bold;
            }
            .refresh-btn {
                background: #ff5551;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 5px;
                cursor: pointer;
                margin-bottom: 20px;
            }
            .refresh-btn:hover { background: #e04444; }
            .user-id { font-family: monospace; font-size: 0.8em; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🛒 購物 Bot 管理後台</h1>
            <p>即時監控訂單和購物車狀況</p>
        </div>

        <button class="refresh-btn" onclick="window.location.reload()">🔄 重新整理</button>

        <div class="stats">
            <div class="stat-card">
                <div class="stat-number" id="totalOrders">0</div>
                <div>總訂單數</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="totalRevenue">0</div>
                <div>總營業額 (NT$)</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="activeUsers">0</div>
                <div>活躍用戶</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="cartItems">0</div>
                <div>購物車商品數</div>
            </div>
        </div>

        <div class="orders-table">
            <h2 style="padding: 20px; margin: 0; background: #f8f9fa;">📋 最近訂單</h2>
            <table>
                <thead>
                    <tr>
                        <th>訂單編號</th>
                        <th>用戶 ID</th>
                        <th>商品</th>
                        <th>金額</th>
                        <th>時間</th>
                    </tr>
                </thead>
                <tbody id="ordersTableBody">
                    <tr>
                        <td colspan="5" style="text-align: center; padding: 40px; color: #666;">
                            載入中...
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div style="margin-top: 30px; padding: 20px; background: white; border-radius: 8px;">
            <h3>🛍️ 購物車狀況</h3>
            <div id="cartStatus">載入中...</div>
        </div>

        <script>
            // 載入資料
            async function loadData() {
                try {
                    const response = await fetch('/admin/api/stats');
                    const data = await response.json();
                    
                    // 更新統計資料
                    document.getElementById('totalOrders').textContent = data.totalOrders;
                    document.getElementById('totalRevenue').textContent = data.totalRevenue.toLocaleString();
                    document.getElementById('activeUsers').textContent = data.activeUsers;
                    document.getElementById('cartItems').textContent = data.cartItems;
                    
                    // 更新訂單表格
                    const tbody = document.getElementById('ordersTableBody');
                    if (data.recentOrders.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: #666;">暫無訂單</td></tr>';
                    } else {
                        tbody.innerHTML = data.recentOrders.map(order => \`
                            <tr>
                                <td><strong>\${order.orderId}</strong></td>
                                <td class="user-id">\${order.userId}</td>
                                <td>\${order.itemsText}</td>
                                <td><strong>NT$ \${order.total.toLocaleString()}</strong></td>
                                <td>\${new Date(order.timestamp).toLocaleString('zh-TW')}</td>
                            </tr>
                        \`).join('');
                    }
                    
                    // 更新購物車狀況
                    const cartDiv = document.getElementById('cartStatus');
                    if (data.cartStatus.length === 0) {
                        cartDiv.innerHTML = '<p style="color: #666;">目前沒有用戶的購物車有商品</p>';
                    } else {
                        cartDiv.innerHTML = data.cartStatus.map(user => \`
                            <div style="margin-bottom: 10px; padding: 10px; background: #f8f9fa; border-radius: 5px;">
                                <strong>用戶:</strong> <span class="user-id">\${user.userId}</span><br>
                                <strong>商品:</strong> \${user.items}
                            </div>
                        \`).join('');
                    }
                    
                } catch (error) {
                    console.error('載入資料失敗:', error);
                }
            }
            
            // 頁面載入時執行
            loadData();
            
            // 每 30 秒自動更新
            setInterval(loadData, 30000);
        </script>
    </body>
    </html>
  `;
  
  res.send(adminHTML);
});

// API 端點：提供管理後台資料
app.get('/admin/api/stats', (req, res) => {
  try {
    // 計算統計資料
    let totalOrders = 0;
    let totalRevenue = 0;
    let recentOrders = [];
    
    // 統計所有訂單
    Object.keys(orders).forEach(userId => {
      totalOrders += orders[userId].length;
      orders[userId].forEach(order => {
        totalRevenue += order.total;
        recentOrders.push({
          orderId: order.orderId,
          userId: userId,
          total: order.total,
          timestamp: order.timestamp,
          itemsText: Object.keys(order.items).map(itemId => {
            const product = products[itemId];
            return \`\${product.name} x\${order.items[itemId]}\`;
          }).join(', ')
        });
      });
    });
    
    // 排序訂單（最新的在前面）
    recentOrders.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // 只取最近 10 筆
    recentOrders = recentOrders.slice(0, 10);
    
    // 計算購物車統計
    const activeUsers = Object.keys(cart).length;
    let cartItems = 0;
    const cartStatus = [];
    
    Object.keys(cart).forEach(userId => {
      const userCart = cart[userId];
      const itemCount = Object.values(userCart).reduce((sum, qty) => sum + qty, 0);
      cartItems += itemCount;
      
      if (itemCount > 0) {
        const itemsText = Object.keys(userCart).map(itemId => {
          const product = products[itemId];
          return \`\${product.name} x\${userCart[itemId]}\`;
        }).join(', ');
        
        cartStatus.push({
          userId: userId,
          items: itemsText
        });
      }
    });
    
    res.json({
      totalOrders,
      totalRevenue,
      activeUsers,
      cartItems,
      recentOrders,
      cartStatus
    });
    
  } catch (error) {
    console.error('統計資料錯誤:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
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
