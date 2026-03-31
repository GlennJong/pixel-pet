import { useEffect, useRef } from "react";
import StartGame from "./game";
import {
  getIsAutoSaveEnabled,
  saveAllStoresToLocalStorage,
} from "./game/store";

export const PhaserGame = () => {
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    // 啟動遊戲
    gameRef.current = StartGame("game-container");

    // 關閉視窗時自動儲存
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const isEnableAutoSave = getIsAutoSaveEnabled();
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
          sceneManager.stop(scene.scene.key);
        });
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);
  return <div id="game-container"></div>;
};
