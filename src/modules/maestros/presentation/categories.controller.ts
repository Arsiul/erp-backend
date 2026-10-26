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
import { CategoriesUseCases } from '../application/categories.use-cases';
import type { CategoryInput, CategoryRecord } from '../domain/category';
import { CategoryBodyDto } from './dto/master-body.dto';
import { MasterQueryDto } from './dto/master-query.dto';

/** Only the editable fields reach the use case; derived ones sent by the form are dropped. */
const fields = (body: CategoryBodyDto): CategoryInput => ({
  name: body.name,
  description: body.description,
  status: body.status,
});

@ApiTags('maestros')
@ApiBearerAuth()
@Controller('categorias')
export class CategoriesController {
  constructor(private readonly categories: CategoriesUseCases) {}

  @Get()
  @RequirePermission('categorias', 'read')
  @ApiOperation({ summary: 'Lista de categorías' })
  async list(
    @Query() query: MasterQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<readonly CategoryRecord[]> {
    return listBody(res, await this.categories.list(query));
  }

  @Get(':id')
  @RequirePermission('categorias', 'read')
  @ApiOperation({ summary: 'Una categoría' })
  get(@Param('id') id: string): Promise<CategoryRecord> {
    return this.categories.get(id);
  }

  @Post()
  @RequirePermission('categorias', 'write')
  @ApiOperation({ summary: 'Crea una categoría; el código CAT-001 lo asigna el servidor' })
  create(
    @Body() body: CategoryBodyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CategoryRecord> {
    return this.categories.create(fields(body), user);
  }

  @Patch(':id')
  @RequirePermission('categorias', 'write')
  @ApiOperation({ summary: 'Edita una categoría (merge con el registro actual)' })
  update(
    @Param('id') id: string,
    @Body() body: CategoryBodyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CategoryRecord> {
    return this.categories.update(id, fields(body), user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('categorias', 'write')
  @ApiOperation({ summary: 'Elimina una categoría sin productos' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.categories.remove(id, user);
  }

  @Post(':id/:action')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('categorias', 'write')
  @ApiOperation({ summary: 'Acción sobre la categoría (activate, deactivate)' })
  runAction(
    @Param('id') id: string,
    @Param('action') action: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CategoryRecord> {
    return this.categories.runAction(id, action, user);
  }
}
