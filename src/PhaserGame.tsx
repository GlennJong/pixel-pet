import { useEffect, useRef } from "react";
import StartGame from "./game";
import {
  loadAllStoresFromLocalStorage,
  saveAllStoresToLocalStorage,
} from "./game/store";

export const PhaserGame = () => {
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    // 啟動時還原 store 狀態
    loadAllStoresFromLocalStorage();
    gameRef.current = StartGame("game-container");

    // 關閉視窗時自動儲存
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const isEnableAutoSave =
        localStorage.getItem("isEnableAutoSave") === "true";
      if (isEnableAutoSave) {
        saveAllStoresToLocalStorage();
      } else {
        // 顯示離開警告
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (gameRef.current) {
        // 取得目前 active scene
        const sceneManager = gameRef.current.scene;
        sceneManager.getScenes(true).forEach((scene: Phaser.Scene) => {
          if (typeof scene.shutdown === "function") {
            scene.shutdown();
          }
          sceneManager.stop(scene.scene.key);
        });
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);
  return <div id="game-container"></div>;
};
