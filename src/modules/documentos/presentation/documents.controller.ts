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
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../shared/domain/authorization/authenticated-user';
import { CurrentUser, RequirePermission } from '../../../shared/presentation/auth/auth.decorators';
import { listBody } from '../../../shared/presentation/listing/list-response';
import { DocumentsUseCases } from '../application/documents.use-cases';
import type { DocumentInput, DocumentRecord } from '../domain/document';
import { MAX_DOCUMENT_BYTES, type UploadedFile as DocumentFile } from '../domain/document-file';
import { contentDisposition } from './content-disposition';
import { DocumentBodyDto, DocumentQueryDto } from './dto/document.dto';

/** The part of a multer file this controller reads (multer ships without typings here). */
interface MulterFile {
  readonly originalname: string;
  readonly buffer: Buffer;
}

const FILE_FIELD = 'file';

/** Memory storage; multer answers 413 past the limit, before the use case runs. */
const fileUpload = FileInterceptor(FILE_FIELD, {
  limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1, fields: 20 },
  defParamCharset: 'utf8',
});

const fields = (body: DocumentBodyDto): DocumentInput => ({
  name: body.name,
  category: body.category,
  linkedResource: body.linkedResource,
  linkedId: body.linkedId,
});

const toDocumentFile = (file: MulterFile | undefined): DocumentFile | undefined =>
  file === undefined ? undefined : { originalName: file.originalname, bytes: file.buffer };

@ApiTags('documentos')
@ApiBearerAuth()
@Controller('documentos')
export class DocumentsController {
  constructor(private readonly documents: DocumentsUseCases) {}

  @Get()
  @RequirePermission('documentos', 'read')
  @ApiOperation({ summary: 'Lista de documentos (sin contenido)' })
  async list(
    @Query() query: DocumentQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<readonly DocumentRecord[]> {
    return listBody(res, await this.documents.list(query));
  }

  @Get(':id')
  @RequirePermission('documentos', 'read')
  @ApiOperation({ summary: 'Un documento (sin contenido)' })
  get(@Param('id') id: string): Promise<DocumentRecord> {
    return this.documents.get(id);
  }

  @Get(':id/file')
  @RequirePermission('documentos', 'read')
  @ApiOperation({ summary: 'Descarga el archivo; solo PDF, imágenes y TXT se muestran en línea' })
  async download(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.documents.download(id);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(file.bytes, {
      type: file.mimeType,
      length: file.bytes.length,
      disposition: contentDisposition(file.fileName, file.inline),
    });
  }

  @Post()
  @RequirePermission('documentos', 'write')
  @UseInterceptors(fileUpload)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Sube un documento (multipart: campo `file` y los datos del formulario)',
  })
  create(
    @Body() body: DocumentBodyDto,
    @UploadedFile() file: MulterFile | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DocumentRecord> {
    return this.documents.create(fields(body), toDocumentFile(file), user);
  }

  @Patch(':id')
  @RequirePermission('documentos', 'write')
  @UseInterceptors(fileUpload)
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({ summary: 'Edita un documento; el archivo se reemplaza solo si llega `file`' })
  update(
    @Param('id') id: string,
    @Body() body: DocumentBodyDto,
    @UploadedFile() file: MulterFile | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DocumentRecord> {
    return this.documents.update(id, fields(body), toDocumentFile(file), user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('documentos', 'write')
  @ApiOperation({ summary: 'Elimina un documento y su archivo' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.documents.remove(id, user);
  }
}
