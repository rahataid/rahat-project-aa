import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

export class RawDistributedTransactionManager {
  private txId: string;
  private preparedDbs: Set<number> = new Set();

  constructor(private clients: PrismaClient[]) {
    const uuid = typeof randomUUID === 'function' ? randomUUID() : Math.random().toString(36).substring(2, 10);
    const timestamp = Date.now();
    this.txId = `tx_${timestamp}_${uuid}`;
    console.log(`Generated transaction ID: ${this.txId}`);
  }

  async beginAll() {
    console.log('Beginning all transactions');
    for (let i = 0; i < this.clients.length; i++) {
      await this.clients[i].$executeRawUnsafe('BEGIN;');
    }
  }

  async prepareAll() {
    for (let i = 0; i < this.clients.length; i++) {
      const dbTxId = `${this.txId}_db${i}`;

      try {
        await this.clients[i].$executeRawUnsafe(`PREPARE TRANSACTION '${dbTxId}';`);
        this.preparedDbs.add(i);
        console.log(`DB ${i + 1}: Transaction prepared with ID: ${dbTxId}`);
      } catch (error) {
        console.error(`Error preparing transaction for DB ${i+1}:`, error);
        throw error;
      }
    }
  }

  async commitAll() {
    for (let i = 0; i < this.clients.length; i++) {
      if (this.preparedDbs.has(i)) {
        const dbTxId = `${this.txId}_db${i}`;

        try {
          await this.clients[i].$executeRawUnsafe(`COMMIT PREPARED '${dbTxId}';`);
          this.preparedDbs.delete(i);
          console.log(`DB ${i + 1}: Transaction committed`);
        } catch (error) {
          console.error(`Error committing transaction for DB ${i+1}:`, error);
          throw error;
        }
      }
    }
  }

  async rollbackAll() {
    for (const dbIndex of this.preparedDbs) {
      const dbTxId = `${this.txId}_db${dbIndex}`;
      try {
        await this.clients[dbIndex].$executeRawUnsafe(`ROLLBACK PREPARED '${dbTxId}';`);
        console.log(`DB ${dbIndex + 1}: Prepared transaction rolled back`);
      } catch (preparedError) {
        console.error(
          `Error rolling back prepared transaction for DB ${dbIndex + 1}:`,
          preparedError
        );
        try {
          await this.clients[dbIndex].$executeRawUnsafe('ROLLBACK;');
          console.log(`DB ${dbIndex + 1}: Regular transaction rolled back`);
        } catch (regularError) {
          console.error(
            `Failed to rollback regular transaction for DB ${dbIndex + 1}:`,
            regularError
          );
        }
      }
    }
  }

  async queryRaw(dbIndex: number, query: Prisma.Sql) {
    console.log(`Querying DB ${dbIndex}`);
    return this.clients[dbIndex].$queryRaw(query);
  }

  async executeRaw(dbIndex: number, query: Prisma.Sql) {
    console.log(`Executing query on DB ${dbIndex}`);
    return this.clients[dbIndex].$executeRaw(query);
  }

  async cleanupOrphanedTransactions() {
    console.log("Checking for orphaned transactions...");
    for (let i = 0; i < this.clients.length; i++) {
      try {
        const result = await this.clients[i].$queryRawUnsafe(
          'SELECT gid FROM pg_prepared_xacts;'
        );

        if (Array.isArray(result) && result.length > 0) {
          console.log(`Found ${result.length} orphaned transactions in DB ${i+1}`);

          for (const row of result) {
            const gid = row.gid;
            console.log(`Rolling back orphaned transaction: ${gid}`);
            try {
              await this.clients[i].$executeRawUnsafe(`ROLLBACK PREPARED '${gid}';`);
              console.log(`Successfully rolled back transaction: ${gid}`);
            } catch (rollbackError) {
              console.error(`Failed to rollback transaction ${gid}:`, rollbackError);
            }
          }
        } else {
          console.log(`No orphaned transactions found in DB ${i+1}`);
        }
      } catch (error) {
        console.error(`Error checking for orphaned transactions in DB ${i+1}:`, error);
      }
    }
  }
}
