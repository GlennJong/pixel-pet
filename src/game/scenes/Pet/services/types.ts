type UserParams = { user?: string };
type AwardParams = { coin?: number };

// Message queue item
export type Message = {
  user: string;
  content: string;
};

export type Task = {
  user: string;
  action: string;
  params: UserParams &
    AwardParams & { [key: string]: string | number };
  callback?: () => void;
};

export type Task2 = {
  action: string; // 必須要有的行動

  // user: string;
  params?: AwardParams & { [key: string]: string | number };
  callback?: () => void;
};

export type TaskMappingItem = {
  action: string;
  matches: { [key: string]: string[] };
  params: { [key: string]: string | number };
};
