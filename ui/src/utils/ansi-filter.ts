/**
 * Strip ANSI escape sequences from text
 *
 * Handles:
 * - CSI sequences: \x1b[...X (colors/styles, cursor movement, etc.)
 * - OSC sequences: \x1b]...ST (title, hyperlinks)
 * - Control characters
 * - Orphaned CSI sequences without ESC prefix (e.g., [2C, [3A)
 */

// CSI (Control Sequence Introducer): \x1b[ followed by parameters and a final byte
const CSI_PATTERN = /\x1b\[[0-9;?]*[A-Za-z]/g

// OSC (Operating System Command): \x1b] followed by content and terminated by ST (\x1b\\) or BEL (\x07)
const OSC_PATTERN = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g

// Other escape sequences: \x1b followed by single character
const ESC_PATTERN = /\x1b[^[\]]/g

// Control characters (except \n which we want to keep)
const CONTROL_PATTERN = /[\x00-\x09\x0b\x0c\x0e-\x1f\x7f]/g

// Bell character
const BELL_PATTERN = /\x07/g

// Orphaned CSI sequences without ESC prefix (browser may strip \x1b)
// Matches patterns like [2C, [3A, [7m, [27m, [?2026h, [?2026l
const ORPHAN_CSI_PATTERN = /\[[\d;?]*[A-Za-z]/g

export function stripAnsi(text: string): string {
  return text
    .replace(OSC_PATTERN, '')
    .replace(CSI_PATTERN, '')
    .replace(ESC_PATTERN, '')
    .replace(BELL_PATTERN, '')
    .replace(CONTROL_PATTERN, '')
    .replace(ORPHAN_CSI_PATTERN, '')
}

/**
 * Process carriage returns in accumulated text
 * \r means "go to start of line", so content after \r overwrites content before it
 */
export function processCarriageReturns(text: string): string {
  const lines = text.split('\n')
  const processed = lines.map(line => {
    const lastCR = line.lastIndexOf('\r')
    if (lastCR !== -1) {
      return line.slice(lastCR + 1)
    }
    return line
  })
  return processed.join('\n')
}

/**
 * Filter output for mobile display
 * Strips ANSI codes and removes decorative line separators
 */
export function filterMobileOutput(content: string): string {
  // DEBUG: return raw content
  return content
}

/**
 * Append new content to existing output, handling carriage returns correctly
 * \r in new content should overwrite the last line of existing content
 */
export function appendMobileOutput(existing: string, newContent: string): string {
  // DEBUG: simple concatenation
  return existing + newContent
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
