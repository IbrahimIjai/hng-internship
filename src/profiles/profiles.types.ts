import type { ProfileQueryFilters, ProfileQueryOptions } from '../database/sqlite';

export type ProfilesQueryInput = Record<string, string | undefined>;

export type ValidatedProfileQuery = {
  filters: ProfileQueryFilters;
  options: ProfileQueryOptions;
};
