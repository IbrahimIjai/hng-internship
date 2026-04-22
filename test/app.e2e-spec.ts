import { join } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createUuidV7 } from './../src/common/uuidv7';

describe('Profiles API (e2e)', () => {
  let app: INestApplication<App>;
  let dbPath: string;
  let clearProfiles: () => void;
  let upsertSeedProfiles: (profiles: any[]) => number;
  let AppModule: any;
  let HttpExceptionFilter: any;

  const seedProfiles = [
    {
      id: createUuidV7(),
      name: 'ada obi',
      gender: 'female',
      gender_probability: 0.98,
      age: 31,
      age_group: 'adult',
      country_id: 'NG',
      country_name: 'Nigeria',
      country_probability: 0.96,
      created_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: createUuidV7(),
      name: 'john kamau',
      gender: 'male',
      gender_probability: 0.93,
      age: 22,
      age_group: 'adult',
      country_id: 'KE',
      country_name: 'Kenya',
      country_probability: 0.91,
      created_at: '2026-01-02T00:00:00.000Z',
    },
    {
      id: createUuidV7(),
      name: 'musa bello',
      gender: 'male',
      gender_probability: 0.95,
      age: 18,
      age_group: 'teenager',
      country_id: 'NG',
      country_name: 'Nigeria',
      country_probability: 0.94,
      created_at: '2026-01-03T00:00:00.000Z',
    },
    {
      id: createUuidV7(),
      name: 'chioma egwu',
      gender: 'female',
      gender_probability: 0.88,
      age: 17,
      age_group: 'teenager',
      country_id: 'NG',
      country_name: 'Nigeria',
      country_probability: 0.9,
      created_at: '2026-01-04T00:00:00.000Z',
    },
    {
      id: createUuidV7(),
      name: 'sam okoro',
      gender: 'male',
      gender_probability: 0.86,
      age: 41,
      age_group: 'adult',
      country_id: 'NG',
      country_name: 'Nigeria',
      country_probability: 0.83,
      created_at: '2026-01-05T00:00:00.000Z',
    },
    {
      id: createUuidV7(),
      name: 'paulo joao',
      gender: 'male',
      gender_probability: 0.81,
      age: 65,
      age_group: 'senior',
      country_id: 'AO',
      country_name: 'Angola',
      country_probability: 0.79,
      created_at: '2026-01-06T00:00:00.000Z',
    },
  ];

  beforeAll(async () => {
    dbPath = join(process.cwd(), '.data', `profiles-test-${Date.now()}.sqlite`);
    process.env.PROFILES_DB_PATH = dbPath;
    jest.resetModules();

    ({ AppModule } = require('./../src/app.module'));
    ({ clearProfiles, upsertSeedProfiles } = require('./../src/database/sqlite'));
    ({ HttpExceptionFilter } = require('./../src/common/filters/http-exception.filter'));
  });

  beforeEach(async () => {
    clearProfiles();
    upsertSeedProfiles(seedProfiles);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  afterAll(() => {
    delete process.env.PROFILES_DB_PATH;
  });

  it('GET / returns hello world', () => {
    return request(app.getHttpServer()).get('/').expect(200).expect('Hello World!');
  });

  it('GET /api/profiles returns default pagination metadata', async () => {
    const response = await request(app.getHttpServer()).get('/api/profiles').expect(200);

    expect(response.body.status).toBe('success');
    expect(response.body.page).toBe(1);
    expect(response.body.limit).toBe(10);
    expect(response.body.total).toBe(6);
    expect(response.body.data).toHaveLength(6);
  });

  it('GET /api/profiles combines filters strictly', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/profiles?gender=male&country_id=NG&min_age=25&min_gender_probability=0.8')
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.data[0]).toMatchObject({
      name: 'sam okoro',
      gender: 'male',
      country_id: 'NG',
      age: 41,
    });
  });

  it('GET /api/profiles sorts and paginates results', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/profiles?sort_by=age&order=desc&page=2&limit=2')
      .expect(200);

    expect(response.body.page).toBe(2);
    expect(response.body.limit).toBe(2);
    expect(response.body.total).toBe(6);
    expect(response.body.data.map((profile: { age: number }) => profile.age)).toEqual([31, 22]);
  });

  it('GET /api/profiles/search parses natural language', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/profiles/search?q=young males from nigeria')
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.data[0]).toMatchObject({
      name: 'musa bello',
      gender: 'male',
      country_id: 'NG',
      age: 18,
    });
  });

  it('GET /api/profiles/search supports combined nl + query filters', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/profiles/search?q=female teenagers from nigeria&min_country_probability=0.9')
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.data[0].name).toBe('chioma egwu');
  });

  it('GET /api/profiles/search rejects uninterpretable text', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/profiles/search?q=blue moon data cluster')
      .expect(400);

    expect(response.body).toEqual({
      status: 'error',
      message: 'Unable to interpret query',
    });
  });

  it('GET /api/profiles rejects invalid query parameters', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/profiles?limit=100&sort_by=name')
      .expect(422);

    expect(response.body).toEqual({
      status: 'error',
      message: 'Invalid query parameters',
    });
  });
});
