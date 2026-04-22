import { findCountryCodeInText } from './country.util';
import type { ProfileQueryFilters } from '../database/sqlite';

const FILLER_PATTERN =
  /\b(people|person|profiles|profile|users|user|from|and|the|a|an|of|in|who|that|with)\b/g;

function normalizeQuery(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ');
}

export function parseNaturalLanguageQuery(query: string): ProfileQueryFilters | null {
  const normalized = normalizeQuery(query);
  if (!normalized) {
    return null;
  }

  const filters: ProfileQueryFilters = {};

  const hasMale = /\b(male|males|man|men|boy|boys)\b/.test(normalized);
  const hasFemale = /\b(female|females|woman|women|girl|girls)\b/.test(normalized);

  if (hasMale && !hasFemale) {
    filters.gender = 'male';
  } else if (hasFemale && !hasMale) {
    filters.gender = 'female';
  }

  if (/\byoung\b/.test(normalized)) {
    filters.min_age = 16;
    filters.max_age = 24;
  }

  const ageGroupPatterns: Array<{
    pattern: RegExp;
    value: 'child' | 'teenager' | 'adult' | 'senior';
  }> = [
    { pattern: /\b(child|children|kid|kids)\b/, value: 'child' },
    { pattern: /\b(teenager|teenagers|teen|teens)\b/, value: 'teenager' },
    { pattern: /\b(adult|adults)\b/, value: 'adult' },
    { pattern: /\b(senior|seniors|elderly)\b/, value: 'senior' },
  ];

  for (const entry of ageGroupPatterns) {
    if (entry.pattern.test(normalized)) {
      filters.age_group = entry.value;
      break;
    }
  }

  const betweenMatch = normalized.match(/\bbetween\s+(\d{1,3})\s+and\s+(\d{1,3})\b/);
  if (betweenMatch) {
    const first = Number.parseInt(betweenMatch[1], 10);
    const second = Number.parseInt(betweenMatch[2], 10);
    filters.min_age = Math.min(first, second);
    filters.max_age = Math.max(first, second);
  }

  const minAgeMatch = normalized.match(/\b(?:above|over|older than|at least)\s+(\d{1,3})\b/);
  if (minAgeMatch) {
    filters.min_age = Number.parseInt(minAgeMatch[1], 10);
  }

  const maxAgeMatch = normalized.match(/\b(?:below|under|younger than|at most)\s+(\d{1,3})\b/);
  if (maxAgeMatch) {
    filters.max_age = Number.parseInt(maxAgeMatch[1], 10);
  }

  const exactAgeMatch = normalized.match(/\bage(?:d)?\s+(\d{1,3})\b/);
  if (exactAgeMatch) {
    const age = Number.parseInt(exactAgeMatch[1], 10);
    filters.min_age = age;
    filters.max_age = age;
  }

  const countryCode = findCountryCodeInText(normalized);
  if (countryCode) {
    filters.country_id = countryCode;
  }

  const stripped = normalized.replace(FILLER_PATTERN, ' ').replace(/\s+/g, ' ').trim();
  const hasRecognizedMeaning = Object.keys(filters).length > 0;

  if (!hasRecognizedMeaning) {
    return null;
  }

  if (stripped && !/\b\d+\b/.test(stripped)) {
    const unresolved = stripped
      .replace(/\b(male|males|man|men|boy|boys|female|females|woman|women|girl|girls)\b/g, '')
      .replace(/\b(child|children|kid|kids|teenager|teenagers|teen|teens|adult|adults|senior|seniors|elderly|young)\b/g, '')
      .replace(/\b(above|over|older than|at least|below|under|younger than|at most|between)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (unresolved && !filters.country_id) {
      return null;
    }
  }

  return filters;
}
