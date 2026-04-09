import { useEffect, useRef, useState } from "react";
import StartGame from "./game";
import {
  getIsAutoSaveEnabled,
  saveAllRuntimeDataToLocalStorage,

  initRuntimeData,
} from "./game/runtimeData";

export const PhaserGame = () => {
  const gameRef = useRef<Phaser.Game | null>(null);
  const [coreConfig, setCoreConfig] = useState<any>(null);

  useEffect(() => {
    fetch("configs/system/core.json").then(r => r.json()).then(data => {
      initRuntimeData("system.core", data);
      setCoreConfig(data);
    });
  }, []);

  useEffect(() => {
    if (!coreConfig) return;
    // 啟動遊戲
    gameRef.current = StartGame("game-container", coreConfig.canvas.width, coreConfig.canvas.height);

    // 關閉視窗時自動儲存
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const isEnableAutoSave = getIsAutoSaveEnabled();
      if (isEnableAutoSave) {
        saveAllRuntimeDataToLocalStorage();
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
  }, [coreConfig]);
  if (!coreConfig) return null;
  return <div id="game-container"></div>;
};
