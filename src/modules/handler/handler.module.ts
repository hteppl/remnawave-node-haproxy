import { Module } from '@nestjs/common';

import { HandlerController } from './handler.controller';

@Module({ controllers: [HandlerController] })
export class HandlerModule {}
