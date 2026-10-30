import { SERVICE_RESULT_BRAND } from "../../../constants/http/service-result.constant";
import { ServiceResultFlagsInterface } from "./service-result-flags.interface";

/** A service's answer when the HTTP status or headers depend on what happened, not only on the route. */
export interface ServiceResultInterface<TData> extends ServiceResultFlagsInterface {
  /** Brand that tells the response interceptor this is a service result. */
  [SERVICE_RESULT_BRAND]: true;
  /** The response body. */
  data: TData;
}
