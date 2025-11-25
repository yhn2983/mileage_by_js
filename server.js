const express = require("express"); // 引入 Express 框架
const Tesseract = require("tesseract.js"); // 引入 Tesseract.js
const { Pool } = require("pg"); // [核心修改] 引入 pg 模組中的 Pool (連接池)

const app = express();
const PORT = 3000;

// --- 1. 資料庫初始化與連線 (PostgreSQL) ---
// 在雲端環境，連線字串來自環境變數 DATABASE_URL
// 在本地測試環境，可以設定一個預設值，例如 'postgresql://user:password@host:port/database'
const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:mysecretpassword@localhost:5432/mileage_tracker";

// 創建 PostgreSQL 連接池實例
const pool = new Pool({
  connectionString: connectionString,
  // [重要] 如果在 Render/Railway 上使用外部資料庫，可能需要 SSL 設定
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

// 初始化資料庫結構：建立表格
async function initializeDatabase() {
  try {
    const client = await pool.connect(); // 從連接池取得一個連線
    await client.query(`
            CREATE TABLE IF NOT EXISTS records (
                id SERIAL PRIMARY KEY,            -- PostgreSQL 的自動遞增主鍵
                mileage REAL NOT NULL,
                timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
        `);
    client.release(); // 釋放連線回連接池
    console.log("✅ PostgreSQL 資料表 (records) 已準備就緒。");
  } catch (err) {
    console.error("❌ 初始化 PostgreSQL 資料庫失敗:", err.message);
    // 如果連線失敗，讓應用程式退出，以便排查問題
    process.exit(1);
  }
}

// 設定靜態檔案路徑
app.use(express.static("public"));

// 解析 JSON 格式的請求體
app.use(express.json({ limit: "50mb" }));

// --- 2. 圖片上傳與 OCR 處理的 API 路由 (儲存至 PostgreSQL) ---
app.post("/upload-mileage", async (req, res) => {
  const imageDataURL = req.body.image;
  if (!imageDataURL) {
    return res.status(400).json({ message: "缺少圖片資料。" });
  }

  const base64Data = imageDataURL.replace(/^data:image\/\w+;base64,/, "");
  const imageBuffer = Buffer.from(base64Data, "base64");

  try {
    // [核心修正] 使用 Tesseract.recognize 靜態方法
    const {
      data: { text },
    } = await Tesseract.recognize(imageBuffer, "eng", {
      logger: (m) => console.log(m),
    });

    console.log("--- 原始 OCR 辨識結果: ---");
    console.log(text);
    console.log("---------------------------");

    // 處理辨識結果 (提取數字)
    const rawMileage = text.match(/[\d\.]+/g)
      ? text.match(/[\d\.]+/g).join("")
      : "";
    const mileageMatch = rawMileage.match(/^\d*\.?\d*/);
    const finalMileage = mileageMatch ? mileageMatch[0] : "";

    if (!finalMileage) {
      return res.status(400).json({
        message: "無法從圖片中辨識出有效的里程數。請確保圖片清晰。",
        rawOcrText: text,
      });
    }

    const mileageValue = parseFloat(finalMileage);
    // PostgreSQL 通常使用 CURRENT_TIMESTAMP 或 DEFAULT NOW()，這裡我們手動傳遞一個 ISO 字串也行
    const timestamp = new Date().toISOString();

    // [核心修改] 使用 pg 的 client.query 執行插入操作
    const client = await pool.connect();
    const result = await client.query(
      "INSERT INTO records (mileage, timestamp) VALUES ($1, $2) RETURNING id, timestamp",
      [mileageValue, timestamp] // $1, $2 是 PostgreSQL 的參數佔位符
    );
    client.release();

    const newRecord = result.rows[0];

    console.log(`✅ 里程數 ${mileageValue} 成功插入 ID: ${newRecord.id}`);

    // 回傳成功的結果
    res.json({
      message: "里程數記錄成功！",
      mileage: finalMileage,
      timestamp: newRecord.timestamp,
    });
  } catch (error) {
    console.error("OCR 處理或資料庫操作錯誤:", error);
    res.status(500).json({
      message: "伺服器處理錯誤",
      error: error.message,
    });
  }
});

// --- 3. 取得歷史記錄的 API 路由 (從 PostgreSQL 查詢) ---
app.get("/records", async (req, res) => {
  try {
    const client = await pool.connect();
    // 查詢最新的 10 筆記錄，使用 id DESC 排序
    const result = await client.query(
      "SELECT mileage, timestamp FROM records ORDER BY id DESC LIMIT 10"
    );
    client.release();

    // 將查詢結果回傳給前端
    res.json(result.rows);
  } catch (err) {
    console.error("❌ PostgreSQL 查詢錯誤:", err.message);
    res.status(500).json({ message: "資料庫查詢失敗。" });
  }
});

// --- 4. 啟動伺服器 ---
app.listen(PORT, async () => {
  // 在伺服器啟動前，確保資料庫表格已建立
  await initializeDatabase();

  console.log("✅ OCR 引擎將在收到第一個請求時自動啟動。");
  console.log(`伺服器正在 http://localhost:${PORT} 上運行`);
  console.log("請在手機或電腦瀏覽器中打開此網址。");
});
