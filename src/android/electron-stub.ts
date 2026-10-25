// Stand-in for the "electron" module. The shared YouTube code (electron/youtube/*) only needs
// ipcRenderer.invoke("potoken:interpreter", url) to download BotGuard's interpreter script.
export const ipcRenderer = {
  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    if (channel === "potoken:interpreter") {
      const response = await fetch(String(args[0]));
      if (!response.ok) throw new Error(`BotGuard interpreter returned ${response.status}`);
      return response.text();
    }
    throw new Error(`"${channel}" is not available on Android`);
  },
  send(): void {},
  on() {
    return ipcRenderer;
  },
  removeListener() {
    return ipcRenderer;
  },
};

export default { ipcRenderer };
