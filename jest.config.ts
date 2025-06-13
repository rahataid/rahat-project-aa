import { getJestProjectsAsync } from '@nx/jest';

export default async () => ({
  projects: await getJestProjectsAsync(),
  collectCoverage: true, // Enable coverage collection
  coverageReporters: ['lcov', 'text'], // Add 'lcov' for lcov.info and 'text' for console output
  coverageDirectory: './coverage', // Explicitly set the coverage output directory
});
