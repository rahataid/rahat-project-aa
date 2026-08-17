import { RpcException } from '@nestjs/microservices';
import { ValidationError } from 'class-validator';

// Custom exception factory for validation errors.
// `message` must stay a flat string — RpcException's `.message` getter
// returns whatever is passed as `error.message` verbatim, and the rest of
// this codebase (and the frontend's translation resolvers) assumes that's
// always a string. The first failing constraint's message is used as the
// translatable summary (it's bracket-prefixed with a stable code in the DTO
// decorators, e.g. "[TITLE_TOO_SHORT] Title must be..."); the full list of
// per-field errors still travels in `errors` for anything that wants detail.
export const validationExceptionFactory = (
  errors: ValidationError[]
): RpcException => {
  console.log('errors', errors);
  const flatMessages = errors.flatMap((error) =>
    Object.values(error.constraints || {})
  );
  const primaryMessage = flatMessages[0] || 'Validation Error';

  return new RpcException({
    statusCode: 400,
    message: primaryMessage,
    errors: errors.map((error) => ({
      property: error.property,
      constraints: error.constraints,
      value: error.value,
    })),
  });
};
