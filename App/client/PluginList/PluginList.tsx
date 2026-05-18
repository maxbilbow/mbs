import { useEffect, useState } from "react";
import type { PluginInfo } from "../../model/Plugins.js";
import { fetchPlugins } from "../api/Plugins.js";

export function PluginList() {
  const [plugins, setPlugins] = useState<readonly PluginInfo[]>([]);
  useEffect(() => {
    fetchPlugins().then(([plugins, error]) => {
      if (error) {
        console.error("Failed to fetch plugins:", error);
      } else {
        setPlugins(plugins);
      }
    });
  }, []);
  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Versions</th>
        </tr>
      </thead>
      <tbody>
        {plugins.map((plugin) => (
          <tr key={plugin.uuid}>
            <td>{plugin.name}</td>
            <td>
              {plugin.type === "behaviour" ? "Behaviour Pack" : "Resource Pack"}
            </td>
            <td className="version-list">
              {plugin.versions.map(({ uuid, version, active }) => (
                <button key={uuid + version.join('.')}
                  is="plugin-version-toggle"
                  data-uuid={uuid}
                  data-version={version.join('.')}
                  data-active={`${active}`}
                />
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
