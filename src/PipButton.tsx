import { useRef, useState } from "react";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "@/game/constants";

export default function PipButton() {
  const [isPipActive, setIsPipActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const proxyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderLoopRef = useRef<number | null>(null);

  const startPip = async () => {
    try {
      const sourceCanvas = document.querySelector("#game-container canvas") as HTMLCanvasElement;
      if (!sourceCanvas) {
        alert("找不到遊戲畫面，請稍後再試。");
        return;
      }

      // 【核心解法】將畫布強制放大整數倍來對抗 OS 預設的 Bilinear 平滑化
      const SCALE_FACTOR = 5; // 160x144 放大 5 倍 = 800x720
      if (!proxyCanvasRef.current) {
        proxyCanvasRef.current = document.createElement("canvas");
        proxyCanvasRef.current.width = CANVAS_WIDTH * SCALE_FACTOR;
        proxyCanvasRef.current.height = CANVAS_HEIGHT * SCALE_FACTOR;
      }

      const proxyCtx = proxyCanvasRef.current.getContext("2d");
      if (proxyCtx) {
        // 設定不要平滑化，以「方塊」的形式放大
        proxyCtx.imageSmoothingEnabled = false;
      }

      // 每幀同步與放大原始畫布
      const syncFrames = () => {
        if (proxyCtx && sourceCanvas.width > 0) {
          proxyCtx.clearRect(0, 0, proxyCanvasRef.current!.width, proxyCanvasRef.current!.height);
          proxyCtx.drawImage(
            sourceCanvas,
            0,
            0,
            sourceCanvas.width,
            sourceCanvas.height,
            0,
            0,
            proxyCanvasRef.current!.width,
            proxyCanvasRef.current!.height
          );
        }
        renderLoopRef.current = requestAnimationFrame(syncFrames);
      };
      
      // 確保沒有重複的繪製迴圈正在執行
      if (renderLoopRef.current) cancelAnimationFrame(renderLoopRef.current);
      syncFrames();

      if (!videoRef.current) {
        const video = document.createElement("video");
        video.muted = true; // PiP usually requires muted or user gesture
        video.autoplay = true;
        video.playsInline = true; // ★ Safari/iOS 必須要加上這個屬性
        // 增強小視窗畫質，避免影片平滑化導致像素模糊
        video.style.imageRendering = "pixelated";
        videoRef.current = video;
        
        // Listen to exit pip event (Standard)
        video.addEventListener("leavepictureinpicture", () => {
          setIsPipActive(false);
          if (renderLoopRef.current) cancelAnimationFrame(renderLoopRef.current);
        });

        // Listen to exit pip event (Safari)
        video.addEventListener("webkitpresentationmodechanged", (e: any) => {
          if (e.target?.webkitPresentationMode !== "picture-in-picture") {
            setIsPipActive(false);
            if (renderLoopRef.current) cancelAnimationFrame(renderLoopRef.current);
          }
        });
      }

      // 改由我們放大的高畫質 Proxy Canvas 提供影像流
      const stream = proxyCanvasRef.current.captureStream(30); // 30 fps
      const v = videoRef.current as any;
      v.srcObject = stream;
      
      // We must wait for the video to load metadata and play before requesting PiP
      await new Promise<void>((resolve) => {
        if (!v) return;
        v.onloadedmetadata = () => {
          v.play();
          resolve();
        };
      });

      // 支援標準 API 與 Safari 的 WebKit API
      if (v.requestPictureInPicture) {
        await v.requestPictureInPicture();
      } else if (v.webkitSetPresentationMode && v.webkitSupportsPresentationMode?.("picture-in-picture")) {
        v.webkitSetPresentationMode("picture-in-picture");
      }
      
      setIsPipActive(true);
    } catch (error) {
      console.error("啟動 PiP 失敗:", error);
      alert("啟動子母畫面失敗，您的瀏覽器可能不支援。");
    }
  };

  const stopPip = async () => {
    try {
      const v = videoRef.current as any;
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if ((document as any).webkitPictureInPictureElement) {
        await (document as any).webkitExitPictureInPicture();
      } else if (v && v.webkitPresentationMode === "picture-in-picture") {
        v.webkitSetPresentationMode("inline");
      }
      setIsPipActive(false);
      if (renderLoopRef.current) cancelAnimationFrame(renderLoopRef.current);
    } catch (error) {
      console.error("關閉 PiP 失敗:", error);
    }
  };

  return (
    <button
      className={`button ${isPipActive ? "open" : ""}`}
      onClick={isPipActive ? stopPip : startPip}
      title="子母畫面 (Picture-in-Picture)"
    >
      {isPipActive ? "EXIT PIP" : "PIP MODE"}
    </button>
  );
}
