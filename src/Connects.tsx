import useTwitchOauth from "./hooks/useTwitchOauth";

function Connects() {
  const { messages, twitchState, startOauthConnect, startWebsocket } =
    useTwitchOauth();

  const handleClickConnectTwitchWs = () => {
    startWebsocket("chat");
  };

  console.log({ messages });
  return (
    <div>
      {twitchState ? (
        <button onClick={handleClickConnectTwitchWs}>websocket</button>
      ) : (
        // <button onClick={() => {}}>websocket</button>
        <button onClick={startOauthConnect}>Connect by oauth</button>
      )}
    </div>
  );
}

export default Connects;
