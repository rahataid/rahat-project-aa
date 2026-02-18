import { RpcException } from '@nestjs/microservices';
import { ValidationError } from 'class-validator';

// Custom exception factory for validation errors
export const validationExceptionFactory = (
  errors: ValidationError[]
): RpcException => {
  console.log('errors', errors);
  const formattedErrors = {
    message: 'Validation Error',
    errors: errors.map((error) => ({
      property: error.property,
      constraints: error.constraints,
      value: error.value,
    })),
  };

  return new RpcException({
    statusCode: 400,
    message: formattedErrors,
  });
};
