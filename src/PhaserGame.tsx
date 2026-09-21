import { useEffect, useRef, useState } from "react";
import StartGame from "./game";
import { fetchJson } from "@/utils/assetUrl";
import {
  getIsAutoSaveEnabled,
  saveAllRuntimeDataToLocalStorage,

  initRuntimeData,
} from "./game/runtimeData";

export const PhaserGame = () => {
  const gameRef = useRef<Phaser.Game | null>(null);
  const [coreConfig, setCoreConfig] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<any>("configs/system/core.json")
      .then(data => {
        initRuntimeData("system.core", data);
        setCoreConfig(data);
      })
      .catch(error => {
        // Without this the rejection surfaces as a bare
        // "Unexpected token '<' ... is not valid JSON" and the game never boots.
        console.error("[PhaserGame] Failed to load system core config", error);
        setLoadError(error instanceof Error ? error.message : String(error));
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
  if (loadError) return <div className="game-load-error">{loadError}</div>;
  if (!coreConfig) return null;
  return <div id="game-container"></div>;
};
