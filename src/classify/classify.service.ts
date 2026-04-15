import {
  Injectable,
  HttpException,
  HttpStatus,
  BadGatewayException,
  InternalServerErrorException,
} from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class ClassifyService {
  async classifyName(name: string) {
    let apiResponse: any;

    try {
      const response = await axios.get('https://api.genderize.io', {
        params: { name },
        timeout: 10000,
      });
      apiResponse = response.data;
    } catch (error: any) {
      if (error.response) {
        throw new BadGatewayException('Upstream API failure');
      }
      throw new InternalServerErrorException('Failed to reach external API');
    }

    if (apiResponse.gender === null || apiResponse.count === 0) {
      throw new HttpException(
        'No prediction available for the provided name',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const gender: string = apiResponse.gender;
    const probability: number = apiResponse.probability;
    const sampleSize: number = apiResponse.count;
    const isConfident: boolean = probability >= 0.7 && sampleSize >= 100;
    const processedAt: string = new Date().toISOString();

    return {
      status: 'success',
      data: {
        name: apiResponse.name,
        gender,
        probability,
        sample_size: sampleSize,
        is_confident: isConfident,
        processed_at: processedAt,
      },
    };
  }
}
