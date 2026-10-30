import {
  ClassifierInputInterface,
  ClassifierInterface,
  ClassifierResultInterface,
} from "../../../src/modules/classification/contracts/interfaces/worker/classifier.interface";
import { TimeoutUtil } from "../../../src/infrastructure/utils/timeout/timeout.util";
import { FakeBehaviourType } from "./contracts/types/fake-behaviour.type";
import {
  FAKE_CLASSIFIER_NAME,
  FAKE_DEFAULT_CATEGORY_CODE,
  FAKE_DEFAULT_CONFIDENCE,
} from "./constants/fake-classifier.constant";

/**
 * Scripted classifier with call counters. A behaviour is chosen by a substring of the title;
 * the default answers `legal` with confidence 0.95.
 */
export class FakeClassifierDriver implements ClassifierInterface {
  /** Driver name reported to the classification pipeline. */
  public readonly name = FAKE_CLASSIFIER_NAME;

  /** Every input the driver was asked to classify, in call order. */
  public readonly calls: ClassifierInputInterface[] = [];

  /** Artificial delay before each answer, in milliseconds; aborts with the signal. */
  public latencyMs = 0;

  /** Scripted behaviours; the most recently added match wins. */
  private readonly behaviours: Array<{ match: string; behave: FakeBehaviourType }> = [];

  /**
   * Script a behaviour for titles containing `match`.
   *
   * @param match - Substring of the title to react to.
   * @param behave - What to answer (or throw) for a matching input.
   * @returns This driver, for chaining.
   */
  public when(match: string, behave: FakeBehaviourType): this {
    this.behaviours.unshift({ match, behave });
    return this;
  }

  /**
   * Count the classify calls whose title contains `titlePart`.
   *
   * @param titlePart - Substring of the title.
   * @returns The number of matching calls.
   */
  public callsFor(titlePart: string): number {
    return this.calls.filter((call) => call.title.includes(titlePart)).length;
  }

  /**
   * Forget all calls and scripted behaviours and drop the latency.
   *
   * Steps:
   * 1. Forget the recorded calls.
   * 2. Forget the scripted behaviours.
   * 3. Drop the latency.
   */
  public reset(): void {
    // 1. Forget the recorded calls.
    this.calls.length = 0;

    // 2. Forget the scripted behaviours.
    this.behaviours.length = 0;

    // 3. Drop the latency.
    this.latencyMs = 0;
  }

  /**
   * Answer with the first matching scripted behaviour, or the default category.
   *
   * Steps:
   * 1. Record the call.
   * 2. Wait for the artificial latency.
   * 3. Find the first matching behaviour.
   * 4. Return its result or the default one.
   *
   * @param input - The record to classify.
   * @param signal - Aborts the artificial latency.
   * @returns The scripted or default result.
   */
  public async classify(input: ClassifierInputInterface, signal: AbortSignal): Promise<ClassifierResultInterface> {
    // 1. Record the call.
    this.calls.push(input);

    // 2. Wait for the artificial latency.
    if (this.latencyMs > 0) {
      await TimeoutUtil.delay(this.latencyMs, signal);
    }

    // 3. Find the first matching behaviour.
    const behaviour = this.behaviours.find((candidate) => input.title.includes(candidate.match));

    // 4. Return its result or the default one.
    return behaviour
      ? behaviour.behave(input)
      : { categoryCode: FAKE_DEFAULT_CATEGORY_CODE, confidence: FAKE_DEFAULT_CONFIDENCE };
  }
}
