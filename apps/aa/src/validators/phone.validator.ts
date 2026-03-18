import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isValidPhone } from '../utils/validPhone';

@ValidatorConstraint({ name: 'IsValidPhone', async: false })
export class IsValidPhoneConstraint implements ValidatorConstraintInterface {
  validate(phone: string): boolean {
    // empty/null is handled by @IsOptional or @IsNotEmpty — skip validation here
    if (!phone || phone.trim() === '') return true;
    return isValidPhone(phone);
  }

  defaultMessage(): string {
    return 'Phone number is not valid. Please provide a valid international phone number.';
  }
}

export function IsValidPhone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidPhoneConstraint,
    });
  };
}
