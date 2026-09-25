import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("omni", {
  invoke: async (command: unknown) => {
    const result = await ipcRenderer.invoke("omni:command", command);
    if (!result.ok) throw new Error(result.error);
    return result.data;
  },
});
