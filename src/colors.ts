export enum AnsiColor {
  RESET = '\x1b[0m',
  RED = '\x1b[31m',
  GREEN = '\x1b[32m',
  YELLOW = '\x1b[33m',
  CYAN = '\x1b[96m',
  GRAY = '\x1b[90m',
  PURPLE = '\x1b[35m'
}

export const color = (str: string, colorAnsiCode: AnsiColor): string => {
  return `${colorAnsiCode}${str}${AnsiColor.RESET}`
}

export const red = (str: string) => color(str, AnsiColor.RED)
export const green = (str: string) => color(str, AnsiColor.GREEN)
export const cyan = (str: string) => color(str, AnsiColor.CYAN)
export const gray = (str: string) => color(str, AnsiColor.GRAY)
export const purple = (str: string) => color(str, AnsiColor.PURPLE)
export const yellow = (str: string) => color(str, AnsiColor.YELLOW)
