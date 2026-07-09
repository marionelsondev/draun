import React from 'react';
import { render } from 'ink';
import { ConfigApp } from './ConfigApp.js';

const ENTER_ALT_SCREEN = '\x1b[?1049h';
const LEAVE_ALT_SCREEN = '\x1b[?1049l';

/**
 * Runs the interactive config TUI in the terminal's alternate screen buffer
 * and resolves when the user quits.
 */
export async function runConfigTui(cwd: string, homeDir?: string): Promise<void> {
  process.stdout.write(ENTER_ALT_SCREEN);
  const instance = render(<ConfigApp cwd={cwd} homeDir={homeDir} />, {
    exitOnCtrlC: true,
  });
  try {
    await instance.waitUntilExit();
  } finally {
    process.stdout.write(LEAVE_ALT_SCREEN);
  }
}
