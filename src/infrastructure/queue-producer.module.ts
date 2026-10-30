import { Global, Module } from "@nestjs/common";
import { QueueProducerService } from "./services/queue/queue-producer.service";

/** Producer side of the queues: what the API (and the sweeper) need to add jobs. */
@Global()
@Module({
  providers: [QueueProducerService],
  exports: [QueueProducerService],
})
export class QueueProducerModule {}
