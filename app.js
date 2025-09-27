const express = require('express');
const app = express();

// Render 會提供 PORT 環境變數，不能寫死 3000
const port = process.env.PORT || 3000;

// 健康檢查路由
app.get('/', (req, res) => {
  res.send('Server is running ✅');
});

// 啟動伺服器
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
