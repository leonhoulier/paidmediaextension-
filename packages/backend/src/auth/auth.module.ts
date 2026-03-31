import { Module } from '@nestjs/common';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { ExtensionTokenGuard } from './extension-token.guard';
import { RolesGuard } from './roles.guard';

/**
 * Authentication module providing Firebase Auth and Extension Token guards
 */
@Module({
  providers: [FirebaseAuthGuard, ExtensionTokenGuard, RolesGuard],
  exports: [FirebaseAuthGuard, ExtensionTokenGuard, RolesGuard],
})
export class AuthModule {}
