const RESET = '\x1b[0m'

const green = Bun.color('green', 'ansi') ?? ''
const red = Bun.color('red', 'ansi') ?? ''
const yellow = Bun.color('orange', 'ansi') ?? ''
const cyan = Bun.color('cyan', 'ansi') ?? ''
const dim = '\x1b[2m'

export const c = {
  green: (s: string) => `${green}${s}${RESET}`,
  red: (s: string) => `${red}${s}${RESET}`,
  yellow: (s: string) => `${yellow}${s}${RESET}`,
  cyan: (s: string) => `${cyan}${s}${RESET}`,
  dim: (s: string) => `${dim}${s}${RESET}`,

  // 语义化
  success: (s: string) => `${green}✓${RESET} ${s}`,
  error: (s: string) => `${red}✗${RESET} ${s}`,
  warn: (s: string) => `${yellow}⚠${RESET} ${s}`,
  info: (s: string) => `${cyan}▶${RESET} ${s}`,
}
