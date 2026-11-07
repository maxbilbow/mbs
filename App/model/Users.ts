export const PERMISSIONS = ["visitor", "member", "operator"] as const;
export type Permission = (typeof PERMISSIONS)[number];

export interface UserInfo {
  xuid: string;
  username: string | null;
  alias: string;
  permissions: Record<string, Permission>;
}

export interface UserList {
  activeWorld: string;
  defaultPermission: Permission;
  worlds: string[];
  users: UserInfo[];
}

export interface UpdateUserInput {
  xuid: string;
  alias: string;
  world: string;
  permission: Permission | null;
}
