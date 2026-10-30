import { Global, Module } from "@nestjs/common";
import { DEFAULT_APP_SETTINGS } from "./constants/settings/app-settings.constant";
import { APP_SETTINGS } from "./constants/settings/app-settings.token";

/** Provides the tuning values under `APP_SETTINGS`, to every module. */
@Global()
@Module({
  providers: [{ provide: APP_SETTINGS, useValue: DEFAULT_APP_SETTINGS }],
  exports: [APP_SETTINGS],
})
export class SettingsModule {}
