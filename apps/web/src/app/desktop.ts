declare global {
  interface Window {
    spAgentDesktop?: { chooseSkillFolder(): Promise<string | undefined> };
  }
}

export async function chooseSkillFolder() {
  return window.spAgentDesktop?.chooseSkillFolder();
}
