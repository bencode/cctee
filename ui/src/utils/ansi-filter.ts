/**
 * Strip ANSI escape sequences from text
 *
 * Handles:
 * - CSI sequences: \x1b[...m (colors/styles), \x1b[...H (cursor), etc.
 * - OSC sequences: \x1b]...ST (title, hyperlinks)
 * - Control characters: \x07 (bell), \r (carriage return)
 */

// CSI (Control Sequence Introducer): \x1b[ followed by parameters and a final byte
const CSI_PATTERN = /\x1b\[[0-9;?]*[A-Za-z]/g

// OSC (Operating System Command): \x1b] followed by content and terminated by ST (\x1b\\) or BEL (\x07)
const OSC_PATTERN = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g

// Other escape sequences: \x1b followed by single character
const ESC_PATTERN = /\x1b[^[\]]/g

// Control characters
const CONTROL_PATTERN = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g

// Bell character
const BELL_PATTERN = /\x07/g

// Carriage return (often used with newline, keep newlines)
const CR_PATTERN = /\r(?!\n)/g

export function stripAnsi(text: string): string {
  return text
    .replace(OSC_PATTERN, '')
    .replace(CSI_PATTERN, '')
    .replace(ESC_PATTERN, '')
    .replace(BELL_PATTERN, '')
    .replace(CR_PATTERN, '')
    .replace(CONTROL_PATTERN, '')
}

/**
 * Filter output for mobile display
 * Strips ANSI codes and removes decorative line separators
 */
export function filterMobileOutput(content: string): string {
  const stripped = stripAnsi(content)
  // Remove decorative line separators (─ repeated 10+ times)
  return stripped.replace(/[─]{10,}/g, '')
}

/**
 * Process output for mobile display with clear screen detection
 * Returns either 'append' (add to existing) or 'clear' (replace existing)
 */
export type MobileOutputResult =
  | { type: 'append'; content: string }
  | { type: 'clear'; content: string }

// Clear screen sequences: \x1b[2J (clear screen) or \x1b[H\x1b[J (cursor home + clear)
const CLEAR_SCREEN_PATTERN = /\x1b\[2J|\x1b\[H\x1b\[J/

export function processMobileOutput(content: string): MobileOutputResult {
  const hasClearScreen = CLEAR_SCREEN_PATTERN.test(content)
  const stripped = filterMobileOutput(content)

  if (hasClearScreen) {
    return { type: 'clear', content: stripped }
  }
  return { type: 'append', content: stripped }
}

/**
 * Filter output for desktop terminal (xterm)
 * Only removes decorative line separators, keeps ANSI codes for xterm rendering
 */
export function filterDesktopOutput(content: string): string {
  // Remove decorative separators but keep ANSI codes (xterm handles them)
  return content.replace(/(\x1b\[[0-9;]*m)*[─]{10,}(\x1b\[[0-9;]*m)*/g, '')
}
