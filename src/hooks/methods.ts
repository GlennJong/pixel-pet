import { parseQueryString } from "../utils/common";
import { fetchGet, fetchPost } from "../utils/fetch";
import {
  twitchEventSubscribeUrl,
  twitchOauthUrl,
  twitchUserUrl,
} from "./constants";
import { TwitchOauthLoginState, TwitchUserState } from "./types";

// Basic methods
export function openTwitchOauthLogin(clientId: string, redirectUri: string) {
  const scope = [
    "user:read:chat",
    "user:bot",
    "channel:bot",
    "channel:read:subscriptions",
    "channel:read:redemptions",
  ].join("+");
  const params = `response_type=token&force_verify=true&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}`;
  window.location.href = `${twitchOauthUrl}?${params}`;
}

export function getTwitchLoginStateFromQueryString():
  | TwitchOauthLoginState
  | undefined {
  const queryString = window.location.href.split("#")[1];
  if (typeof queryString !== "undefined") {
    const result = parseQueryString<TwitchOauthLoginState>(queryString);
    return result;
  }
}

export async function getTwitchUserProfile(
  clientId: string,
  userToken: string,
): Promise<TwitchUserState | undefined> {
  const headers = {
    "Client-ID": clientId,
    Authorization: `Bearer ${userToken}`,
  };

  const result = await fetchGet(twitchUserUrl, headers);
  if (result) {
    return result.data[0];
  }
}

// Websocket methods
export const subscribeMessageForWs = async (
  type: string,
  wsSessionId: string,
  clientId: string,
  userToken: string,
  userId: string,
) => {
  const url = twitchEventSubscribeUrl;

  if (!type) return undefined;

  const data = {
    type,
    version: "1",
    condition: { broadcaster_user_id: userId, user_id: userId },
    transport: { method: "websocket", session_id: wsSessionId },
  };

  const header = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${userToken}`,
    "Client-Id": clientId,
  };

  try {
    await fetchPost(url, header, data);
    return true;
  } catch (err) {
    return false;
  }
};

type TData =
  | {
      [key: string]: TData;
    }
  | string;

export const getValueByPath = (
  path: string,
  data: TData,
): string | undefined => {
  let result = data;
  const paths = path.split(".");

  for (const p of paths) {
    if (typeof result !== "object" || result === null || !result[p]) {
      // Stop if path broken
      return undefined;
    }
    result = result[p];
  }

  return typeof result === "object" ? JSON.stringify(result) : result;
};
