import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { getCountryNameByCode } from '../profiles/country.util';
import { createUuidV7, isUuidV7 } from '../common/uuidv7';
import { upsertSeedProfiles, type ProfileSeedRecord } from './sqlite';

type RawSeedRecord = Record<string, unknown>;

function getAgeGroup(age: number): ProfileSeedRecord['age_group'] {
  if (age <= 12) {
    return 'child';
  }
  if (age <= 19) {
    return 'teenager';
  }
  if (age <= 59) {
    return 'adult';
  }
  return 'senior';
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += character;
  }

  values.push(current.trim());
  return values;
}

function parseCsv(content: string): RawSeedRecord[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce<RawSeedRecord>((record, header, index) => {
      record[header] = values[index];
      return record;
    }, {});
  });
}

function parseSeedFile(filePath: string): RawSeedRecord[] {
  const content = readFileSync(filePath, 'utf8');
  const extension = extname(filePath).toLowerCase();

  if (extension === '.json') {
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error('Seed file must contain an array of profiles');
    }
    return parsed as RawSeedRecord[];
  }

  if (extension === '.csv') {
    return parseCsv(content);
  }

  throw new Error('Unsupported seed file format. Use .json or .csv');
}

function getRequiredString(record: RawSeedRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }
  return undefined;
}

function getRequiredNumber(record: RawSeedRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function normalizeSeedRecord(record: RawSeedRecord, index: number): ProfileSeedRecord {
  const name = getRequiredString(record, ['name']);
  const gender = getRequiredString(record, ['gender']);
  const countryId = getRequiredString(record, ['country_id', 'countryId']);
  const age = getRequiredNumber(record, ['age']);
  const genderProbability = getRequiredNumber(record, ['gender_probability', 'genderProbability']);
  const countryProbability = getRequiredNumber(record, [
    'country_probability',
    'countryProbability',
  ]);

  if (!name || !gender || !countryId || age === undefined) {
    throw new Error(`Invalid seed record at row ${index + 1}`);
  }

  const idCandidate = getRequiredString(record, ['id']);
  const id = idCandidate && isUuidV7(idCandidate) ? idCandidate : createUuidV7();

  return {
    id,
    name,
    gender: gender.toLowerCase(),
    gender_probability: genderProbability ?? 0,
    age,
    age_group:
      (getRequiredString(record, ['age_group', 'ageGroup'])?.toLowerCase() as
        | 'child'
        | 'teenager'
        | 'adult'
        | 'senior'
        | undefined) ?? getAgeGroup(age),
    country_id: countryId.toUpperCase(),
    country_name: getRequiredString(record, ['country_name', 'countryName']) ?? getCountryNameByCode(countryId),
    country_probability: countryProbability ?? 0,
    created_at: getRequiredString(record, ['created_at', 'createdAt']) ?? new Date().toISOString(),
  };
}

function main() {
  const inputPath = process.env.SEED_FILE;
  if (!inputPath) {
    throw new Error('SEED_FILE environment variable is required');
  }

  const resolvedPath = resolve(process.cwd(), inputPath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Seed file not found: ${resolvedPath}`);
  }

  const rawProfiles = parseSeedFile(resolvedPath);
  const profiles = rawProfiles.map((record, index) => normalizeSeedRecord(record, index));
  const processed = upsertSeedProfiles(profiles);

  process.stdout.write(`Seeded ${processed} profiles from ${resolvedPath}\n`);
}

main();
