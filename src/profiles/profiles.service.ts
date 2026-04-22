import {
  Injectable,
  BadGatewayException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import axios from 'axios';
import {
  deleteProfile,
  findProfileById,
  findProfileByName,
  insertProfile,
  queryProfiles,
  type ProfileRecord,
  type ProfileQueryResult,
} from '../database/sqlite';
import { getCountryNameByCode } from './country.util';
import type { ValidatedProfileQuery } from './profiles.types';
import { createUuidV7 } from '../common/uuidv7';

@Injectable()
export class ProfilesService {
  async createProfile(name: string) {
    const normalizedName = name.trim().toLowerCase();

    const existingProfile = findProfileByName(normalizedName);
    if (existingProfile) {
      return {
        isExisting: true,
        profile: existingProfile,
      };
    }

    let genderizeResponse, agifyResponse, nationalizeResponse;
    try {
      const [genderize, agify, nationalize] = await Promise.all([
        axios.get(`https://api.genderize.io?name=${normalizedName}`, { timeout: 10000 }),
        axios.get(`https://api.agify.io?name=${normalizedName}`, { timeout: 10000 }),
        axios.get(`https://api.nationalize.io?name=${normalizedName}`, { timeout: 10000 }),
      ]);
      genderizeResponse = genderize.data;
      agifyResponse = agify.data;
      nationalizeResponse = nationalize.data;
    } catch (error: any) {
      const url = error?.config?.url || '';
      if (url.includes('genderize')) {
        throw new BadGatewayException('Genderize returned an invalid response');
      }
      if (url.includes('agify')) {
        throw new BadGatewayException('Agify returned an invalid response');
      }
      if (url.includes('nationalize')) {
        throw new BadGatewayException('Nationalize returned an invalid response');
      }
      throw new BadGatewayException('Downstream API failure');
    }

    if (!genderizeResponse || genderizeResponse.gender === null || genderizeResponse.count === 0) {
      throw new BadGatewayException('Genderize returned an invalid response');
    }

    if (!agifyResponse || agifyResponse.age === null) {
      throw new BadGatewayException('Agify returned an invalid response');
    }

    if (!nationalizeResponse || !nationalizeResponse.country || nationalizeResponse.country.length === 0) {
      throw new BadGatewayException('Nationalize returned an invalid response');
    }

    const { gender, probability: gender_probability } = genderizeResponse;
    const { age } = agifyResponse;

    const highestCountry = nationalizeResponse.country.reduce((prev: any, current: any) => {
      return prev.probability > current.probability ? prev : current;
    });

    const country_id = highestCountry.country_id;
    const country_probability = highestCountry.probability;

    let age_group: ProfileRecord['age_group'];
    if (age <= 12) {
      age_group = 'child';
    } else if (age <= 19) {
      age_group = 'teenager';
    } else if (age <= 59) {
      age_group = 'adult';
    } else {
      age_group = 'senior';
    }

    const newProfile: ProfileRecord = {
      id: createUuidV7(),
      name: normalizedName,
      gender,
      gender_probability,
      age,
      age_group,
      country_id,
      country_name: getCountryNameByCode(country_id),
      country_probability,
      created_at: new Date().toISOString(),
    };

    try {
      const inserted = insertProfile(newProfile);
      return {
        isExisting: false,
        profile: inserted,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        const duplicate = findProfileByName(normalizedName);
        if (duplicate) {
          return {
            isExisting: true,
            profile: duplicate,
          };
        }
      }

      throw new InternalServerErrorException('Internal server error');
    }
  }

  async findOne(id: string) {
    const profile = findProfileById(id);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return profile;
  }

  async findAll(query: ValidatedProfileQuery): Promise<ProfileQueryResult> {
    return queryProfiles(query.filters, query.options);
  }

  async remove(id: string) {
    const profile = await this.findOne(id);
    deleteProfile(profile.id);
  }
}
