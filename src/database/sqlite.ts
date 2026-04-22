import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type ProfileRecord = {
  id: string;
  name: string;
  gender: string;
  gender_probability: number;
  age: number;
  age_group: string;
  country_id: string;
  country_name: string;
  country_probability: number;
  created_at: string;
};

export type ProfileSeedRecord = ProfileRecord;

export type ProfileQueryFilters = {
  gender?: 'male' | 'female';
  age_group?: 'child' | 'teenager' | 'adult' | 'senior';
  country_id?: string;
  min_age?: number;
  max_age?: number;
  min_gender_probability?: number;
  min_country_probability?: number;
};

export type ProfileQueryOptions = {
  sort_by: 'age' | 'created_at' | 'gender_probability';
  order: 'asc' | 'desc';
  page: number;
  limit: number;
};

export type ProfileQueryResult = {
  total: number;
  data: ProfileRecord[];
};

const dataDirectory = join(process.cwd(), '.data');
mkdirSync(dataDirectory, { recursive: true });

const databasePath = process.env.PROFILES_DB_PATH || join(dataDirectory, 'profiles.sqlite');
const database = new DatabaseSync(databasePath);

function getExistingColumns(): Set<string> {
  const rows = database.prepare(`PRAGMA table_info('profiles')`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function createProfilesTable(tableName: string) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      gender TEXT NOT NULL,
      gender_probability REAL NOT NULL,
      age INTEGER NOT NULL,
      age_group TEXT NOT NULL,
      country_id TEXT NOT NULL,
      country_name TEXT NOT NULL,
      country_probability REAL NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
}

function ensureSchema() {
  createProfilesTable('profiles');

  const columns = getExistingColumns();
  const expectedColumns = [
    'id',
    'name',
    'gender',
    'gender_probability',
    'age',
    'age_group',
    'country_id',
    'country_name',
    'country_probability',
    'created_at',
  ];

  const needsMigration =
    columns.size !== expectedColumns.length ||
    expectedColumns.some((column) => !columns.has(column));

  if (!needsMigration) {
    return;
  }

  createProfilesTable('profiles_next');

  const sourceHasCountryName = columns.has('country_name');
  const sourceColumns = [
    'id',
    'name',
    'gender',
    'gender_probability',
    'age',
    'age_group',
    'country_id',
    sourceHasCountryName ? 'country_name' : "'' AS country_name",
    'country_probability',
    'created_at',
  ];

  database.exec(`
    INSERT INTO profiles_next (
      id,
      name,
      gender,
      gender_probability,
      age,
      age_group,
      country_id,
      country_name,
      country_probability,
      created_at
    )
    SELECT ${sourceColumns.join(', ')}
    FROM profiles
  `);

  database.exec('DROP TABLE profiles');
  database.exec('ALTER TABLE profiles_next RENAME TO profiles');
}

function ensureIndexes() {
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_profiles_gender ON profiles (gender);
    CREATE INDEX IF NOT EXISTS idx_profiles_age_group ON profiles (age_group);
    CREATE INDEX IF NOT EXISTS idx_profiles_country_id ON profiles (country_id);
    CREATE INDEX IF NOT EXISTS idx_profiles_age ON profiles (age);
    CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON profiles (created_at);
    CREATE INDEX IF NOT EXISTS idx_profiles_gender_probability ON profiles (gender_probability);
    CREATE INDEX IF NOT EXISTS idx_profiles_country_probability ON profiles (country_probability);
  `);
}

ensureSchema();
ensureIndexes();

function normalizeProfile(profile: ProfileRecord): ProfileRecord {
  return {
    ...profile,
    name: profile.name.trim(),
    gender: profile.gender.toLowerCase(),
    age_group: profile.age_group.toLowerCase(),
    country_id: profile.country_id.toUpperCase(),
    country_name: profile.country_name.trim(),
    created_at: new Date(profile.created_at).toISOString(),
  };
}

function buildWhereClause(filters: ProfileQueryFilters) {
  const clauses: string[] = [];
  const values: Array<string | number> = [];

  if (filters.gender) {
    clauses.push('gender = ?');
    values.push(filters.gender);
  }

  if (filters.age_group) {
    clauses.push('age_group = ?');
    values.push(filters.age_group);
  }

  if (filters.country_id) {
    clauses.push('country_id = ?');
    values.push(filters.country_id.toUpperCase());
  }

  if (filters.min_age !== undefined) {
    clauses.push('age >= ?');
    values.push(filters.min_age);
  }

  if (filters.max_age !== undefined) {
    clauses.push('age <= ?');
    values.push(filters.max_age);
  }

  if (filters.min_gender_probability !== undefined) {
    clauses.push('gender_probability >= ?');
    values.push(filters.min_gender_probability);
  }

  if (filters.min_country_probability !== undefined) {
    clauses.push('country_probability >= ?');
    values.push(filters.min_country_probability);
  }

  return {
    whereClause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    values,
  };
}

export function findProfileByName(name: string): ProfileRecord | null {
  const statement = database.prepare('SELECT * FROM profiles WHERE LOWER(name) = LOWER(?) LIMIT 1');
  return (statement.get(name.trim()) as ProfileRecord | undefined) ?? null;
}

export function findProfileById(id: string): ProfileRecord | null {
  const statement = database.prepare('SELECT * FROM profiles WHERE id = ? LIMIT 1');
  return (statement.get(id) as ProfileRecord | undefined) ?? null;
}

export function insertProfile(profile: ProfileRecord): ProfileRecord {
  const normalized = normalizeProfile(profile);
  const statement = database.prepare(`
    INSERT INTO profiles (
      id,
      name,
      gender,
      gender_probability,
      age,
      age_group,
      country_id,
      country_name,
      country_probability,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `);

  return statement.get(
    normalized.id,
    normalized.name,
    normalized.gender,
    normalized.gender_probability,
    normalized.age,
    normalized.age_group,
    normalized.country_id,
    normalized.country_name,
    normalized.country_probability,
    normalized.created_at,
  ) as ProfileRecord;
}

export function upsertSeedProfiles(profiles: ProfileSeedRecord[]): number {
  const statement = database.prepare(`
    INSERT INTO profiles (
      id,
      name,
      gender,
      gender_probability,
      age,
      age_group,
      country_id,
      country_name,
      country_probability,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      gender = excluded.gender,
      gender_probability = excluded.gender_probability,
      age = excluded.age,
      age_group = excluded.age_group,
      country_id = excluded.country_id,
      country_name = excluded.country_name,
      country_probability = excluded.country_probability,
      created_at = excluded.created_at
  `);

  database.exec('BEGIN');
  try {
    for (const row of profiles) {
      const normalized = normalizeProfile(row);
      statement.run(
        normalized.id,
        normalized.name,
        normalized.gender,
        normalized.gender_probability,
        normalized.age,
        normalized.age_group,
        normalized.country_id,
        normalized.country_name,
        normalized.country_probability,
        normalized.created_at,
      );
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }

  return profiles.length;
}

export function queryProfiles(
  filters: ProfileQueryFilters,
  options: ProfileQueryOptions,
): ProfileQueryResult {
  const sortColumn = {
    age: 'age',
    created_at: 'created_at',
    gender_probability: 'gender_probability',
  }[options.sort_by];

  const direction = options.order.toUpperCase();
  const offset = (options.page - 1) * options.limit;
  const { whereClause, values } = buildWhereClause(filters);

  const countStatement = database.prepare(`SELECT COUNT(*) AS total FROM profiles ${whereClause}`);
  const countResult = countStatement.get(...values) as { total: number };

  const dataStatement = database.prepare(`
    SELECT *
    FROM profiles
    ${whereClause}
    ORDER BY ${sortColumn} ${direction}, id ASC
    LIMIT ? OFFSET ?
  `);

  const data = dataStatement.all(...values, options.limit, offset) as ProfileRecord[];

  return {
    total: countResult.total,
    data,
  };
}

export function deleteProfile(id: string): void {
  const statement = database.prepare('DELETE FROM profiles WHERE id = ?');
  statement.run(id);
}

export function clearProfiles(): void {
  database.exec('DELETE FROM profiles');
}
