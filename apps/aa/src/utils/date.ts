import { intervalToDuration } from 'date-fns';

export const getFormattedTimeDiff = (differenceInMs: number) => {
  const duration = intervalToDuration({
    start: 0,
    end: differenceInMs,
  });

  const { hours = 0, minutes = 0, seconds = 0 } = duration;

  return `${hours} hrs ${minutes} min ${seconds} sec`;
};
