import { Job } from 'bull';

/**
 * Utility function to check if the current job batch can proceed.
 *
 * @param {Job} job - The Bull job object.
 * @param {Logger} logger - Logger to log the messages.
 *
 * @returns {Promise<boolean>} - Returns true if the job can be processed, false if the queue is busy.
 */
export async function canProcessJob(
  job: Job,
  logger: any,
  conditionalPause?: boolean
): Promise<boolean> {
  const totalBatchesLength = job.data.totalBatches;
  const batchIndex = job.data.batchIndex;
  const batchProgressPercentage = ((batchIndex + 1) / totalBatchesLength) * 100;

  const progressBar = (index: number, total: number) => {
    const percentage = (index / total) * 100;
    const progress = Math.round((percentage / 100) * 20);
    const bar = '█'.repeat(progress) + '░'.repeat(20 - progress);
    return `[${bar}] ${percentage.toFixed(2)}%`;
  };

  // gather queue stats
  const [activeCount, waitingCount] = await Promise.all([
    job.queue.getActiveCount(),
    job.queue.getWaitingCount(),
  ]);

  // // Log queue and batch status
  // logger.log(
  //   `
  //   Queue Name - ${job.queue.name} - ${batchIndex + 1}

  //   Queue Status - Active: ${activeCount}, Waiting: ${waitingCount}

  //   Processing batch ${batchIndex + 1} of ${totalBatchesLength} ${progressBar(
  //     batchIndex + 1,
  //     totalBatchesLength
  //   )}`
  // );

  // dynamic thresholds from env (align default with processor concurrency)
  const maxConcurrency = parseInt(process.env.CONTRACT_CONCURRENCY || '1', 10);
  const maxWaiting = parseInt(process.env.QUEUE_MAX_WAITING || '0', 10);
  const retryDelay = parseInt(process.env.QUEUE_RETRY_DELAY_MS || '1000', 10);
  if (conditionalPause || activeCount > maxConcurrency || waitingCount > maxWaiting) {
    // logger.warn(
    //   `Queue busy (${job.queue.name}): active=${activeCount}, waiting=${waitingCount}. delaying batch ${batchIndex+1}/${totalBatchesLength} by ${retryDelay}ms`
    // );
    // re-schedule this job by re-adding to the queue with delay
    await job.queue.add(job.name, job.data, { delay: retryDelay, removeOnComplete: true, removeOnFail: true });
    return false;
  }

  // logger.debug(
  //   `Queue free (${job.queue.name}): active=${activeCount}, waiting=${waitingCount}. processing batch ${batchIndex+1}/${totalBatchesLength}`
  // );
  return true;
}