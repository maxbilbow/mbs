
export type PackVersionInfo = {
    uuid: string;
    name: string;
    folder: string;
    version: readonly [number, number, number];
    description: string,
    active: boolean;
    type: "behaviour" | "resource";
}

export type PluginInfo = {
    // From latest version 
    uuid: string;
    name: string;
    description: string;
    type: "behaviour" | "resource";
    versions: PackVersionInfo[];
}