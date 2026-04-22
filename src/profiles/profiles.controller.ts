import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnprocessableEntityException,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ProfilesService } from './profiles.service';
import { parseNaturalLanguageQuery } from './profiles-search.parser';
import type { ProfilesQueryInput, ValidatedProfileQuery } from './profiles.types';
import type { ProfileQueryFilters } from '../database/sqlite';

const ALLOWED_QUERY_KEYS = new Set([
  'gender',
  'age_group',
  'country_id',
  'min_age',
  'max_age',
  'min_gender_probability',
  'min_country_probability',
  'sort_by',
  'order',
  'page',
  'limit',
]);

@Controller('api/profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Post()
  async create(@Body() body: { name: string }, @Res({ passthrough: true }) response: Response) {
    if (!body || !Object.prototype.hasOwnProperty.call(body, 'name')) {
      throw new BadRequestException('Missing or empty name');
    }

    const { name } = body;

    if (name === null || name === undefined || name === '') {
      throw new BadRequestException('Missing or empty name');
    }

    if (typeof name !== 'string') {
      throw new UnprocessableEntityException('Invalid type');
    }

    if (name.trim() === '') {
      throw new BadRequestException('Missing or empty name');
    }

    const result = await this.profilesService.createProfile(name);

    if (result.isExisting) {
      response.status(HttpStatus.OK);
      return {
        status: 'success',
        message: 'Profile already exists',
        data: result.profile,
      };
    }

    response.status(HttpStatus.CREATED);
    return {
      status: 'success',
      data: result.profile,
    };
  }

  @Get('search')
  async search(@Query('q') q: string | undefined, @Query() query: ProfilesQueryInput) {
    if (q === undefined || q === null || q.trim() === '') {
      throw new BadRequestException('Missing or empty parameter');
    }

    const parsedFilters = parseNaturalLanguageQuery(q);
    if (!parsedFilters) {
      throw new BadRequestException('Unable to interpret query');
    }

    const { q: _ignored, ...rest } = query;
    const validated = this.validateQuery(rest);
    const result = await this.profilesService.findAll({
      filters: this.mergeFilters(validated.filters, parsedFilters),
      options: validated.options,
    });

    return {
      status: 'success',
      page: validated.options.page,
      limit: validated.options.limit,
      total: result.total,
      data: result.data,
    };
  }

  @Get()
  async findAll(@Query() query: ProfilesQueryInput) {
    const validated = this.validateQuery(query);
    const result = await this.profilesService.findAll(validated);

    return {
      status: 'success',
      page: validated.options.page,
      limit: validated.options.limit,
      total: result.total,
      data: result.data,
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const profile = await this.profilesService.findOne(id);
    return {
      status: 'success',
      data: profile,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.profilesService.remove(id);
  }

  private validateQuery(query: ProfilesQueryInput): ValidatedProfileQuery {
    for (const key of Object.keys(query)) {
      if (!ALLOWED_QUERY_KEYS.has(key)) {
        throw new UnprocessableEntityException('Invalid query parameters');
      }
    }

    const filters: ValidatedProfileQuery['filters'] = {};

    if (query.gender !== undefined) {
      if (query.gender.trim() === '') {
        throw new BadRequestException('Missing or empty parameter');
      }
      const gender = query.gender.toLowerCase();
      if (gender !== 'male' && gender !== 'female') {
        throw new UnprocessableEntityException('Invalid query parameters');
      }
      filters.gender = gender;
    }

    if (query.age_group !== undefined) {
      if (query.age_group.trim() === '') {
        throw new BadRequestException('Missing or empty parameter');
      }
      const ageGroup = query.age_group.toLowerCase();
      if (!['child', 'teenager', 'adult', 'senior'].includes(ageGroup)) {
        throw new UnprocessableEntityException('Invalid query parameters');
      }
      filters.age_group = ageGroup as 'child' | 'teenager' | 'adult' | 'senior';
    }

    if (query.country_id !== undefined) {
      if (query.country_id.trim() === '') {
        throw new BadRequestException('Missing or empty parameter');
      }
      if (!/^[a-zA-Z]{2}$/.test(query.country_id)) {
        throw new UnprocessableEntityException('Invalid query parameters');
      }
      filters.country_id = query.country_id.toUpperCase();
    }

    const minAge = this.parseInteger(query.min_age);
    const maxAge = this.parseInteger(query.max_age);
    const minGenderProbability = this.parseProbability(query.min_gender_probability);
    const minCountryProbability = this.parseProbability(query.min_country_probability);

    if (minAge !== undefined) {
      filters.min_age = minAge;
    }

    if (maxAge !== undefined) {
      filters.max_age = maxAge;
    }

    if (minAge !== undefined && maxAge !== undefined && minAge > maxAge) {
      throw new UnprocessableEntityException('Invalid query parameters');
    }

    if (minGenderProbability !== undefined) {
      filters.min_gender_probability = minGenderProbability;
    }

    if (minCountryProbability !== undefined) {
      filters.min_country_probability = minCountryProbability;
    }

    const sort_by = this.parseSortBy(query.sort_by);
    const order = this.parseOrder(query.order);
    const page = this.parsePositiveInteger(query.page, 1, Number.MAX_SAFE_INTEGER);
    const limit = this.parsePositiveInteger(query.limit, 10, 50);

    return {
      filters,
      options: {
        sort_by,
        order,
        page,
        limit,
      },
    };
  }

  private parseInteger(value: string | undefined): number | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value.trim() === '') {
      throw new BadRequestException('Missing or empty parameter');
    }
    if (!/^\d+$/.test(value)) {
      throw new UnprocessableEntityException('Invalid query parameters');
    }
    return Number.parseInt(value, 10);
  }

  private parseProbability(value: string | undefined): number | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value.trim() === '') {
      throw new BadRequestException('Missing or empty parameter');
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      throw new UnprocessableEntityException('Invalid query parameters');
    }
    return parsed;
  }

  private parseSortBy(value: string | undefined): 'age' | 'created_at' | 'gender_probability' {
    if (value === undefined) {
      return 'created_at';
    }
    if (value.trim() === '') {
      throw new BadRequestException('Missing or empty parameter');
    }
    if (!['age', 'created_at', 'gender_probability'].includes(value)) {
      throw new UnprocessableEntityException('Invalid query parameters');
    }
    return value as 'age' | 'created_at' | 'gender_probability';
  }

  private parseOrder(value: string | undefined): 'asc' | 'desc' {
    if (value === undefined) {
      return 'asc';
    }
    if (value.trim() === '') {
      throw new BadRequestException('Missing or empty parameter');
    }
    const normalized = value.toLowerCase();
    if (normalized !== 'asc' && normalized !== 'desc') {
      throw new UnprocessableEntityException('Invalid query parameters');
    }
    return normalized;
  }

  private parsePositiveInteger(
    value: string | undefined,
    defaultValue: number,
    maxValue: number,
  ): number {
    if (value === undefined) {
      return defaultValue;
    }
    if (value.trim() === '') {
      throw new BadRequestException('Missing or empty parameter');
    }
    if (!/^\d+$/.test(value)) {
      throw new UnprocessableEntityException('Invalid query parameters');
    }

    const parsed = Number.parseInt(value, 10);
    if (parsed < 1 || parsed > maxValue) {
      throw new UnprocessableEntityException('Invalid query parameters');
    }
    return parsed;
  }

  private mergeFilters(base: ProfileQueryFilters, parsed: ProfileQueryFilters): ProfileQueryFilters {
    const merged: ProfileQueryFilters = { ...base };

    if (parsed.gender) {
      if (merged.gender && merged.gender !== parsed.gender) {
        throw new UnprocessableEntityException('Invalid query parameters');
      }
      merged.gender = parsed.gender;
    }

    if (parsed.age_group) {
      if (merged.age_group && merged.age_group !== parsed.age_group) {
        throw new UnprocessableEntityException('Invalid query parameters');
      }
      merged.age_group = parsed.age_group;
    }

    if (parsed.country_id) {
      if (merged.country_id && merged.country_id !== parsed.country_id) {
        throw new UnprocessableEntityException('Invalid query parameters');
      }
      merged.country_id = parsed.country_id;
    }

    if (parsed.min_age !== undefined) {
      merged.min_age =
        merged.min_age === undefined ? parsed.min_age : Math.max(merged.min_age, parsed.min_age);
    }

    if (parsed.max_age !== undefined) {
      merged.max_age =
        merged.max_age === undefined ? parsed.max_age : Math.min(merged.max_age, parsed.max_age);
    }

    if (merged.min_age !== undefined && merged.max_age !== undefined && merged.min_age > merged.max_age) {
      throw new UnprocessableEntityException('Invalid query parameters');
    }

    if (parsed.min_gender_probability !== undefined) {
      merged.min_gender_probability =
        merged.min_gender_probability === undefined
          ? parsed.min_gender_probability
          : Math.max(merged.min_gender_probability, parsed.min_gender_probability);
    }

    if (parsed.min_country_probability !== undefined) {
      merged.min_country_probability =
        merged.min_country_probability === undefined
          ? parsed.min_country_probability
          : Math.max(merged.min_country_probability, parsed.min_country_probability);
    }

    return merged;
  }
}
