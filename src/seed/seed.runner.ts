import { Inject, Injectable, Logger } from '@nestjs/common';
import { UNIT_OF_WORK, type UnitOfWork } from '../shared/domain/ports/unit-of-work.port';
import { SEEDERS, type Seeder } from './seeder';

@Injectable()
export class SeedRunner {
  private readonly logger = new Logger(SeedRunner.name);

  constructor(
    @Inject(SEEDERS) private readonly seeders: readonly Seeder[],
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  async run(): Promise<void> {
    if (this.seeders.length === 0) {
      this.logger.log('No seeders registered.');
      return;
    }
    for (const seeder of this.seeders) {
      await this.uow.run(() => seeder.run());
      this.logger.log(`Seeder "${seeder.name}" applied.`);
    }
  }
}
