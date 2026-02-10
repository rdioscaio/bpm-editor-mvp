import { Controller, Get } from '@nestjs/common';

@Controller('api/version')
export class VersionController {
  @Get()
  getVersion() {
    const commitSha =
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.GIT_COMMIT_SHA ||
      process.env.COMMIT_SHA ||
      'unknown';

    const branch =
      process.env.RAILWAY_GIT_BRANCH ||
      process.env.VERCEL_GIT_COMMIT_REF ||
      process.env.GIT_BRANCH ||
      'unknown';

    const deploymentId =
      process.env.RAILWAY_DEPLOYMENT_ID ||
      process.env.VERCEL_DEPLOYMENT_ID ||
      'unknown';

    return {
      service: process.env.RAILWAY_SERVICE_NAME || 'bpm-editor-mvp-api',
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '0.1.0',
      commitSha,
      branch,
      deploymentId,
      timestamp: new Date().toISOString(),
    };
  }
}
