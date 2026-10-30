import { randomUUID } from "node:crypto";
import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { API_KEY_HEADER } from "./constants/http/http-header.constant";
import { AppConfigService } from "./services/env/app-config.service";
import { HealthPathUtil } from "./utils/http/health-path.util";
import {
  REQUEST_ID_HEADER,
  REQUEST_ID_PATTERN,
  REQUEST_ID_RESPONSE_HEADER,
} from "./constants/logging/request-id.constant";
import { API_PREFIX } from "./constants/http/api-prefix.constant";

/** Structured JSON logs (Pino). Every HTTP log line carries `requestId`, echoed in `X-Request-Id`. */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.getLogLevel(),
          customAttributeKeys: { reqId: "requestId" },
          genReqId: (request, response) => {
            const incoming = request.headers[REQUEST_ID_HEADER];
            const id = typeof incoming === "string" && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
            response.setHeader(REQUEST_ID_RESPONSE_HEADER, id);
            return id;
          },
          autoLogging: {
            ignore: (request) => request.url !== undefined && HealthPathUtil.isHealthPath(request.url, API_PREFIX),
          },
          redact: [`req.headers["${API_KEY_HEADER}"]`, "req.headers.authorization"],
          transport: config.isPrettyLogging() ? { target: "pino-pretty", options: { singleLine: true } } : undefined,
        },
      }),
    }),
  ],
})
export class LoggingModule {}
