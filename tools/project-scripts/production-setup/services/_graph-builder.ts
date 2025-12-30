/**
 * Graph Builder Service
 * Handles graph codegen and build steps
 */
import { execSync } from 'child_process';
import { join } from 'path';
import { Logger } from './_logger';

export class GraphBuilderService {
  private workspaceRoot: string;
  private graphDir: string;

  constructor() {
    // Get workspace root (3 levels up from services directory)
    this.workspaceRoot = join(__dirname, '../../../..');
    this.graphDir = join(this.workspaceRoot, 'apps/graph');
  }

  /**
   * Generate graph code
   */
  async codegen(): Promise<void> {
    Logger.info('Generating graph code...');
    try {
      execSync('pnpm codegen', {
        cwd: this.graphDir,
        stdio: 'inherit',
      });
      Logger.success('Graph code generated');
    } catch (error: any) {
      Logger.error('Failed to generate graph code', error);
      throw new Error(`Graph codegen failed: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Build graph
   */
  async build(): Promise<void> {
    Logger.info('Building graph...');
    try {
      execSync('pnpm build', {
        cwd: this.graphDir,
        stdio: 'inherit',
      });
      Logger.success('Graph built');
    } catch (error: any) {
      Logger.error('Failed to build graph', error);
      throw new Error(`Graph build failed: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Run both codegen and build
   */
  async buildAll(): Promise<void> {
    await this.codegen();
    await this.build();
  }
}
