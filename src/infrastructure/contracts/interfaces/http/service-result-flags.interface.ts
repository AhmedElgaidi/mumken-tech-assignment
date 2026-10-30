/** What a service reports about a call besides its body; the response interceptor turns it into HTTP. */
export interface ServiceResultFlagsInterface {
  /** True when this call stored something new; the response becomes `201 Created`. */
  isCreated?: boolean;
  /** True when an earlier result was returned for a repeated request; the response carries `Idempotent-Replayed: true`. */
  isReplayed?: boolean;
}
