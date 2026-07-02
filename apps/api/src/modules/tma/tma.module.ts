import { Module } from '@nestjs/common';
import { TmaController } from './tma.controller';

@Module({ controllers: [TmaController] })
export class TmaModule {}
