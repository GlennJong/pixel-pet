import { useRef, useState } from "react";
import { PhaserGame } from "@/PhaserGame";
import useTwitchOauth from "@/hooks/useTwitchOauth";
import Console from "@/game/Console";
import ConfigEditor from "@/ConfigEditor";
import { setStoreState, store } from "@/game/store";
import AutoSaveTrigger from "./AutoSaveTrigger";
import CommandBoard from "./CommandBoard";
import DebugPanel from "@/game/Console/DebugPanel";
import PipButton from "./PipButton";
import "./App.css";

type TRecord = {
  user?: string;
  content?: string;
  createdAt?: Date;
};

function App() {
  const [counter, setCounter] = useState(0);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isCmdOpen, setIsCmdOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const { twitchState, startOauthConnect, startWebsocket } = useTwitchOauth();
  const [record, setRecord] = useState<TRecord[]>([]);
  const recordRef = useRef<TRecord[]>([]);

  const handleClickConnectButton = async () => {
    startWebsocket("chat", {
      onMessage: (data) => {
        const { user, content, createdAt }: TRecord = data;
        handlePushMessage(user || "", content || "");
        recordRef.current.push({ user, content, createdAt });
        setRecord(recordRef.current);
      },
    });
    setIsConnected(true);
    setCounter(counter + 1);
  };

  const handlePushMessage = (user: string, content: string) => {
    const myStore = store("global.messageQueue");
    setStoreState("global.messageQueue", [
      ...(Array.isArray(myStore?.get())
        ? (myStore.get() as { user?: string; content?: string }[])
        : []),
      { user, content },
    ]);
  };

  return (
    <div id="app">
      <DebugPanel />
      <div className="app-container">
        {/* Top Buttons */}
        <div className="top-bar">
          <button
            className={`button ${isConfigOpen ? "open" : ""}`}
            disabled={!!twitchState}
            onClick={startOauthConnect}
          >
            {twitchState ? "LOGINED" : "LOGIN TWITCH"}
          </button>
          <button
            className={`button ${isConfigOpen ? "open" : ""}`}
            onClick={() => setIsConfigOpen(!isConfigOpen)}
          >
            CONFIG
          </button>
          <button
            className={`button ${isLogOpen ? "open" : ""}`}
            onClick={() => setIsLogOpen(!isLogOpen)}
          >
            LOG
          </button>
          <button
            className={`button ${isCmdOpen ? "open" : ""}`}
            onClick={() => setIsCmdOpen(!isCmdOpen)}
          >
            CMD
          </button>
          <PipButton />
        </div>

        {/* Side Panel */}
        {isConfigOpen && (
          <div className="config-panel">
            <ConfigEditor
              onChange={() => {
                window.alert("設定已更新，將重新啟動");
                setCounter(counter + 1);
              }}
            />
          </div>
        )}

        {/* Main Game Area */}
        <div className="game-container">
          <div key={counter} style={{ position: "relative" }}>
            {twitchState && !isConnected && (
              <button
                className="button start-connect-btn"
                onClick={handleClickConnectButton}
              >
                Start Connect
              </button>
            )}
            <div
              className="game-wrapper"
              style={{
                opacity: !twitchState || isConnected ? 1 : 0.5,
                pointerEvents: !twitchState || isConnected ? "auto" : "none",
              }}
            >
              <Console>
                {(!twitchState || isConnected) && <PhaserGame />}
              </Console>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Tools */}
      <div className="bottom-tools">
        <div className="tools-content">
          <AutoSaveTrigger />
          {isCmdOpen && <CommandBoard />}
        </div>

        {isLogOpen && (
          <div className="log-panel">
            {record.map((_record, i) => (
              <div key={i}>
                {_record.user}: {_record.content}:{" "}
                {JSON.stringify(_record.createdAt)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
