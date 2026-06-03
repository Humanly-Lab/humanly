type Options = {
  days: number;
  limit?: number;
  model: string;
  baseUrl: string;
  overwrite: boolean;
  apply: boolean;
};

type UserRow = {
  id: string;
  email: string;
  created_at: string;
  has_settings: boolean;
};

type PoolLike = {
  query<T>(sql: string, params?: Array<string | number | boolean>): Promise<{ rows: T[] }>;
  end(): Promise<void>;
};

type UserAISettingsModelLike = {
  upsert(userId: string, apiKey: string, baseUrl: string, model: string): Promise<unknown>;
};

async function loadBackendModules(): Promise<{
  pool: PoolLike;
  UserAISettingsModel: UserAISettingsModelLike;
}> {
  const [databaseModule, settingsModule] = await Promise.all([
    import('../packages/backend/src/config/database'),
    import('../packages/backend/src/models/user-ai-settings.model'),
  ]);

  return {
    pool: databaseModule.pool,
    UserAISettingsModel: settingsModule.UserAISettingsModel,
  };
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    days: 14,
    model: process.env.DEFAULT_AI_MODEL || process.env.AI_MODEL || 'Qwen/Qwen3.5-397B-A17B',
    baseUrl: process.env.DEFAULT_AI_BASE_URL || process.env.AI_BASE_URL || 'https://api.together.xyz/v1',
    overwrite: false,
    apply: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--days') {
      options.days = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--limit') {
      options.limit = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--model') {
      options.model = argv[i + 1];
      i += 1;
    } else if (arg === '--base-url') {
      options.baseUrl = argv[i + 1];
      i += 1;
    } else if (arg === '--overwrite') {
      options.overwrite = true;
    } else if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.days) || options.days <= 0) {
    throw new Error('--days must be a positive number');
  }

  if (options.limit !== undefined && (!Number.isFinite(options.limit) || options.limit <= 0)) {
    throw new Error('--limit must be a positive number');
  }

  if (!options.model.trim()) {
    throw new Error('--model is required');
  }

  try {
    new URL(options.baseUrl);
  } catch {
    throw new Error('--base-url must be a valid URL');
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  DEFAULT_AI_API_KEY=sk-... pnpm --filter @humanly/backend exec tsx ../../scripts/set-default-ai-settings.ts [options]

Options:
  --days <n>        Target users created in the last n days. Default: 14
  --limit <n>       Limit number of matched users
  --model <name>    Model to save. Default: DEFAULT_AI_MODEL or AI_MODEL or Qwen/Qwen3.5-397B-A17B
  --base-url <url>  Base URL to save. Default: DEFAULT_AI_BASE_URL or AI_BASE_URL or https://api.together.xyz/v1
  --overwrite       Replace existing per-user AI settings
  --apply           Actually write changes. Without this flag, the script is dry-run only.
  --help            Show this message
`);
}

async function getTargetUsers(options: Options, pool: PoolLike): Promise<UserRow[]> {
  const params: Array<string | number | boolean> = [options.days, options.overwrite];
  let limitSql = '';

  if (options.limit !== undefined) {
    params.push(options.limit);
    limitSql = `LIMIT $${params.length}`;
  }

  const sql = `
    SELECT
      u.id,
      u.email,
      u.created_at,
      (uas.user_id IS NOT NULL) AS has_settings
    FROM users u
    LEFT JOIN user_ai_settings uas ON uas.user_id = u.id
    WHERE u.created_at >= NOW() - ($1 || ' days')::interval
      AND ($2::boolean OR uas.user_id IS NULL)
    ORDER BY u.created_at DESC
    ${limitSql}
  `;

  const result = await pool.query<UserRow>(sql, params);
  return result.rows;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const apiKey = process.env.DEFAULT_AI_API_KEY || process.env.AI_API_KEY;
  if (!apiKey) {
    throw new Error('Set DEFAULT_AI_API_KEY or AI_API_KEY in the environment before running this script');
  }

  const { pool, UserAISettingsModel } = await loadBackendModules();
  loadedPool = pool;
  const users = await getTargetUsers(options, pool);

  console.log(`Matched ${users.length} user(s) created within the last ${options.days} day(s).`);
  console.log(`Mode: ${options.apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Base URL: ${options.baseUrl}`);
  console.log(`Model: ${options.model}`);
  console.log(`Overwrite existing settings: ${options.overwrite ? 'yes' : 'no'}`);

  if (users.length === 0) {
    await pool.end();
    return;
  }

  for (const user of users) {
    console.log(`- ${user.email} (${user.id}) created ${new Date(user.created_at).toISOString()}${user.has_settings ? ' [has settings]' : ''}`);
  }

  if (!options.apply) {
    console.log('Dry run only. Re-run with --apply to persist changes.');
    await pool.end();
    return;
  }

  for (const user of users) {
    await UserAISettingsModel.upsert(user.id, apiKey, options.baseUrl, options.model);
  }

  console.log(`Updated ${users.length} user(s).`);
  await pool.end();
}

let loadedPool: PoolLike | null = null;

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await loadedPool?.end().catch(() => {});
  process.exit(1);
});
