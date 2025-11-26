// 取得 HTML 元素
const video = document.getElementById("videoElement");
const canvas = document.getElementById("canvasElement");
const snapButton = document.getElementById("snapButton");
const statusText = document.getElementById("statusText");
const mileageText = document.getElementById("mileageText");

// --- 1. 啟動鏡頭 ---
async function setupCamera() {
  try {
    // 嘗試取得後置鏡頭 (environment)
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { exact: "environment" } },
    });
    video.srcObject = stream;
    video.onloadedmetadata = () => {
      video.play();
      snapButton.disabled = false; // 鏡頭啟動後啟用按鈕
      statusText.textContent = "鏡頭已就緒，請對準里程表。";
    };
  } catch (err) {
    // 如果找不到後置鏡頭，嘗試使用預設鏡頭
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;
      video.onloadedmetadata = () => {
        video.play();
        snapButton.disabled = false;
        statusText.textContent = "鏡頭已就緒（可能是前置鏡頭），請對準里程表。";
      };
    } catch (error) {
      console.error("無法存取鏡頭: ", error);
      statusText.textContent = "❌ 錯誤：無法存取您的鏡頭。";
    }
  }
}

// --- 2. 拍照與上傳 ---
snapButton.addEventListener("click", () => {
  statusText.textContent = "📸 正在拍照並處理影像...";
  snapButton.disabled = true; // 避免重複點擊，禁用按鈕
  mileageText.textContent = "處理中...";

  // --- 截圖邏輯的調整開始 ---

  const context = canvas.getContext("2d");

  // 取得影片串流的實際寬高
  const videoW = video.videoWidth;
  const videoH = video.videoHeight;

  // 定義要截取的區域（ROI - Region of Interest）
  // 假設我們只需要中間 50% 的寬度和高度
  const cropFactor = 0.5; // 截取畫面中間 50%
  const cropW = videoW * cropFactor;
  const cropH = videoH * cropFactor;

  // 計算截取的起始點 (讓截圖區域置中)
  const sx = (videoW - cropW) / 2; // Source X
  const sy = (videoH - cropH) / 2; // Source Y

  // 將 Canvas 的尺寸設定為截圖區域的尺寸
  canvas.width = cropW;
  canvas.height = cropH;

  // 將影像串流（從 (sx, sy) 點開始，寬度 cropW, 高度 cropH 的區域）
  // 畫到 Canvas 上（從 (0, 0) 點開始，完全填充 canvas）
  context.drawImage(
    video,
    sx,
    sy,
    cropW,
    cropH, // 來源 (Source) 矩形
    0,
    0,
    cropW,
    cropH // 目標 (Destination) 矩形
  );

  // --- 截圖邏輯的調整結束 ---

  // 將 Canvas 內容轉換為 Base64 格式的 JPEG 圖片 (0.9 是圖片品質)
  const imageDataURL = canvas.toDataURL("image/jpeg", 0.9);

  // 將 Base64 資料傳送給後端進行 OCR 處理
  uploadImage(imageDataURL);
});

// --- 3. 圖片上傳函式 ---
async function uploadImage(imageDataURL) {
  try {
    const response = await fetch("/upload-mileage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json", // 告訴伺服器傳送的是 JSON
      },
      body: JSON.stringify({ image: imageDataURL }), // 將 Base64 資料作為 JSON body
    });

    const data = await response.json();

    if (response.ok) {
      statusText.textContent = `✅ 上傳成功！`;
      mileageText.textContent = data.mileage || "辨識失敗或無結果";
      // 成功後重新載入歷史紀錄
      fetchRecords();
    } else {
      statusText.textContent = `⚠️ 伺服器錯誤: ${data.message || "未知錯誤"}`;
      mileageText.textContent = "處理失敗";
    }
  } catch (error) {
    console.error("上傳過程中發生錯誤:", error);
    statusText.textContent = "🚨 網路錯誤或連線中斷。";
    mileageText.textContent = "處理失敗";
  } finally {
    snapButton.disabled = false; // 無論成功失敗都啟用按鈕
  }
}

// --- 4. 取得歷史紀錄 ---
async function fetchRecords() {
  const recordsList = document.getElementById("recordsList");
  recordsList.innerHTML = "<li>載入歷史紀錄中...</li>";

  try {
    const response = await fetch("/records");
    const records = await response.json();

    recordsList.innerHTML = ""; // 清空列表
    if (records.length === 0) {
      recordsList.innerHTML = "<li>目前沒有任何紀錄。</li>";
      return;
    }

    records.forEach((record) => {
      const listItem = document.createElement("li");
      // 格式化日期時間
      const date = new Date(record.timestamp).toLocaleString();
      listItem.textContent = `里程數: ${record.mileage} - 時間: ${date}`;
      recordsList.appendChild(listItem);
    });
  } catch (error) {
    console.error("載入歷史紀錄錯誤:", error);
    recordsList.innerHTML = "<li>載入歷史紀錄失敗。</li>";
  }
}

// 啟動應用程式
setupCamera();
fetchRecords();
