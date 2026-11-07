export type PackVersion = readonly [number, number, number];

export type PluginSourceInput = {
  provider: "curseforge" | "github";
  url: string;
  uuids: string[];
  projectId?: number;
  assetName?: string;
  installedRelease?: string;
};

export type PluginSource = PluginSourceInput & { id: string };

export type PluginRelease = {
  id: string;
  name: string;
  url: string;
  fileName?: string;
  downloadUrl?: string;
  sha256?: string;
};

export type PluginUpdateCheck = {
  sourceId: string;
  status: "update" | "current" | "unknown" | "error";
  message: string;
  release?: PluginRelease;
};

export type PluginUpdateList = {
  sources: PluginSource[];
  curseforgeConfigured: boolean;
};

export type PluginInstallPreview = {
  token: string;
  expiresAt: string;
  release?: PluginRelease;
  packs: {
    uuid: string;
    name: string;
    type: "behaviour" | "resource";
    version: PackVersion;
    replacesSameVersion: boolean;
    activates: boolean;
  }[];
  warnings: string[];
};

export type PluginInstallResult = {
  backup: string;
  running: boolean;
};
