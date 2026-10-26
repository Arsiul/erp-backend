import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { MAX_PASSWORD_LENGTH } from '../../../../shared/domain/authorization/password-policy';

const MAX_EMAIL_LENGTH = 254;

export class LoginDto {
  @ApiProperty({ example: 'admin@empresa.pe' })
  @IsString({ message: 'Escribe el correo.' })
  @MaxLength(MAX_EMAIL_LENGTH, { message: 'Correo o contraseña incorrectos.' })
  readonly email!: string;

  @ApiProperty()
  @IsString({ message: 'Escribe la contraseña.' })
  @MaxLength(MAX_PASSWORD_LENGTH, { message: 'Correo o contraseña incorrectos.' })
  readonly password!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString({ message: 'Escribe la contraseña actual.' })
  @MaxLength(MAX_PASSWORD_LENGTH, { message: 'La contraseña actual no es correcta.' })
  readonly currentPassword!: string;

  @ApiProperty({ minLength: 8, maxLength: MAX_PASSWORD_LENGTH })
  @IsString({ message: 'Escribe la nueva contraseña.' })
  readonly newPassword!: string;
}
