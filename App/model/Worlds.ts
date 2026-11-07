export const GAME_MODES = ["survival", "creative", "adventure"] as const;
export const DIFFICULTIES = ["peaceful", "easy", "normal", "hard"] as const;

export type WorldSettings = {
  seed: string;
  gameMode: (typeof GAME_MODES)[number];
  difficulty: (typeof DIFFICULTIES)[number];
};

export type WorldInfo = {
  name: string;
  active: boolean;
  generated: boolean;
  settings: WorldSettings | null;
};

export type WorldList = {
  activeWorld: string;
  defaults: WorldSettings;
  worlds: WorldInfo[];
};

export type CreateWorldInput = WorldSettings & {
  name: string;
  activate: boolean;
};
