import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { StrKey } from '@stellar/stellar-sdk';
import { isAddress } from 'ethers';

@ValidatorConstraint({ name: 'isValidAddress', async: false })
export class IsValidAddressConstraint implements ValidatorConstraintInterface {
  validate(address: string, args: ValidationArguments) {
    const [network] = args.constraints as string[];

    console.log(network);

    if (network === 'stellar') {
      return (
        typeof address === 'string' && StrKey.isValidEd25519PublicKey(address)
      );
    } else if (network === 'evm') {
      return typeof address === 'string' && isAddress(address);
    }

    return false;
  }

  defaultMessage(args: ValidationArguments) {
    const [network] = args.constraints as string[];
    return `The address is not a valid ${network} address`;
  }
}

export function IsValidAddress(
  network: 'stellar' | 'evm',
  validationOptions?: ValidationOptions
) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [network],
      validator: IsValidAddressConstraint,
    });
  };
}
