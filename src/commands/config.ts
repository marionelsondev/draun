import { Command } from 'commander';
import {
  runConfig,
  type ConfigApplyPayload,
  type ConfigPayload,
  type ConfigShowPayload,
} from '../lib/config-cmd.js';
import { printResult } from '../lib/output.js';
import { dim, footer, gold, header, line, step } from '../lib/theme.js';
import { renderToolFiles } from './init.js';

function renderShow(payload: ConfigShowPayload): string {
  const lines: string[] = [header('config'), line()];
  lines.push(
    step(
      `Tools: ${payload.tools.length > 0 ? gold(payload.tools.join(', ')) : dim('none')}`
    )
  );
  lines.push(step(`Language (effective): ${gold(payload.language)}`));
  lines.push(step(`Language (global): ${gold(payload.globalLanguage)}`));
  lines.push(line());
  lines.push(step(`Global config: ${gold(payload.globalConfigPath)}`));
  if (payload.projectRoot !== null) {
    lines.push(
      step(
        `Project config: ${gold(payload.projectConfigPath ?? '(none)')} ${dim(
          payload.projectScopeAvailable ? '(project scope available)' : ''
        )}`
      )
    );
  } else {
    lines.push(
      step(dim('No Draun project in this directory (project language scope unavailable).'))
    );
  }
  if (!payload.globalConfigExists) {
    lines.push(line());
    lines.push(
      step(dim('Global config not created yet — run `draun config` in a terminal to set up.'))
    );
  }
  lines.push(line());
  lines.push(
    footer(dim('Open the interactive UI with `draun config`, or pass --tools / --language / --scope.'))
  );
  return lines.join('\n');
}

function renderApply(payload: ConfigApplyPayload): string {
  const lines: string[] = [header('config'), line()];
  if (payload.bootstrapped) {
    lines.push(step(`Created global config at ${gold(payload.globalConfigPath)}`));
    lines.push(line());
  }
  lines.push(
    step(
      `Tools: ${payload.tools.length > 0 ? gold(payload.tools.join(', ')) : dim('none')}`
    )
  );
  lines.push(
    step(`Language: ${gold(payload.language)} ${dim(`(${payload.languageScope})`)}`)
  );
  if (payload.languageScope === 'project' && payload.projectConfigPath !== null) {
    lines.push(step(`Project config: ${gold(payload.projectConfigPath)}`));
  } else {
    lines.push(step(`Global config: ${gold(payload.globalConfigPath)}`));
  }

  if (payload.toolsChanged || payload.bootstrapped) {
    renderToolFiles('Skills generated', payload.skills.generated, lines);
    if (payload.skills.removed.length > 0) {
      lines.push(line());
      lines.push(step('Skills removed:'));
      for (const entry of payload.skills.removed) {
        lines.push(line(gold(entry.tool)));
        for (const path of entry.paths) {
          lines.push(line(`  ${dim(path)}`));
        }
      }
    }
  }

  lines.push(line());
  lines.push(footer(dim('Configuration saved.')));
  return lines.join('\n');
}

export function renderConfig(payload: ConfigPayload): string {
  if (payload.mode === 'show') {
    return renderShow(payload);
  }
  return renderApply(payload);
}

interface ConfigCliOptions {
  tools?: string;
  language?: string;
  scope?: string;
}

export function makeConfigCommand(): Command {
  return new Command('config')
    .description('Interactive settings: AI tools and language (or pass flags for non-interactive)')
    .option('--tools <ids>', 'comma-separated tool ids (or "all"); non-interactive')
    .option('--language <id>', 'language (en-US or pt-BR); non-interactive')
    .option(
      '--scope <global|project>',
      'where to apply language: global (default) or project (requires draun init)'
    )
    .action(async (opts: ConfigCliOptions, cmd: Command) => {
      const json = cmd.optsWithGlobals<{ json?: boolean }>().json === true;
      const cwd = process.cwd();
      const hasFlags =
        opts.tools !== undefined || opts.language !== undefined || opts.scope !== undefined;

      // Interactive settings TUI when attached to a terminal and not forced
      // into the flag/--json path (same pattern as `draun status`).
      if (!json && !hasFlags && process.stdout.isTTY === true && process.stdin.isTTY === true) {
        const { runConfigTui } = await import('../tui/config-render.js');
        await runConfigTui(cwd);
        return;
      }

      const payload = await runConfig(cwd, {
        tools: opts.tools,
        language: opts.language,
        scope: opts.scope,
        json,
      });
      printResult(payload, renderConfig(payload), json);
    });
}
