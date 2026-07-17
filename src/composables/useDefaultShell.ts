export function getDefaultShell(): string[] {
  if (navigator.platform.includes('Win')) {
    return ['cmd.exe']
  }
  return ['/bin/zsh']
}
