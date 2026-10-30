import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { HealthService } from "./services/health.service";
import { RedisHealthService } from "./services/redis-health.service";
import { HealthController } from "./controllers/health.controller";

/**
 * Liveness and readiness probes. Readiness needs the database and reports Redis without
 * requiring it; the queue producer comes from the global `QueueProducerModule`.
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [HealthService, RedisHealthService],
  exports: [TerminusModule, HealthService, RedisHealthService],
})
export class HealthModule {}
