import { SERVICE_RESULT_BRAND } from "../../constants/http/service-result.constant";
import { ServiceResultFlagsInterface } from "../../contracts/interfaces/http/service-result-flags.interface";
import { ServiceResultInterface } from "../../contracts/interfaces/http/service-result.interface";

/** Builds and recognises service results. */
export class ServiceResultUtil {
  /**
   * Wraps a body with what the call did.
   *
   * @param data - The response body.
   * @param flags - Whether the call created something or replayed an earlier result.
   * @returns The branded service result.
   */
  public static of<TData>(data: TData, flags: ServiceResultFlagsInterface = {}): ServiceResultInterface<TData> {
    return { [SERVICE_RESULT_BRAND]: true, data, ...flags };
  }

  /**
   * Tells a service result from a plain body.
   *
   * @param value - What a controller returned.
   * @returns `true` when the value was built by {@link ServiceResultUtil.of}.
   */
  public static isServiceResult(value: unknown): value is ServiceResultInterface<unknown> {
    return typeof value === "object" && value !== null && SERVICE_RESULT_BRAND in value;
  }
}
