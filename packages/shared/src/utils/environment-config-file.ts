import type { WritingEnvironmentConfig } from '../types/environment.types';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export type EnvironmentConfigFileFormat = 'json' | 'yaml';

const ENVIRONMENT_CONFIG_SUFFIX = 'environment-config';

export const ENVIRONMENT_CONFIG_ACCEPT = 'application/json,.json,application/yaml,text/yaml,.yaml,.yml';

export const getEnvironmentConfigFileFormat = (filename: string): EnvironmentConfigFileFormat | null => {
  const normalized = filename.trim().toLowerCase();

  if (normalized.endsWith('.json')) return 'json';
  if (normalized.endsWith('.yaml') || normalized.endsWith('.yml')) return 'yaml';

  return null;
};

export const getEnvironmentConfigExtension = (format: EnvironmentConfigFileFormat) => (
  format === 'json' ? 'json' : 'yaml'
);

export const buildEnvironmentConfigFilename = (
  name: string | null | undefined,
  format: EnvironmentConfigFileFormat
) => {
  const normalized = (name || 'task')
    .trim()
    .replace(/[^a-z0-9_-]+/gi, '_')
    .replace(/^_+|_+$/g, '');
  const extension = getEnvironmentConfigExtension(format);

  return `${normalized || 'task'}-${ENVIRONMENT_CONFIG_SUFFIX}.${extension}`;
};

export const serializeEnvironmentConfig = (
  config: WritingEnvironmentConfig,
  format: EnvironmentConfigFileFormat
) => {
  if (format === 'json') {
    return {
      content: JSON.stringify(config, null, 2),
      contentType: 'application/json',
    };
  }

  return {
    content: stringifyYaml(config),
    contentType: 'application/yaml',
  };
};

export const parseEnvironmentConfigContent = (filename: string, content: string): unknown => {
  const format = getEnvironmentConfigFileFormat(filename);

  if (!format) {
    throw new Error('Import Environment supports JSON, YAML, and YML files.');
  }

  if (format === 'json') {
    return JSON.parse(content);
  }

  return parseYaml(content);
};
