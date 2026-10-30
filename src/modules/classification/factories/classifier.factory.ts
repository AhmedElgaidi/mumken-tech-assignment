import { MOCK_CLASSIFIER } from "../constants/mock-classifier/mock-classifier.constant";
import { ClassifierInterface } from "../contracts/interfaces/worker/classifier.interface";
import { MockClassifierDriver } from "../drivers/mock-classifier.driver";

/** Builds the classifier the worker uses: the mock today; a real provider would be chosen here. */
export class ClassifierFactory {
  /**
   * Builds the classifier the worker uses.
   *
   * @returns The mock classifier with its latency, failure rate and seed.
   */
  public static create(): ClassifierInterface {
    return new MockClassifierDriver({
      minLatencyMs: MOCK_CLASSIFIER.MIN_LATENCY_MS,
      maxLatencyMs: MOCK_CLASSIFIER.MAX_LATENCY_MS,
      failureRate: MOCK_CLASSIFIER.FAILURE_RATE,
      seed: MOCK_CLASSIFIER.SEED,
    });
  }
}
