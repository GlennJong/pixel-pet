export const petConditionWording = {
  normal: "普通狀態",
  sleep: "睡覺狀態",
  death: "等待復活狀態",
  method: "增加(add)/減少(sub)",
  interval: "間隔(毫秒)",
  value: "值",
  hp: "生命值",
};

export const triggersWording = {
  eat: "讓角色吃飯",
  work: "讓角色工作",
  sleep: "讓角色睡覺/起床",
  action: "遊戲內指令",
  matches: "觸發條件",
  content: "忠誠點數名稱",
  user: "兌換人",
};

export const idleActionsWording = {
  "stand-left": "站立(左邊)",
  "stand-right": "站立(右邊)",
  "idle1-left": "閒置1(左邊)",
  "idle1-right": "閒置1(右邊)",
  "move-left": "移動(左邊)",
  "move-right": "移動(右邊)",
  "idle2-left": "閒置2(左邊)",
  "idle2-right": "閒置2(右邊)",
  priority: "優先度(越高越容易觸發)",
};

export const actionsWording = {
  auto: "是否自動觸發",
  condition: "觸發條件",
  dialogues: "對話集",
  sentences: "句子",
  text: "對話文字",
  effect: "動作效果",
  priority: "優先度(越高越容易觸發)",
  eat: "吃飯動作",
  method: "增加(add)/減少(sub)",
  value: "值",
  op: "比較符號(==,>,<,>=,<=)",
  coin: "金錢",
  hp: "生命值",
};

export const triggersHideKey = ["action", "params", "sleep"];

export const petSceneHideKey = [
  "key",
  "preload",
  "animations",
  "animation",
  "has_direction",
  "room",
  "is_move",
];

export const petSceneWording = {
  consume: "扣血",
  recover: "回血",
  interval: "發生時間(ms)",
  idleActions: "靜止時行動",
  activities: "功能性行動",
  idle: "靜止",
  stare: "偷看",
  walk: "走路",
  wink: "扎眼睛",
  eat: "讓角色吃飯",
  work: "讓角色工作",
  sleep: "讓角色睡覺（停止自動扣血）",
  awake: "讓角色起床（啟動自動扣血）",
  point: "恢復血量",
  base: "基本設定",
  sentences: "對話句子",
  priority: "優先度（越高越容易觸發）",
  face: "表情",
  dialogues: "對話集",
  dialog: "對話",
  frame: "frame",
  text: "對話文字",
  start: "戰鬥開始",
  finish: "戰鬥結束",
  buy: "買東西（自動觸發）",
  lose: "戰鬥結束：敗北",
};

export const templates = {
  dialogues: {
    sentences: [
      {
        portrait: "face-normal",
        text: "對話文字",
      },
    ],
    priority: 2,
  },
  sentences: {
    portrait: "face_normal",
    text: "對話文字",
  },
};
