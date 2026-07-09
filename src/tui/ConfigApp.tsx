import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import {
  applyConfigChange,
  loadConfigDraft,
  type ConfigDraftState,
  type LanguageScope,
} from '../lib/config-cmd.js';
import type { Language } from '../lib/language.js';
import { sym } from '../lib/theme.js';
import { TOOL_REGISTRY } from '../lib/tools.js';

const VIOLET = '#6e3fe7';
const VIOLET_BRIGHT = '#a182ef';

type Screen = 'hub' | 'tools' | 'spec-language';
type HubFocus = 'tabs' | 'search' | 'list';
type FooterMode = 'nav' | 'dirty-quit' | 'saving' | 'saved' | 'error';
type SettingId = 'tools' | 'spec-language';

const LANGUAGE_ROWS: { id: Language; label: string }[] = [
  { id: 'en-US', label: 'en-US  English (United States)' },
  { id: 'pt-BR', label: 'pt-BR  Português (Brasil)' },
];

const SCOPE_ROWS: { id: LanguageScope; label: string }[] = [
  { id: 'global', label: 'Global — all projects' },
  { id: 'project', label: 'This project only' },
];

const SETTINGS_ITEMS: { id: SettingId; label: string }[] = [
  { id: 'tools', label: 'Tools' },
  { id: 'spec-language', label: 'Spec language' },
];

function useTerminalSize(): { columns: number; rows: number } {
  const { stdout } = useStdout();
  const [size, setSize] = useState({
    columns: stdout.columns || 80,
    rows: stdout.rows || 24,
  });
  useEffect(() => {
    const onResize = () => setSize({ columns: stdout.columns || 80, rows: stdout.rows || 24 });
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);
  return size;
}

function toolsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}

function isDirty(
  tools: string[],
  language: Language,
  scope: LanguageScope,
  baseline: ConfigDraftState | null
): boolean {
  if (baseline === null) {
    return false;
  }
  return (
    !toolsEqual(tools, baseline.tools) ||
    language !== baseline.language ||
    scope !== baseline.languageScope
  );
}

function formatToolsValue(tools: string[]): string {
  return tools.length > 0 ? tools.join(', ') : 'none';
}

function formatLanguageValue(language: Language, scope: LanguageScope, projectOk: boolean): string {
  if (!projectOk || scope === 'global') {
    return `${language} · global`;
  }
  return `${language} · this project`;
}

function SelectRow({
  cursor,
  selected,
  label,
}: {
  cursor: boolean;
  selected: boolean;
  label: string;
}): React.JSX.Element {
  const marker = cursor ? '›' : ' ';
  const glyph = selected ? sym.on : sym.off;
  const color = cursor ? VIOLET_BRIGHT : selected ? VIOLET : undefined;
  return (
    <Text wrap="truncate-end">
      <Text color={color} bold={cursor}>
        {marker} {glyph}  {label}
      </Text>
    </Text>
  );
}

function ListRow({
  cursor,
  label,
  value,
}: {
  cursor: boolean;
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <Box justifyContent="space-between">
      <Text color={cursor ? VIOLET_BRIGHT : undefined} bold={cursor}>
        {cursor ? '› ' : '  '}
        {label}
      </Text>
      <Text dimColor={true}>{value}</Text>
    </Box>
  );
}

export interface ConfigAppProps {
  cwd: string;
  homeDir?: string;
  onApply?: typeof applyConfigChange;
  onLoad?: typeof loadConfigDraft;
}

export function ConfigApp({
  cwd,
  homeDir,
  onApply = applyConfigChange,
  onLoad = loadConfigDraft,
}: ConfigAppProps): React.JSX.Element {
  const { exit } = useApp();
  const { columns } = useTerminalSize();

  const [baseline, setBaseline] = useState<ConfigDraftState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [tools, setTools] = useState<string[]>([]);
  const [language, setLanguage] = useState<Language>('en-US');
  const [scope, setScope] = useState<LanguageScope>('global');

  const [screen, setScreen] = useState<Screen>('hub');
  const [hubFocus, setHubFocus] = useState<HubFocus>('tabs');
  const [searchQuery, setSearchQuery] = useState('');
  const [listIndex, setListIndex] = useState(0);
  const [subIndex, setSubIndex] = useState(0);

  const [footerMode, setFooterMode] = useState<FooterMode>('nav');
  const [statusMessage, setStatusMessage] = useState('');
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const projectScopeAvailable = baseline?.projectScopeAvailable === true;

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q === '') {
      return SETTINGS_ITEMS;
    }
    return SETTINGS_ITEMS.filter((item) => item.label.toLowerCase().includes(q));
  }, [searchQuery]);

  useEffect(() => {
    if (listIndex >= filteredItems.length) {
      setListIndex(Math.max(0, filteredItems.length - 1));
    }
  }, [filteredItems.length, listIndex]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const draft = await onLoad(cwd, homeDir);
        if (cancelled) {
          return;
        }
        setBaseline(draft);
        setTools([...draft.tools]);
        setLanguage(draft.language);
        setScope(draft.languageScope);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (savedTimer.current !== null) {
        clearTimeout(savedTimer.current);
      }
    };
  }, [cwd, homeDir, onLoad]);

  const dirty = isDirty(tools, language, scope, baseline);

  const openSetting = useCallback((id: SettingId) => {
    setSubIndex(0);
    setScreen(id === 'tools' ? 'tools' : 'spec-language');
    setFooterMode('nav');
  }, []);

  const backToHub = useCallback(() => {
    setScreen('hub');
    setHubFocus('list');
    setFooterMode('nav');
  }, []);

  const save = useCallback(async () => {
    if (baseline === null || footerMode === 'saving' || screen !== 'hub') {
      return;
    }
    setFooterMode('saving');
    setStatusMessage('Saving…');
    try {
      const result = await onApply({
        cwd,
        homeDir,
        tools,
        language,
        languageScope: projectScopeAvailable ? scope : 'global',
        previousTools: baseline.globalConfigExists ? baseline.tools : [],
      });
      const nextBaseline: ConfigDraftState = {
        ...baseline,
        tools: result.tools,
        language: result.language as Language,
        languageScope: result.languageScope,
        globalLanguage:
          result.languageScope === 'global'
            ? (result.language as Language)
            : baseline.globalLanguage,
        globalConfigExists: true,
        firstTime: false,
        projectConfigPath: result.projectConfigPath ?? baseline.projectConfigPath,
      };
      setBaseline(nextBaseline);
      setTools([...result.tools]);
      setLanguage(result.language as Language);
      setScope(result.languageScope);

      const gen = result.skills.generated.byTool.length;
      const rem = result.skills.removed.length;
      const skillNote =
        result.toolsChanged || result.bootstrapped
          ? ` · skills +${gen}${rem > 0 ? ` −${rem}` : ''}`
          : '';
      setStatusMessage(`Saved${skillNote}`);
      setFooterMode('saved');
      if (savedTimer.current !== null) {
        clearTimeout(savedTimer.current);
      }
      savedTimer.current = setTimeout(() => {
        setFooterMode('nav');
        setStatusMessage('');
      }, 2200);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : String(err));
      setFooterMode('error');
    }
  }, [
    baseline,
    cwd,
    footerMode,
    homeDir,
    language,
    onApply,
    projectScopeAvailable,
    scope,
    screen,
    tools,
  ]);

  const toggleToolAt = useCallback((index: number) => {
    const tool = TOOL_REGISTRY[index];
    if (tool === undefined) {
      return;
    }
    setTools((prev) =>
      prev.includes(tool.id) ? prev.filter((id) => id !== tool.id) : [...prev, tool.id]
    );
  }, []);

  useInput((input, key) => {
    if (loading || loadError !== null) {
      if (input === 'q' || key.escape) {
        exit();
      }
      return;
    }

    // ── Hub: dirty-quit confirm ──────────────────────────────────────
    if (screen === 'hub' && footerMode === 'dirty-quit') {
      if (input === 's') {
        void save();
        return;
      }
      if (input === 'q') {
        exit();
        return;
      }
      if (key.escape) {
        setFooterMode('nav');
        return;
      }
      return;
    }

    if (footerMode === 'saving') {
      return;
    }

    // ── Sub-screens ──────────────────────────────────────────────────
    if (screen === 'tools') {
      if (key.escape || key.leftArrow) {
        backToHub();
        return;
      }
      if (key.upArrow || input === 'k') {
        setSubIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow || input === 'j') {
        setSubIndex((i) => Math.min(TOOL_REGISTRY.length - 1, i + 1));
        return;
      }
      if (input === 'a') {
        setTools((prev) =>
          prev.length === TOOL_REGISTRY.length ? [] : TOOL_REGISTRY.map((t) => t.id)
        );
        return;
      }
      if (input === ' ' || key.return) {
        toggleToolAt(subIndex);
        return;
      }
      return;
    }

    if (screen === 'spec-language') {
      if (key.escape || key.leftArrow) {
        backToHub();
        return;
      }

      const langCount = LANGUAGE_ROWS.length;
      const scopeCount = projectScopeAvailable ? SCOPE_ROWS.length : 0;
      const total = langCount + scopeCount;

      if (key.upArrow || input === 'k') {
        setSubIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow || input === 'j') {
        setSubIndex((i) => Math.min(total - 1, i + 1));
        return;
      }
      if (input === ' ' || key.return) {
        if (subIndex < langCount) {
          const row = LANGUAGE_ROWS[subIndex];
          if (row !== undefined) {
            setLanguage(row.id);
          }
        } else {
          const row = SCOPE_ROWS[subIndex - langCount];
          if (row !== undefined) {
            setScope(row.id);
          }
        }
        return;
      }
      return;
    }

    // ── Hub ──────────────────────────────────────────────────────────
    if (footerMode === 'error' || footerMode === 'saved') {
      if (key.escape) {
        setFooterMode('nav');
        setStatusMessage('');
        return;
      }
    }

    if (input === 'q') {
      if (dirty) {
        setFooterMode('dirty-quit');
        return;
      }
      exit();
      return;
    }

    if (input === 's' && hubFocus !== 'search') {
      void save();
      return;
    }

    // Search focus: typing filters; special keys navigate
    if (hubFocus === 'search') {
      if (key.escape) {
        if (searchQuery !== '') {
          setSearchQuery('');
        } else {
          setHubFocus('tabs');
        }
        return;
      }
      if (key.upArrow) {
        setHubFocus('tabs');
        return;
      }
      if (key.downArrow || key.return || key.tab) {
        setHubFocus('list');
        setListIndex(0);
        return;
      }
      if (key.backspace || key.delete) {
        setSearchQuery((q) => q.slice(0, -1));
        return;
      }
      // Printable text (Ink may deliver one or more characters)
      if (
        input.length > 0 &&
        !key.ctrl &&
        !key.meta &&
        ![...input].some((ch) => ch < ' ')
      ) {
        setSearchQuery((q) => q + input);
        setListIndex(0);
        return;
      }
      return;
    }

    if (hubFocus === 'tabs') {
      if (key.downArrow || key.tab || key.return) {
        setHubFocus('search');
        return;
      }
      return;
    }

    // list focus
    if (key.upArrow || input === 'k') {
      if (listIndex <= 0) {
        setHubFocus('search');
      } else {
        setListIndex((i) => i - 1);
      }
      return;
    }
    if (key.downArrow || input === 'j') {
      if (filteredItems.length === 0) {
        return;
      }
      setListIndex((i) => Math.min(filteredItems.length - 1, i + 1));
      return;
    }
    if (key.return) {
      const item = filteredItems[listIndex];
      if (item !== undefined) {
        openSetting(item.id);
      }
      return;
    }
    if (key.escape && searchQuery !== '') {
      setSearchQuery('');
      return;
    }
  });

  // ── Loading / error shells ─────────────────────────────────────────
  if (loading) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text bold color={VIOLET}>
          DRAUN
        </Text>
        <Text dimColor>
          {' '}
          {sym.dot} config
        </Text>
        <Box marginTop={1}>
          <Text dimColor>Loading configuration…</Text>
        </Box>
      </Box>
    );
  }

  if (loadError !== null) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text bold color={VIOLET}>
          DRAUN
        </Text>
        <Box marginTop={1}>
          <Text color="red">{loadError}</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>q quit</Text>
        </Box>
      </Box>
    );
  }

  // ── Tools sub-screen ───────────────────────────────────────────────
  if (screen === 'tools') {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1} width={columns}>
        <Box marginBottom={1}>
          <Text color={VIOLET_BRIGHT}>← </Text>
          <Text bold color={VIOLET}>
            Tools
          </Text>
          {dirty ? (
            <Text dimColor>
              {' '}
              {sym.dot} unsaved
            </Text>
          ) : null}
        </Box>
        <Box flexDirection="column">
          {TOOL_REGISTRY.map((tool, i) => (
            <SelectRow
              key={tool.id}
              cursor={subIndex === i}
              selected={tools.includes(tool.id)}
              label={tool.name}
            />
          ))}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>
            space toggle {sym.dot} a all {sym.dot} Esc back
          </Text>
        </Box>
      </Box>
    );
  }

  // ── Spec language sub-screen ───────────────────────────────────────
  if (screen === 'spec-language') {
    const langCount = LANGUAGE_ROWS.length;
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1} width={columns}>
        <Box marginBottom={1}>
          <Text color={VIOLET_BRIGHT}>← </Text>
          <Text bold color={VIOLET}>
            Spec language
          </Text>
          {dirty ? (
            <Text dimColor>
              {' '}
              {sym.dot} unsaved
            </Text>
          ) : null}
        </Box>

        <Text bold dimColor>
          Language
        </Text>
        <Box flexDirection="column" marginTop={1} marginBottom={1}>
          {LANGUAGE_ROWS.map((row, i) => (
            <SelectRow
              key={row.id}
              cursor={subIndex === i}
              selected={language === row.id}
              label={row.label}
            />
          ))}
        </Box>

        {projectScopeAvailable ? (
          <>
            <Text bold dimColor>
              Apply to
            </Text>
            <Box flexDirection="column" marginTop={1}>
              {SCOPE_ROWS.map((row, i) => (
                <SelectRow
                  key={row.id}
                  cursor={subIndex === langCount + i}
                  selected={scope === row.id}
                  label={row.label}
                />
              ))}
            </Box>
          </>
        ) : (
          <Text dimColor>Applies globally (no Draun project in this directory).</Text>
        )}

        <Box marginTop={1}>
          <Text dimColor>
            space select {sym.dot} Esc back
          </Text>
        </Box>
      </Box>
    );
  }

  // ── Hub ────────────────────────────────────────────────────────────
  const footer = (() => {
    if (footerMode === 'dirty-quit') {
      return (
        <Text>
          <Text color="yellow">Unsaved changes</Text>
          <Text dimColor>
            {' '}
            {sym.dot} s save {sym.dot} q discard {sym.dot} esc keep editing
          </Text>
        </Text>
      );
    }
    if (footerMode === 'saving') {
      return <Text dimColor>Saving…</Text>;
    }
    if (footerMode === 'saved') {
      return (
        <Text color="green">
          {sym.check} {statusMessage || 'Saved'}
        </Text>
      );
    }
    if (footerMode === 'error') {
      return (
        <Text>
          <Text color="red">
            {sym.cross} {statusMessage}
          </Text>
          <Text dimColor>
            {' '}
            {sym.dot} esc dismiss
          </Text>
        </Text>
      );
    }
    if (hubFocus === 'search') {
      return (
        <Text dimColor>
          Type to filter {sym.dot} ↓ list {sym.dot} ↑ tabs {sym.dot} Esc clear
        </Text>
      );
    }
    if (hubFocus === 'tabs') {
      return (
        <Text dimColor>
          ↓ search {sym.dot} s save {sym.dot} q quit
        </Text>
      );
    }
    return (
      <Text dimColor>
        ↑↓ navigate {sym.dot} Enter open {sym.dot} s save {sym.dot} q quit
      </Text>
    );
  })();

  const searchActive = hubFocus === 'search';
  // Single-line string so Ink never wraps the placeholder across the border.
  const searchLine =
    searchQuery === ''
      ? `⌕ ${searchActive ? '▌' : ''}Search settings…`
      : `⌕ ${searchQuery}${searchActive ? '▌' : ''}`;

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} width={columns}>
      {/* Tabs + status */}
      <Box marginBottom={1} justifyContent="space-between">
        <Box>
          <Text
            bold
            color={hubFocus === 'tabs' ? VIOLET_BRIGHT : VIOLET}
            inverse={hubFocus === 'tabs'}
          >
            {' Settings '}
          </Text>
          {baseline?.firstTime === true ? (
            <Text dimColor>
              {' '}
              {sym.dot} first-time setup
            </Text>
          ) : null}
        </Box>
        <Box>
          {dirty ? (
            <Text color={VIOLET_BRIGHT}>{sym.on} unsaved</Text>
          ) : (
            <Text dimColor>saved</Text>
          )}
        </Box>
      </Box>

      {/* Search — fixed one content row; truncate instead of wrapping into the border */}
      <Box
        borderStyle="single"
        borderColor={searchActive ? VIOLET_BRIGHT : 'gray'}
        paddingX={1}
        marginBottom={1}
        height={3}
        flexShrink={0}
      >
        <Text wrap="truncate" dimColor={searchQuery === ''}>
          {searchLine}
        </Text>
      </Box>

      {/* Settings list */}
      <Box flexDirection="column">
        {filteredItems.length === 0 ? (
          <Text dimColor>No settings match “{searchQuery}”</Text>
        ) : (
          filteredItems.map((item, i) => {
            const value =
              item.id === 'tools'
                ? formatToolsValue(tools)
                : formatLanguageValue(language, scope, projectScopeAvailable);
            return (
              <ListRow
                key={item.id}
                cursor={hubFocus === 'list' && listIndex === i}
                label={item.label}
                value={value}
              />
            );
          })
        )}
      </Box>

      <Box marginTop={1}>{footer}</Box>
    </Box>
  );
}
