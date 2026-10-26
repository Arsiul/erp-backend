import { Injectable, NotFoundException, type PipeTransform } from '@nestjs/common';
import { isResourceKey, type ResourceKey } from '../../domain/authorization/resources';

/** Narrows a `:resource` path parameter to a ResourceKey; anything else answers 404. */
@Injectable()
export class ParseResourceKeyPipe implements PipeTransform<string, ResourceKey> {
  transform(value: string): ResourceKey {
    if (!isResourceKey(value)) {
      throw new NotFoundException();
    }
    return value;
  }
}
