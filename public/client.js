// public/client.js (手動截圖版本)

// 取得 HTML 元素
const video = document.getElementById("videoElement");
const snapButton = document.getElementById("snapButton");
const statusText = document.getElementById("statusText");
const mileageText = document.getElementById("mileageText");
const recordsList = document.getElementById("recordsList");

const cameraView = document.getElementById("camera-view"); // 攝影機區塊
const cropView = document.getElementById("crop-view"); // 截圖區塊

// 新增的截圖相關元素
const cropCanvas = document.getElementById("cropCanvas"); // 截圖介面主畫布
const uploadCanvas = document.getElementById("uploadCanvas"); // 上傳用的隱藏畫布
const submitCropButton = document.getElementById("submitCropButton");
const retakeButton = document.getElementById("retakeButton");

let videoStream; // 用於保存和停止影像串流

// 截圖相關狀態變數
let isCropping = false;
let startX, startY;
let cropRect = { x: 0, y: 0, w: 0, h: 0 };
let currentImage; // 暫存拍照後的影像數據

// --- 1. 啟動鏡頭 ---
async function setupCamera() {
  try {
    videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = videoStream;
    video.onloadedmetadata = () => {
      video.play();
      snapButton.disabled = false;
      statusText.textContent = "鏡頭已就緒，請點擊拍照。";
      cameraView.style.display = "block";
      cropView.style.display = "none";
    };
  } catch (err) {
    statusText.textContent = "❌ 錯誤：無法存取您的鏡頭。";
  }
}

// --- 輔助函式：停止影像串流 ---
function stopVideoStream() {
  if (videoStream) {
    videoStream.getTracks().forEach((track) => track.stop());
  }
}

// --- 2. 拍照並進入截圖模式 ---
snapButton.addEventListener("click", () => {
  stopVideoStream(); // 停止串流

  // 將拍照當下的畫面繪製到 cropCanvas 上
  cropCanvas.width = video.videoWidth;
  cropCanvas.height = video.videoHeight;
  const ctx = cropCanvas.getContext("2d");
  ctx.drawImage(video, 0, 0, cropCanvas.width, cropCanvas.height);

  // 儲存影像數據以便重複繪製
  currentImage = ctx.getImageData(0, 0, cropCanvas.width, cropCanvas.height);

  // 切換介面
  cameraView.style.display = "none";
  cropView.style.display = "block";

  // 重設截圖框
  cropRect = { x: 0, y: 0, w: 0, h: 0 };
  drawCanvas(currentImage);

  statusText.textContent = "🖼️ 請拖曳滑鼠或手指選擇里程數區域。";
});

// --- 3. 繪製畫布和截圖框 ---
function drawCanvas(imageData) {
  const ctx = cropCanvas.getContext("2d");
  ctx.putImageData(imageData, 0, 0); // 繪製原始影像

  if (cropRect.w > 0 && cropRect.h > 0) {
    // 繪製半透明遮罩
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);

    // [關鍵] 清除截圖區域的遮罩，露出原圖
    ctx.clearRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);

    // 繪製截圖框邊緣
    ctx.strokeStyle = "#FFC107";
    ctx.lineWidth = 2;
    ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
  }
}

// --- 4. 截圖事件處理 (MouseDown/MouseMove/MouseUp) ---
cropCanvas.addEventListener("mousedown", (e) => {
  isCropping = true;
  // 取得滑鼠在 Canvas 內的相對位置
  const rect = cropCanvas.getBoundingClientRect();
  startX = (e.clientX - rect.left) * (cropCanvas.width / rect.width);
  startY = (e.clientY - rect.top) * (cropCanvas.height / rect.height);
  cropRect = { x: startX, y: startY, w: 0, h: 0 };
  submitCropButton.disabled = true;
});

cropCanvas.addEventListener("mousemove", (e) => {
  if (!isCropping) return;

  const rect = cropCanvas.getBoundingClientRect();
  const currentX = (e.clientX - rect.left) * (cropCanvas.width / rect.width);
  const currentY = (e.clientY - rect.top) * (cropCanvas.height / rect.height);

  // 計算截圖矩形
  cropRect.x = Math.min(startX, currentX);
  cropRect.y = Math.min(startY, currentY);
  cropRect.w = Math.abs(currentX - startX);
  cropRect.h = Math.abs(currentY - startY);

  drawCanvas(currentImage); // 重新繪製影像和截圖框
});

cropCanvas.addEventListener("mouseup", () => {
  isCropping = false;
  if (cropRect.w > 10 && cropRect.h > 10) {
    // 確保框足夠大
    submitCropButton.disabled = false;
  }
});

// --- 5. 確認並上傳截圖 ---
submitCropButton.addEventListener("click", () => {
  statusText.textContent = "📸 正在裁剪並處理影像...";

  // 1. 設定上傳畫布的尺寸為截圖框的尺寸
  uploadCanvas.width = cropRect.w;
  uploadCanvas.height = cropRect.h;

  // 2. 截圖：將 cropCanvas 上的特定區域繪製到 uploadCanvas
  uploadCanvas.getContext("2d").drawImage(
    cropCanvas,
    cropRect.x,
    cropRect.y,
    cropRect.w,
    cropRect.h, // 來源 (cropCanvas)
    0,
    0,
    cropRect.w,
    cropRect.h // 目標 (uploadCanvas)
  );

  // 3. 轉換為 Base64 並上傳
  const imageDataURL = uploadCanvas.toDataURL("image/jpeg", 0.9);
  uploadImage(imageDataURL);

  // 上傳後切回相機介面 (讓使用者準備下一次拍照)
  cameraView.style.display = "block";
  cropView.style.display = "none";
  setupCamera();
});

// --- 6. 重新拍照按鈕 ---
retakeButton.addEventListener("click", () => {
  // 簡單地切回相機介面
  cameraView.style.display = "block";
  cropView.style.display = "none";
  setupCamera(); // 重新啟動鏡頭串流
});

// ... (後段的 uploadImage 和 fetchRecords 保持不變，但請注意：
// uploadImage 應該使用 uploadCanvas 而不是原來的 canvasElement)
// 請確保您的 uploadImage 函式正確地從此處接收 imageDataURL
// ...

// 啟動應用程式
setupCamera();
fetchRecords();
