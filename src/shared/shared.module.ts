import { Global, Module } from '@nestjs/common';
import { DATABASE_PROBE } from './application/health/database-probe.port';
import { CLOCK } from './domain/ports/clock.port';
import { ERROR_TRANSLATOR } from './domain/ports/error-translator.port';
import { ID_GENERATOR } from './domain/ports/id-generator.port';
import { PASSWORD_HASHER } from './domain/ports/password-hasher.port';
import { SEQUENCE_GENERATOR } from './domain/ports/sequence-generator.port';
import { UNIT_OF_WORK } from './domain/ports/unit-of-work.port';
import { PrismaDatabaseProbe } from './infrastructure/health/prisma-database-probe';
import { PrismaErrorTranslator } from './infrastructure/prisma/prisma-error-translator';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { Argon2PasswordHasher } from './infrastructure/security/argon2-password-hasher';
import { PrismaSequenceGenerator } from './infrastructure/sequence/prisma-sequence-generator';
import { SystemClock } from './infrastructure/system/system-clock';
import { UuidGenerator } from './infrastructure/system/uuid-generator';
import { PrismaUnitOfWork } from './infrastructure/unit-of-work/prisma-unit-of-work';

/** Cross-cutting adapters bound to their domain/application ports. */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    { provide: UNIT_OF_WORK, useClass: PrismaUnitOfWork },
    { provide: SEQUENCE_GENERATOR, useClass: PrismaSequenceGenerator },
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidGenerator },
    { provide: DATABASE_PROBE, useClass: PrismaDatabaseProbe },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: ERROR_TRANSLATOR, useClass: PrismaErrorTranslator },
  ],
  exports: [
    PrismaModule,
    UNIT_OF_WORK,
    SEQUENCE_GENERATOR,
    CLOCK,
    ID_GENERATOR,
    DATABASE_PROBE,
    PASSWORD_HASHER,
    ERROR_TRANSLATOR,
  ],
})
export class SharedModule {}
