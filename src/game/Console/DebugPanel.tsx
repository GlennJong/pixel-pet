import { useEffect, useState } from "react";
import { useControls, folder } from "leva";
import { getRuntimeDataGroup, setRuntimeData, runtimeData } from "@/game/runtimeData";

export default function DebugPanel() {
  if (!import.meta.env.DEV) return null;

  return <DebugPanelInner />;
}

function DebugPanelInner() {
  

  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const checkStore = setInterval(() => {
      if (runtimeData(`pet.hp`)) {
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
        value: getRuntimeDataGroup<number>(`pet.hp`) || 100,
        min: 0,
        max: 100,
        step: 1,
        onChange: (v) => {
          if (runtimeData(`pet.hp`) && getRuntimeDataGroup<number>(`pet.hp`) !== v) {
            setRuntimeData(`pet.hp`, v);
          }
        },
      },
      level: {
        value: getRuntimeDataGroup<number>(`pet.level`) || 0,
        min: 0,
        max: 5,
        step: 1,
        onChange: (v) => {
          if (runtimeData(`pet.level`) && getRuntimeDataGroup<number>(`pet.level`) !== v) {
            setRuntimeData(`pet.level`, v);
          }
        },
      },
      coin: {
        value: getRuntimeDataGroup<number>(`pet.coin`) || 0,
        min: 0,
        max: 9999,
        step: 10,
        onChange: (v) => {
          if (runtimeData(`pet.coin`) && getRuntimeDataGroup<number>(`pet.coin`) !== v) {
            setRuntimeData(`pet.coin`, v);
          }
        },
      },
    }),
    "狀態與系統": folder({
      condition: {
        options: ["normal", "sleep", "death"],
        value: getRuntimeDataGroup<string>(`pet.condition`) || "normal",
        onChange: (v) => {
          if (runtimeData(`pet.condition`) && getRuntimeDataGroup<string>(`pet.condition`) !== v) {
            setRuntimeData(`pet.condition`, v);
          }
        },
      },
      is_paused: {
        value: getRuntimeDataGroup<boolean>("global.is_paused") || false,
        label: "暫停遊戲",
        onChange: (v) => {
          if (runtimeData("global.is_paused") && getRuntimeDataGroup<boolean>("global.is_paused") !== v) {
            setRuntimeData("global.is_paused", v as boolean);
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

    const sHp = runtimeData(`pet.hp`);
    const sLevel = runtimeData(`pet.level`);
    const sCoin = runtimeData(`pet.coin`);
    const sCondition = runtimeData(`pet.condition`);
    const sPause = runtimeData("global.is_paused");

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