import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios, { AxiosError, AxiosResponse } from 'axios';

interface SubgraphResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export async function querySubgraph<T = any>(
  subgraphUrl: string,
  payload: any
): Promise<T> {
  const logger = new Logger('SubgraphQuery');

  try {
    const response: AxiosResponse<SubgraphResponse<T>> = await axios.post(
      subgraphUrl,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.errors) {
      const errorMessage = response.data.errors
        .map((error) => error.message)
        .join('; ');
      logger.error(`Subgraph query error: ${errorMessage}`, {
        errors: response.data.errors,
      });
      throw new HttpException(
        `Subgraph error: ${errorMessage}`,
        HttpStatus.BAD_REQUEST
      );
    }

    if (!response.data.data) {
      logger.error('No data returned from subgraph');
      throw new HttpException(
        'No data returned from subgraph',
        HttpStatus.NOT_FOUND
      );
    }

    return response.data.data;
  } catch (error) {
    const axiosError = error as AxiosError;

    if (axiosError.response) {
      logger.error('Subgraph API error', {
        status: axiosError.response.status,
        statusText: axiosError.response.statusText,
        data: axiosError.response.data,
      });
      throw new HttpException(
        `Subgraph API error: ${axiosError.response.status} ${axiosError.response.statusText}`,
        axiosError.response.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }

    logger.error('Failed to query subgraph', {
      message: error.message,
      stack: error.stack,
    });
    throw new HttpException(
      `Failed to query subgraph: ${error.message}`,
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
}
