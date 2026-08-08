import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { configSchema, type ResolvedConfig } from "./schema.js";

export class ConfigError extends Error {
  constructor(
    message: string,
    readonly issues?: string[],
  ) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Load a YAML brand config, validate it against the schema (filling all
 * standard defaults), and resolve file paths relative to the config file.
 * The returned config is fully resolved — every optional field is populated.
 */
export async function loadConfig(configPath: string): Promise<ResolvedConfig> {
  const absPath = resolve(process.cwd(), configPath);

  let raw: string;
  try {
    raw = await readFile(absPath, "utf8");
  } catch {
    throw new ConfigError(`Config file not found: ${absPath}`);
  }

  let doc: unknown;
  try {
    doc = parseYaml(raw);
  } catch (err) {
    throw new ConfigError(
      `Could not parse YAML in ${absPath}: ${(err as Error).message}`,
    );
  }

  const parsed = configSchema.safeParse(doc);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
    );
    throw new ConfigError("Config validation failed", issues);
  }

  const config = parsed.data;

  // Resolve the logo path relative to the config file's directory.
  const baseDir = dirname(absPath);
  if (!isAbsolute(config.logo.src)) {
    config.logo.src = resolve(baseDir, config.logo.src);
  }

  return config;
}
