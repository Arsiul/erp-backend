import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../shared/domain/authorization/authenticated-user';
import { CurrentUser, RequirePermission } from '../../../shared/presentation/auth/auth.decorators';
import { listBody } from '../../../shared/presentation/listing/list-response';
import { BankAccountsUseCases } from '../application/bank-accounts.use-cases';
import type { BankAccountInput, BankAccountRecord } from '../domain/bank-account';
import { BankAccountBodyDto } from './dto/master-body.dto';
import { MasterQueryDto } from './dto/master-query.dto';

/** Only the editable fields reach the use case; derived ones sent by the form are dropped. */
const fields = (body: BankAccountBodyDto): BankAccountInput => ({
  bank: body.bank,
  name: body.name,
  accountNumber: body.accountNumber,
  openingBalance: body.openingBalance,
  status: body.status,
});

@ApiTags('maestros')
@ApiBearerAuth()
@Controller('cuentas-bancarias')
export class BankAccountsController {
  constructor(private readonly accounts: BankAccountsUseCases) {}

  @Get()
  @RequirePermission('cuentas-bancarias', 'read')
  @ApiOperation({ summary: 'Lista de cuentas bancarias' })
  async list(
    @Query() query: MasterQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<readonly BankAccountRecord[]> {
    return listBody(res, await this.accounts.list(query));
  }

  @Get(':id')
  @RequirePermission('cuentas-bancarias', 'read')
  @ApiOperation({ summary: 'Una cuenta' })
  get(@Param('id') id: string): Promise<BankAccountRecord> {
    return this.accounts.get(id);
  }

  @Post()
  @RequirePermission('cuentas-bancarias', 'write')
  @ApiOperation({ summary: 'Crea una cuenta bancaria; el saldo parte del saldo inicial' })
  create(
    @Body() body: BankAccountBodyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BankAccountRecord> {
    return this.accounts.create(fields(body), user);
  }

  @Patch(':id')
  @RequirePermission('cuentas-bancarias', 'write')
  @ApiOperation({ summary: 'Edita una cuenta (merge con el registro actual)' })
  update(
    @Param('id') id: string,
    @Body() body: BankAccountBodyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BankAccountRecord> {
    return this.accounts.update(id, fields(body), user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('cuentas-bancarias', 'write')
  @ApiOperation({ summary: 'Elimina una cuenta sin movimientos' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.accounts.remove(id, user);
  }

  @Post(':id/:action')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('cuentas-bancarias', 'write')
  @ApiOperation({ summary: 'Acción sobre la cuenta (activate, deactivate)' })
  runAction(
    @Param('id') id: string,
    @Param('action') action: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BankAccountRecord> {
    return this.accounts.runAction(id, action, user);
  }
}
