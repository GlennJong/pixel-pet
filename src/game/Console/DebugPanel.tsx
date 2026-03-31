import { useEffect, useState } from "react";
import { useControls, folder } from "leva";
import { getStoreState, setStoreState, store } from "@/game/store";

export default function DebugPanel() {
  if (!import.meta.env.DEV) return null;

  return <DebugPanelInner />;
}

function DebugPanelInner() {
  

  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const checkStore = setInterval(() => {
      if (store(`pet.hp`)) {
        setIsReady(true);
        clearInterval(checkStore);
      }
    }, 100);
    return () => clearInterval(checkStore);
  }, []);

  if (!isReady) return null;

  return <DebugControls />;
}

function DebugControls() {
  const [, set] = useControls(() => ({
    "屬性 (Properties)": folder({
      hp: {
        value: getStoreState(`pet.hp`) || 100,
        min: 0,
        max: 100,
        step: 1,
        onChange: (v) => {
          if (store(`pet.hp`) && getStoreState(`pet.hp`) !== v) {
            setStoreState(`pet.hp`, v);
          }
        },
      },
      level: {
        value: getStoreState(`pet.level`) || 0,
        min: 0,
        max: 5,
        step: 1,
        onChange: (v) => {
          if (store(`pet.level`) && getStoreState(`pet.level`) !== v) {
            setStoreState(`pet.level`, v);
          }
        },
      },
      coin: {
        value: getStoreState(`pet.coin`) || 0,
        min: 0,
        max: 9999,
        step: 10,
        onChange: (v) => {
          if (store(`pet.coin`) && getStoreState(`pet.coin`) !== v) {
            setStoreState(`pet.coin`, v);
          }
        },
      },
    }),
    "狀態與系統": folder({
      condition: {
        options: ["normal", "sleep", "death"],
        value: getStoreState(`pet.condition`) || "normal",
        onChange: (v) => {
          if (store(`pet.condition`) && getStoreState(`pet.condition`) !== v) {
            setStoreState(`pet.condition`, v);
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

    const sHp = store<number>(`pet.hp`);
    const sLevel = store<number>(`pet.level`);
    const sCoin = store<number>(`pet.coin`);
    const sCondition = store<string>(`pet.condition`);
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
  }, [set]);

  return null;
}