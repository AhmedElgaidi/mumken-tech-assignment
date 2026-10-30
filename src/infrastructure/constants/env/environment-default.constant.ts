import { EnvironmentTypeEnum } from "../../contracts/enums/env/environment-type.enum";

/** Environment the service assumes when `NODE_ENV` is unset. */
export const DEFAULT_NODE_ENV = EnvironmentTypeEnum.LOCAL;

/** HTTP port the API listens on. */
export const DEFAULT_PORT = 3000;
