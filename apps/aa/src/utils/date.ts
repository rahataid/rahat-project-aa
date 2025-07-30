import { intervalToDuration } from 'date-fns';

export const getFormattedGlofasDate = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // getMonth() returns 0-based month, hence add 1
  const day = String(date.getDate()).padStart(2, '0');

  const dateTimeString = `${year}-${month}-${day}T00:00:00`;
  const dateString = `${year}-${month}-${day}`;

  return { dateString, dateTimeString };
};

export const getFormattedTimeDiff = (differenceInMs: number) => {
  const duration = intervalToDuration({
    start: 0,
    end: differenceInMs,
  });

  const { hours = 0, minutes = 0, seconds = 0 } = duration;

  return `${hours} hrs ${minutes} min ${seconds} sec`;
};
