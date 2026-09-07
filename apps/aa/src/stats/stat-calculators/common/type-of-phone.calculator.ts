import { countExtrasFieldValuesNormalized } from '../helpers';
import { StatCalcContext, StatCalculator } from '../types';

export const typeOfPhoneCalculator: StatCalculator = {
  key: 'TYPE_OF_PHONE',
  async run({ allExtras }: StatCalcContext) {
    const rData = countExtrasFieldValuesNormalized(
      allExtras,
      'type_of_phone_set',
      ['smartphone', 'keypad', 'both', 'brick']
    );

    const data: { id: string; count: number }[] = [];
    let keypadBrickCount = 0;

    for (const item of rData) {
      if (item.id === 'Keypad' || item.id === 'Brick') {
        keypadBrickCount += item.count;
      } else {
        data.push(item);
      }
    }
    data.push({ id: 'Keypad/Brick', count: keypadBrickCount });

    return { name: 'type_of_phone', data, group: 'beneficiary' };
  },
};
