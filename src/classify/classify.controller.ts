import {
  Controller,
  Get,
  Query,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ClassifyService } from './classify.service';

@Controller('api/classify')
export class ClassifyController {
  constructor(private readonly classifyService: ClassifyService) {}

  @Get()
  classify(@Query('name') name: any) {
    if (name === undefined || name === null || name === '') {
      throw new BadRequestException('Missing or empty name parameter');
    }

    if (typeof name !== 'string') {
      throw new UnprocessableEntityException('name must be a string');
    }

    return this.classifyService.classifyName(name);
  }
}
