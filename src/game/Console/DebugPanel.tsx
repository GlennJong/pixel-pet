import { useEffect, useState } from "react";
import { useControls, folder } from "leva";
import { getStoreState, setStoreState, store } from "@/game/store";
import { ConfigManager } from "@/game/managers/ConfigManagers";

export default function DebugPanel() {
  if (!import.meta.env.DEV) return null;

  return <DebugPanelInner />;
}

function DebugPanelInner() {
  const urlParams = new URLSearchParams(window.location.search);
  const ipId = urlParams.get("id") || ConfigManager.getInstance().getIpId() || "pet";

  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const checkStore = setInterval(() => {
      if (store(`${ipId}.hp`)) {
        setIsReady(true);
        clearInterval(checkStore);
      }
    }, 100);
    return () => clearInterval(checkStore);
  }, [ipId]);

  if (!isReady) return null;

  return <DebugControls ipId={ipId} />;
}

function DebugControls({ ipId }: { ipId: string }) {
  const [, set] = useControls(() => ({
    "屬性 (Properties)": folder({
      hp: {
        value: getStoreState(`${ipId}.hp`) || 100,
        min: 0,
        max: 100,
        step: 1,
        onChange: (v) => {
          if (store(`${ipId}.hp`) && getStoreState(`${ipId}.hp`) !== v) {
            setStoreState(`${ipId}.hp`, v);
          }
        },
      },
      level: {
        value: getStoreState(`${ipId}.level`) || 0,
        min: 0,
        max: 5,
        step: 1,
        onChange: (v) => {
          if (store(`${ipId}.level`) && getStoreState(`${ipId}.level`) !== v) {
            setStoreState(`${ipId}.level`, v);
          }
        },
      },
      coin: {
        value: getStoreState(`${ipId}.coin`) || 0,
        min: 0,
        max: 9999,
        step: 10,
        onChange: (v) => {
          if (store(`${ipId}.coin`) && getStoreState(`${ipId}.coin`) !== v) {
            setStoreState(`${ipId}.coin`, v);
          }
        },
      },
    }),
    "狀態與系統": folder({
      condition: {
        options: ["normal", "sleep", "death"],
        value: getStoreState(`${ipId}.condition`) || "normal",
        onChange: (v) => {
          if (store(`${ipId}.condition`) && getStoreState(`${ipId}.condition`) !== v) {
            setStoreState(`${ipId}.condition`, v);
          }
        },
      },
      is_paused: {
        value: getStoreState("global.is_paused") || false,
        label: "暫停遊戲",
        onChange: (v) => {
          if (store("global.is_paused") && getStoreState("global.is_paused") !== v) {
            setStoreState("global.is_paused", v);
          }
        },
      },
    }),
  }));

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    // Leva 當使用 folder 時，狀態的 key 仍是內部的欄位名稱，所以可以這樣 set
    const handleHp = (val: number) => set({ hp: val } as Record<string, number>);
    const handleLevel = (val: number) => set({ level: val } as Record<string, number>);
    const handleCoin = (val: number) => set({ coin: val } as Record<string, number>);
    const handleCondition = (val: string) => set({ condition: val } as Record<string, string>);
    const handlePause = (val: boolean) => set({ is_paused: val } as Record<string, boolean>);

    const sHp = store<number>(`${ipId}.hp`);
    const sLevel = store<number>(`${ipId}.level`);
    const sCoin = store<number>(`${ipId}.coin`);
    const sCondition = store<string>(`${ipId}.condition`);
    const sPause = store<boolean>("global.is_paused");

    if (sHp) sHp.watch(handleHp);
    if (sLevel) sLevel.watch(handleLevel);
    if (sCoin) sCoin.watch(handleCoin);
    if (sCondition) sCondition.watch(handleCondition);
    if (sPause) sPause.watch(handlePause);

    return () => {
      if (sHp) sHp.unwatch(handleHp);
      if (sLevel) sLevel.unwatch(handleLevel);
      if (sCoin) sCoin.unwatch(handleCoin);
      if (sCondition) sCondition.unwatch(handleCondition);
      if (sPause) sPause.unwatch(handlePause);
    };
  }, [ipId, set]);

  return null;
}