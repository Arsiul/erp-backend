import {
  Body,
  Controller,
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
import { MovementsUseCases } from '../application/movements.use-cases';
import type { MovementInput } from '../domain/movement-rules';
import type { MovementView } from '../domain/treasury';
import { MovementBodyDto, MovementQueryDto } from './dto/movement.dto';

const movementFields = (body: MovementBodyDto): MovementInput => ({
  date: body.date,
  accountId: body.accountId,
  type: body.type,
  concept: body.concept,
  receivableId: body.receivableId,
  payableId: body.payableId,
  counterparty: body.counterparty,
  reference: body.reference,
  method: body.method,
  amount: body.amount,
  notes: body.notes,
});

@ApiTags('tesoreria')
@ApiBearerAuth()
@Controller('movimientos')
export class MovementsController {
  constructor(private readonly movements: MovementsUseCases) {}

  @Get()
  @RequirePermission('movimientos', 'read')
  @ApiOperation({ summary: 'Movimientos de caja y bancos' })
  async list(
    @Query() query: MovementQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<readonly MovementView[]> {
    return listBody(res, await this.movements.list(query));
  }

  @Get(':id')
  @RequirePermission('movimientos', 'read')
  @ApiOperation({ summary: 'Un movimiento' })
  get(@Param('id') id: string): Promise<MovementView> {
    return this.movements.get(id);
  }

  @Post()
  @RequirePermission('movimientos', 'write')
  @ApiOperation({ summary: 'Registra un cobro, un pago u otro ingreso o egreso' })
  create(
    @Body() body: MovementBodyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MovementView> {
    return this.movements.create(movementFields(body), user);
  }

  @Patch(':id')
  @RequirePermission('movimientos', 'write')
  @ApiOperation({ summary: 'Edita las notas de un movimiento registrado' })
  update(
    @Param('id') id: string,
    @Body() body: MovementBodyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MovementView> {
    return this.movements.update(id, movementFields(body), user);
  }

  @Post(':id/:action')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('movimientos', 'write')
  @ApiOperation({ summary: 'Acción sobre el movimiento (void)' })
  runAction(
    @Param('id') id: string,
    @Param('action') action: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MovementView> {
    return this.movements.runAction(id, action, user);
  }
}
