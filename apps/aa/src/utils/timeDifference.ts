export const getTriggerAndActivityCompletionTimeDifference = (
  start: Date,
  end: Date
) => {
  const trigger = new Date(start);
  const completion = new Date(end);

  const isCompletedEarlier = completion < trigger;

  const msDifference = completion.getTime() - trigger.getTime();
  const absoluteMsDifference = Math.abs(msDifference);

  let differenceInSeconds = Math.floor(absoluteMsDifference / 1000);

  const days = Math.floor(differenceInSeconds / (24 * 3600));
  differenceInSeconds %= 24 * 3600;

  const hours = Math.floor(differenceInSeconds / 3600);
  differenceInSeconds %= 3600;

  const minutes = Math.floor(differenceInSeconds / 60);
  const seconds = differenceInSeconds % 60;

  const parts = [
    days ? `${days} day${days !== 1 ? 's' : ''}` : '',
    hours ? `${hours} hour${hours !== 1 ? 's' : ''}` : '',
    minutes ? `${minutes} minute${minutes !== 1 ? 's' : ''}` : '',
    seconds ? `${seconds} second${seconds !== 1 ? 's' : ''}` : '',
  ];

  const result = parts.filter(Boolean).join(' ');

  return isCompletedEarlier ? `-${result}` : result;
};
