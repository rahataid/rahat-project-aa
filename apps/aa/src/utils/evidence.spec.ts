import { getInfoMedia, toMediaItems } from './evidence';

describe('evidence', () => {
  it('wraps legacy string + fileName', () => {
    expect(toMediaItems('u', 'f.png')).toEqual([{ mediaUrl: 'u', filename: 'f.png' }]);
  });
  it('passes arrays through, dropping empty urls', () => {
    expect(toMediaItems([{ mediaUrl: 'a', filename: 'x' }, { mediaUrl: ' ' }])).toEqual([
      { mediaUrl: 'a', filename: 'x' },
    ]);
  });
  it('reads legacy stored info', () => {
    expect(getInfoMedia({ mediaUrl: 'u', fileName: 'f' })).toEqual([{ mediaUrl: 'u', filename: 'f' }]);
    expect(getInfoMedia(null)).toEqual([]);
  });
});
