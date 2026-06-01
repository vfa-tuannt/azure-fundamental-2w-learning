/* eslint-disable @typescript-eslint/no-require-imports */
// Application Insights MUST be initialised before any other import so
// the SDK can patch Node's `require` machinery and instrument http,
// console, exceptions, and downstream dependencies. Keep this block at
// the very top of the file — moving it below imports breaks
// instrumentation silently. Gated on the connection string so local
// dev (without APPLICATIONINSIGHTS_CONNECTION_STRING) still boots.
if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  const ai =
    require('applicationinsights') as typeof import('applicationinsights');
  ai.setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
    .setAutoCollectConsole(true, true)
    .setAutoCollectExceptions(true)
    .setAutoCollectRequests(true)
    .setAutoCollectDependencies(true)
    .setDistributedTracingMode(ai.DistributedTracingModes.AI_AND_W3C)
    .setSendLiveMetrics(false)
    .start();
  ai.defaultClient.context.tags[ai.defaultClient.context.keys.cloudRole] =
    'skillplatform-api';
}

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const isProd = process.env.NODE_ENV === 'production';
  app.enableCors({
    origin:
      process.env.CORS_ORIGIN ?? (isProd ? false : 'http://localhost:5173'),
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
