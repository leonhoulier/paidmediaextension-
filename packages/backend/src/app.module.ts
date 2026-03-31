import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ExtensionModule } from './extension/extension.module';
import { AdminModule } from './admin/admin.module';
import { PubSubModule } from './pubsub/pubsub.module';
import { SlackModule } from './integrations/slack/slack.module';
import configuration from './config/configuration';

/**
 * Root application module
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env', '.env.example'],
    }),
    PrismaModule,
    AuthModule,
    ExtensionModule,
    AdminModule,
    PubSubModule,
    SlackModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
