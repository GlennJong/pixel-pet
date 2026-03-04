export type TwitchOauthLoginState = {
  access_token: string;
  scope: string;
  token_type: string;
};

export type TwitchUserState = {
  id: string;
  broadcaster_type: string;
  created_at: string;
  description: string;
  display_name: string;
  login: string;
  offline_image_url: string;
  profile_image_url: string;
  type: string;
  view_count: number;
};

export type TwitchWsMessagePayload = {
  subscription: {
    id: string;
    status: string;
    type: string;
    version: string;
    condition: {
      broadcaster_user_id: string;
      user_id: string;
    };
    transport: {
      method: "websocket";
      session_id: string;
    };
    created_at: string;
    cost: number;
  };
  event: {
    broadcaster_user_id: string;
    broadcaster_user_login: string;
    broadcaster_user_name: string;
    source_broadcaster_user_id: null | string;
    source_broadcaster_user_login: null | string;
    source_broadcaster_user_name: null | string;
    chatter_user_id: number;
    chatter_user_login: string;
    chatter_user_name: string;
    message_id: string;
    source_message_id: null | string;
    is_source_only: null | string;
    message: {
      text: string;
      fragments: [
        {
          type: "text";
          text: string;
          cheermote: string | null;
          emote: string | null;
          mention: string | null;
        },
      ];
    };
    color: string;
    badges: {
      set_id: string;
      id: string;
      info: string;
    }[];
    source_badges: null | string;
    message_type: "text";
    cheer: null | string;
    reply: null | string;
    channel_points_custom_reward_id: null | string;
    channel_points_animation_id: null | string;
  };
};
