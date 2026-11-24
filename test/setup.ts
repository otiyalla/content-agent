// Loaded before every test file. Tests never use real credentials or the network: values set here win
// over .env, and any request that a test hasn't stubbed fails.
Object.assign(process.env, {
  ANTHROPIC_API_KEY: 'test',
  OPENAI_API_KEY: '',
  XAI_API_KEY: '',
  TAVILY_API_KEY: '',
  IG_USER_ID: '1',
  IG_ACCESS_TOKEN: 'EAAtest',
  IG_HANDLE: '@zenlot_app',
  IG_GRAPH_VERSION: 'v27.0',
  IG_API_HOST: '',
  SMTP_USER: '',
  SMTP_PASS: '',
  DRY_RUN: 'true',
  AGENTS_AUTOPOST: 'false',
  OWNER_AWAY: 'false',
  SAFETY_BACKUP_EMAIL: '',
  RADAR_COMPETITOR_NAMES: '',
});

globalThis.fetch = (async (url: unknown) => {
  throw new Error(`test made a network request: ${String(url).split('?')[0]}`);
}) as typeof fetch;
