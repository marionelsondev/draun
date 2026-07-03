import React from 'react';
import { render } from 'ink';
import { StatusApp } from './StatusApp.js';

const ENTER_ALT_SCREEN = '\x1b[?1049h';
const LEAVE_ALT_SCREEN = '\x1b[?1049l';

/**
 * Runs the interactive status TUI in the terminal's alternate screen buffer
 * (Ink v5 has no built-in alternate-screen option, so we toggle it manually)
 * and resolves when the user quits.
 */
export async function runStatusTui(root: string, initialSlug?: string): Promise<void> {
  process.stdout.write(ENTER_ALT_SCREEN);
  const instance = render(<StatusApp root={root} initialSlug={initialSlug} />, {
    exitOnCtrlC: true,
  });
  try {
    await instance.waitUntilExit();
  } finally {
    process.stdout.write(LEAVE_ALT_SCREEN);
  }
}
