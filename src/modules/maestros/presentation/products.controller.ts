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
import { ProductsUseCases } from '../application/products.use-cases';
import type { ProductInput, ProductRecord } from '../domain/product';
import { ProductBodyDto } from './dto/master-body.dto';
import { ProductQueryDto } from './dto/master-query.dto';

/** Only the editable fields reach the use case; derived ones sent by the form are dropped. */
const fields = (body: ProductBodyDto): ProductInput => ({
  sku: body.sku,
  name: body.name,
  categoryId: body.categoryId,
  unit: body.unit,
  salePrice: body.salePrice,
  costPrice: body.costPrice,
  minStock: body.minStock,
  status: body.status,
});

@ApiTags('maestros')
@ApiBearerAuth()
@Controller('productos')
export class ProductsController {
  constructor(private readonly products: ProductsUseCases) {}

  @Get()
  @RequirePermission('productos', 'read')
  @ApiOperation({ summary: 'Lista de productos' })
  async list(
    @Query() query: ProductQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<readonly ProductRecord[]> {
    return listBody(res, await this.products.list(query));
  }

  @Get(':id')
  @RequirePermission('productos', 'read')
  @ApiOperation({ summary: 'Un producto' })
  get(@Param('id') id: string): Promise<ProductRecord> {
    return this.products.get(id);
  }

  @Post()
  @RequirePermission('productos', 'write')
  @ApiOperation({ summary: 'Crea un producto con stock en cero en cada almacén activo' })
  create(
    @Body() body: ProductBodyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductRecord> {
    return this.products.create(fields(body), user);
  }

  @Patch(':id')
  @RequirePermission('productos', 'write')
  @ApiOperation({ summary: 'Edita un producto (merge con el registro actual)' })
  update(
    @Param('id') id: string,
    @Body() body: ProductBodyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductRecord> {
    return this.products.update(id, fields(body), user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('productos', 'write')
  @ApiOperation({ summary: 'Elimina un producto sin movimientos' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.products.remove(id, user);
  }

  @Post(':id/:action')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('productos', 'write')
  @ApiOperation({ summary: 'Acción sobre el producto (activate, deactivate)' })
  runAction(
    @Param('id') id: string,
    @Param('action') action: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductRecord> {
    return this.products.runAction(id, action, user);
  }
}
