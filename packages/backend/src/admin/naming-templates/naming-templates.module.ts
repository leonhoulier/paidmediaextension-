import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { NamingTemplatesController } from './naming-templates.controller';
import { NamingTemplatesService } from './naming-templates.service';

@Module({
  imports: [AuthModule],
  controllers: [NamingTemplatesController],
  providers: [NamingTemplatesService],
  exports: [NamingTemplatesService],
})
export class NamingTemplatesModule {}
