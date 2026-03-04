import { useEffect, useState } from "react";
import JsonEditor from "./JsonEditor";
import {
  petStatusWording,
  idleActionsWording,
  actionsWording,
  templates,
} from "./config.constants";

const LOCAL_KEY = "custom_config";

const configsFiles = [
  // 可動態擴充，key 為 config 名稱，filename 為檔案名
  { key: "pet", filename: "pet.config.json" },
  { key: "ui", filename: "ui.config.json" },
  { key: "mapping", filename: "mapping.config.json" },
];

const ConfigEditor = ({ onChange }: { onChange: () => void }): JSX.Element => {
  const [config, setConfig] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);

  // 初始化：優先 localStorage -> fetch
  useEffect(() => {
    handleGetConfigData();
  }, []);

  // 通用載入方式，支援任意 config asset
  const handleGetConfigData = async () => {
    const local = localStorage.getItem(LOCAL_KEY);
    if (local) {
      try {
        const parsed = JSON.parse(local);
        setConfig(parsed);
        setLoading(false);
        return;
      } catch (err) {
        console.error(err);
      }
    }
    // 自動載入 configsFiles 內所有 config
    const mergedConfig: Record<string, any> = {};
    await Promise.all(
      configsFiles.map(async (cfg) => {
        try {
          const res = await fetch(`assets/${cfg.filename}`);
          mergedConfig[cfg.key] = await res.json();
        } catch {
          mergedConfig[cfg.key] = null;
        }
      }),
    );
    setConfig(mergedConfig);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(mergedConfig));
    setLoading(false);
  };

  // reset: 清除 state, localStorage 並 refetch 四個 config
  const handleClickResetButton = async () => {
    setLoading(true);
    setConfig(null);
    localStorage.removeItem(LOCAL_KEY);
    // 通用載入方式
    const mergedConfig: Record<string, any> = {};
    await Promise.all(
      configsFiles.map(async (cfg) => {
        try {
          const res = await fetch(`assets/${cfg.filename}`);
          mergedConfig[cfg.key] = await res.json();
        } catch {
          mergedConfig[cfg.key] = null;
        }
      }),
    );
    setConfig(mergedConfig);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(mergedConfig));
    setLoading(false);
  };

  const handleClickSaveButton = () => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(config));
    onChange();
  };

  const handleClickCancelButton = () => {
    handleGetConfigData();
  };

  if (loading) return <div>Loading...</div>;
  if (!config) return <div>Config not found</div>;

  return (
    <div
      style={{
        position: "relative",
        padding: "32px 0",
        minWidth: "400px",
        boxSizing: "border-box",
        maxHeight: "100vh",
        overflow: "auto",
      }}
    >
      <div
        style={{
          fontWeight: "bold",
          padding: "0 12px",
          fontSize: "16px",
          marginBottom: "6px",
        }}
      >
        Config Editor（土炮版）
      </div>
      <div
        style={{
          display: "flex",
          padding: "0 12px",
          justifyContent: "flex-start",
          gap: "4px",
          marginBottom: "12px",
        }}
      >
        <button className="button" onClick={handleClickSaveButton}>
          SAVE
        </button>
        <button className="button" onClick={handleClickCancelButton}>
          CANCEL
        </button>
        <button className="button" onClick={handleClickResetButton}>
          RESET
        </button>
      </div>
      <JsonEditor
        title="資源狀態設計"
        wording={petStatusWording}
        value={config.pet.statuses}
        onChange={(data) => {
          config.pet.statuses = data;
          setConfig({ ...config });
        }}
      />
      <JsonEditor
        title="閒置動作設計"
        wording={idleActionsWording}
        hide={["animationSet", "direction", "isMoving"]}
        value={config.pet.mycharacter.idleActions}
        onChange={(data) => {
          config.pet.mycharacter.idleActions = data;
          setConfig({ ...config });
        }}
      />
      <JsonEditor
        title="動作：喝水"
        wording={actionsWording}
        hide={["animationSet", "action", "user", "portrait"]}
        value={config.pet.mycharacter.actions.drink}
        onChange={(data) => {
          config.pet.mycharacter.actions.drink = data;
          setConfig({ ...config });
        }}
      />
      <JsonEditor
        title="動作：戰鬥"
        wording={actionsWording}
        hide={["animationSet", "action", "user", "portrait"]}
        value={config.pet.mycharacter.actions.write}
        onChange={(data) => {
          config.pet.mycharacter.actions.write = data;
          setConfig({ ...config });
        }}
      />
      <JsonEditor
        title="動作：寫字"
        wording={actionsWording}
        hide={["animationSet", "action", "user", "portrait"]}
        value={config.pet.mycharacter.actions.write}
        template={templates}
        onChange={(data) => {
          config.pet.mycharacter.actions.write = data;
          setConfig({ ...config });
        }}
      />
      <JsonEditor
        title="動作：睡覺"
        wording={actionsWording}
        hide={["animationSet", "action", "user", "portrait", "effect"]}
        value={config.pet.mycharacter.actions.sleep}
        template={templates}
        onChange={(data) => {
          config.pet.mycharacter.actions.sleep = data;
          setConfig({ ...config });
        }}
      />
      <JsonEditor
        title="動作：起床"
        wording={actionsWording}
        hide={["animationSet", "action", "user", "portrait", "effect"]}
        value={config.pet.mycharacter.actions.awake}
        template={templates}
        onChange={(data) => {
          config.pet.mycharacter.actions.awake = data;
          setConfig({ ...config });
        }}
      />
      <JsonEditor
        title="自動動作：死亡"
        wording={actionsWording}
        hide={["animationSet", "action", "user", "portrait", "auto", "status"]}
        value={config.pet.mycharacter.actions.die}
        template={templates}
        onChange={(data) => {
          config.pet.mycharacter.actions.die = data;
          setConfig({ ...config });
        }}
      />
      <JsonEditor
        title="自動動作：復活"
        wording={actionsWording}
        hide={[
          "animationSet",
          "action",
          "user",
          "portrait",
          "auto",
          "effect",
          "status",
        ]}
        value={config.pet.mycharacter.actions.revive}
        template={templates}
        onChange={(data) => {
          config.pet.mycharacter.actions.revive = data;
          setConfig({ ...config });
        }}
      />
      <JsonEditor
        title="自動動作：戰鬥獲勝"
        wording={actionsWording}
        hide={[
          "animationSet",
          "action",
          "user",
          "portrait",
          "auto",
          "condition",
        ]}
        value={config.pet.mycharacter.actions.reward}
        template={templates}
        onChange={(data) => {
          config.pet.mycharacter.actions.reward = data;
          setConfig({ ...config });
        }}
      />
      <JsonEditor
        title="自動動作：戰鬥失敗"
        wording={actionsWording}
        hide={[
          "animationSet",
          "action",
          "user",
          "portrait",
          "auto",
          "condition",
        ]}
        value={config.pet.mycharacter.actions.lose}
        template={templates}
        onChange={(data) => {
          config.pet.mycharacter.actions.lose = data;
          setConfig({ ...config });
        }}
      />
      <JsonEditor
        title="購買：Lv1"
        wording={actionsWording}
        hide={[
          "animationSet",
          "action",
          "user",
          "portrait",
          "auto",
          "condition",
          "level",
        ]}
        value={config.pet.mycharacter.actions.buyLv1}
        template={templates}
        onChange={(data) => {
          config.pet.mycharacter.actions.buyLv1 = data;
          setConfig({ ...config });
        }}
      />
      <JsonEditor
        title="購買：Lv2"
        wording={actionsWording}
        hide={[
          "animationSet",
          "action",
          "user",
          "portrait",
          "auto",
          "condition",
          "level",
        ]}
        value={config.pet.mycharacter.actions.buyLv2}
        template={templates}
        onChange={(data) => {
          config.pet.mycharacter.actions.buyLv2 = data;
          setConfig({ ...config });
        }}
      />
      <JsonEditor
        title="購買：Lv3"
        wording={actionsWording}
        hide={[
          "animationSet",
          "action",
          "user",
          "portrait",
          "auto",
          "condition",
          "level",
        ]}
        value={config.pet.mycharacter.actions.buyLv3}
        template={templates}
        onChange={(data) => {
          config.pet.mycharacter.actions.buyLv3 = data;
          setConfig({ ...config });
        }}
      />
      <JsonEditor
        title="購買：Lv4"
        wording={actionsWording}
        hide={[
          "animationSet",
          "action",
          "user",
          "portrait",
          "auto",
          "condition",
          "level",
        ]}
        value={config.pet.mycharacter.actions.buyLv4}
        template={templates}
        onChange={(data) => {
          config.pet.mycharacter.actions.buyLv4 = data;
          setConfig({ ...config });
        }}
      />
      <JsonEditor
        title="購買：Lv5"
        wording={actionsWording}
        hide={[
          "animationSet",
          "action",
          "user",
          "portrait",
          "auto",
          "condition",
          "level",
        ]}
        value={config.pet.mycharacter.actions.buyLv5}
        template={templates}
        onChange={(data) => {
          config.pet.mycharacter.actions.buyLv5 = data;
          setConfig({ ...config });
        }}
      />
    </div>
  );
};

export default ConfigEditor;
