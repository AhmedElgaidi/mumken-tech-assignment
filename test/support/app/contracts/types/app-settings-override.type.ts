import { AppSettingsInterface } from "../../../../../src/infrastructure/contracts/interfaces/settings/app-settings.interface";

/** Settings a test replaces: any group, and inside it any value. */
export type AppSettingsOverrideType = {
  [TGroup in keyof AppSettingsInterface]?: Partial<AppSettingsInterface[TGroup]>;
};
