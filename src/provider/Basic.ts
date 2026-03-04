export type TBasic = {
  token: string;
  client_id: string;
};

export function getBasic(): Promise<TBasic> {
  return new Promise((resolve, reject) => {
    fetch("/api/basic", { method: "GET" })
      .then((response) => resolve(response.json()))
      .catch((err) => {
        console.log(err);
        reject(undefined);
      });
  });
}

export function startWebsocket(): Promise<TBasic> {
  return new Promise((resolve, reject) => {
    fetch("/api/websocket", { method: "GET" })
      .then((response) => resolve(response.json()))
      .catch((err) => {
        console.log(err);
        reject(undefined);
      });
  });
}

export function connectChatWebhook(): Promise<TBasic> {
  return new Promise((resolve, reject) => {
    fetch("/api/twitch-chat", { method: "post" })
      .then((response) => resolve(response.json()))
      .catch((err) => {
        console.log(err);
        reject(undefined);
      });
  });
}
export function disconnectChatWebhook(): Promise<TBasic> {
  return new Promise((resolve, reject) => {
    fetch("/api/twitch-chat", { method: "delete" })
      .then((response) => resolve(response.json()))
      .catch((err) => {
        console.log(err);
        reject(undefined);
      });
  });
}

export function connectFollowWebhook(): Promise<TBasic> {
  return new Promise((resolve, reject) => {
    fetch("/api/twitch-follow", { method: "post" })
      .then((response) => resolve(response.json()))
      .catch((err) => {
        console.log(err);
        reject(undefined);
      });
  });
}
export function disconnectFollowWebhook(): Promise<TBasic> {
  return new Promise((resolve, reject) => {
    fetch("/api/twitch-follow", { method: "delete" })
      .then((response) => resolve(response.json()))
      .catch((err) => {
        console.log(err);
        reject(undefined);
      });
  });
}
