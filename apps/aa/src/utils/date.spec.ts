import { getFormattedGlofasDate, getFormattedTimeDiff } from './date';
import { intervalToDuration } from 'date-fns';

// Mock date-fns
jest.mock('date-fns', () => ({
  intervalToDuration: jest.fn(),
}));

describe('Date Utilities', () => {
  describe('getFormattedGlofasDate', () => {
    const mockDate = new Date('2024-03-15T14:30:45.123Z');

    beforeEach(() => {
      // Mock the Date constructor to return a fixed date
      jest.useFakeTimers();
      jest.setSystemTime(mockDate);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return correctly formatted date strings', () => {
      const result = getFormattedGlofasDate();

      expect(result).toEqual({
        dateString: '2024-03-15',
        dateTimeString: '2024-03-15T00:00:00',
      });
    });

    it('should pad single digit months correctly', () => {
      // January (month 0)
      const januaryDate = new Date('2024-01-05T10:00:00.000Z');
      jest.setSystemTime(januaryDate);

      const result = getFormattedGlofasDate();

      expect(result.dateString).toBe('2024-01-05');
      expect(result.dateTimeString).toBe('2024-01-05T00:00:00');
    });

    it('should pad single digit days correctly', () => {
      // Day 3
      const singleDigitDay = new Date('2024-12-03T10:00:00.000Z');
      jest.setSystemTime(singleDigitDay);

      const result = getFormattedGlofasDate();

      expect(result.dateString).toBe('2024-12-03');
      expect(result.dateTimeString).toBe('2024-12-03T00:00:00');
    });

    it('should handle December (month 11) correctly', () => {
      // December (month 11)
      const decemberDate = new Date('2024-12-25T10:00:00.000Z');
      jest.setSystemTime(decemberDate);

      const result = getFormattedGlofasDate();

      expect(result.dateString).toBe('2024-12-25');
      expect(result.dateTimeString).toBe('2024-12-25T00:00:00');
    });

    it('should handle leap year dates correctly', () => {
      // February 29 in a leap year
      const leapYearDate = new Date('2024-02-29T10:00:00.000Z');
      jest.setSystemTime(leapYearDate);

      const result = getFormattedGlofasDate();

      expect(result.dateString).toBe('2024-02-29');
      expect(result.dateTimeString).toBe('2024-02-29T00:00:00');
    });

    it('should handle end of year date correctly', () => {
      // December 31 - use a time that doesn't cross date boundaries
      const endOfYear = new Date('2024-12-31T12:00:00.000Z');
      jest.setSystemTime(endOfYear);

      const result = getFormattedGlofasDate();

      expect(result.dateString).toBe('2024-12-31');
      expect(result.dateTimeString).toBe('2024-12-31T00:00:00');
    });

    it('should handle start of year date correctly', () => {
      // January 1
      const startOfYear = new Date('2024-01-01T00:00:00.000Z');
      jest.setSystemTime(startOfYear);

      const result = getFormattedGlofasDate();

      expect(result.dateString).toBe('2024-01-01');
      expect(result.dateTimeString).toBe('2024-01-01T00:00:00');
    });

    it('should always set time to 00:00:00 regardless of current time', () => {
      // Test with different times of day - use noon to avoid timezone issues
      const baseTimes = [
        '2024-06-15T12:00:00.000Z',
        '2024-06-15T12:30:45.123Z',
        '2024-06-15T12:59:59.999Z',
      ];

      baseTimes.forEach((time) => {
        jest.setSystemTime(new Date(time));
        const result = getFormattedGlofasDate();
        expect(result.dateTimeString).toBe('2024-06-15T00:00:00');
      });
    });

    it('should handle different years correctly', () => {
      const years = [2020, 2023, 2024, 2025, 2030];
      
      years.forEach((year) => {
        const date = new Date(`${year}-06-15T12:00:00.000Z`); // Use noon to avoid timezone issues
        jest.setSystemTime(date);
        
        const result = getFormattedGlofasDate();
        expect(result.dateString).toBe(`${year}-06-15`);
        expect(result.dateTimeString).toBe(`${year}-06-15T00:00:00`);
      });
    });
  });

  describe('getFormattedTimeDiff', () => {
    const mockIntervalToDuration = intervalToDuration as jest.MockedFunction<typeof intervalToDuration>;

    beforeEach(() => {
      mockIntervalToDuration.mockClear();
    });

    it('should format duration with hours, minutes, and seconds', () => {
      mockIntervalToDuration.mockReturnValue({
        hours: 2,
        minutes: 30,
        seconds: 45,
      });

      const result = getFormattedTimeDiff(9045000); // 2h 30m 45s in milliseconds

      expect(mockIntervalToDuration).toHaveBeenCalledWith({
        start: 0,
        end: 9045000,
      });
      expect(result).toBe('2 hrs 30 min 45 sec');
    });

    it('should handle zero duration', () => {
      mockIntervalToDuration.mockReturnValue({});

      const result = getFormattedTimeDiff(0);

      expect(mockIntervalToDuration).toHaveBeenCalledWith({
        start: 0,
        end: 0,
      });
      expect(result).toBe('0 hrs 0 min 0 sec');
    });

    it('should handle duration with only seconds', () => {
      mockIntervalToDuration.mockReturnValue({
        seconds: 15,
      });

      const result = getFormattedTimeDiff(15000);

      expect(result).toBe('0 hrs 0 min 15 sec');
    });

    it('should handle duration with only minutes', () => {
      mockIntervalToDuration.mockReturnValue({
        minutes: 5,
      });

      const result = getFormattedTimeDiff(300000);

      expect(result).toBe('0 hrs 5 min 0 sec');
    });

    it('should handle duration with only hours', () => {
      mockIntervalToDuration.mockReturnValue({
        hours: 3,
      });

      const result = getFormattedTimeDiff(10800000);

      expect(result).toBe('3 hrs 0 min 0 sec');
    });

    it('should handle large durations', () => {
      mockIntervalToDuration.mockReturnValue({
        hours: 24,
        minutes: 59,
        seconds: 59,
      });

      const result = getFormattedTimeDiff(89999000); // Nearly 25 hours

      expect(result).toBe('24 hrs 59 min 59 sec');
    });

    it('should handle partial duration objects', () => {
      mockIntervalToDuration.mockReturnValue({
        hours: 1,
        seconds: 30,
        // minutes is missing
      });

      const result = getFormattedTimeDiff(3630000);

      expect(result).toBe('1 hrs 0 min 30 sec');
    });

    it('should handle duration with undefined values', () => {
      mockIntervalToDuration.mockReturnValue({
        hours: undefined,
        minutes: undefined,
        seconds: undefined,
      });

      const result = getFormattedTimeDiff(1000);

      expect(result).toBe('0 hrs 0 min 0 sec');
    });

    it('should handle fractional milliseconds correctly', () => {
      mockIntervalToDuration.mockReturnValue({
        hours: 1,
        minutes: 30,
        seconds: 45,
      });

      const result = getFormattedTimeDiff(5445500.7); // With fractional part

      expect(mockIntervalToDuration).toHaveBeenCalledWith({
        start: 0,
        end: 5445500.7,
      });
      expect(result).toBe('1 hrs 30 min 45 sec');
    });

    it('should handle negative durations', () => {
      mockIntervalToDuration.mockReturnValue({
        hours: 0,
        minutes: 0,
        seconds: 0,
      });

      const result = getFormattedTimeDiff(-1000);

      expect(mockIntervalToDuration).toHaveBeenCalledWith({
        start: 0,
        end: -1000,
      });
      expect(result).toBe('0 hrs 0 min 0 sec');
    });

    it('should handle very small durations', () => {
      mockIntervalToDuration.mockReturnValue({
        seconds: 0,
      });

      const result = getFormattedTimeDiff(1); // 1 millisecond

      expect(result).toBe('0 hrs 0 min 0 sec');
    });

    it('should default missing duration properties to 0', () => {
      // Test various combinations of missing properties
      const testCases = [
        { returnValue: { hours: 2 }, expected: '2 hrs 0 min 0 sec' },
        { returnValue: { minutes: 15 }, expected: '0 hrs 15 min 0 sec' },
        { returnValue: { seconds: 30 }, expected: '0 hrs 0 min 30 sec' },
        { returnValue: { hours: 1, minutes: 5 }, expected: '1 hrs 5 min 0 sec' },
        { returnValue: { hours: 1, seconds: 30 }, expected: '1 hrs 0 min 30 sec' },
        { returnValue: { minutes: 10, seconds: 20 }, expected: '0 hrs 10 min 20 sec' },
      ];

      testCases.forEach(({ returnValue, expected }, index) => {
        mockIntervalToDuration.mockReturnValue(returnValue);
        const result = getFormattedTimeDiff(1000 * (index + 1));
        expect(result).toBe(expected);
      });
    });
  });
}); 