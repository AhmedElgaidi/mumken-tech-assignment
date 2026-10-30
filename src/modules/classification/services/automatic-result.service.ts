import { Inject, Injectable } from "@nestjs/common";
import { AutomaticResultInterface } from "../../../infrastructure/contracts/interfaces/sql-db/classification/claimed-record.interface";
import { APP_SETTINGS } from "../../../infrastructure/constants/settings/app-settings.token";
import { AppSettingsInterface } from "../../../infrastructure/contracts/interfaces/settings/app-settings.interface";
import { CategoryService } from "../../category/services/category.service";
import { FALLBACK_CATEGORY_CODE } from "../constants/lifecycle/classification.constant";
import { CLASSIFIER } from "../constants/worker/classifier.token";
import { ClassifierInterface, ClassifierResultInterface } from "../contracts/interfaces/worker/classifier.interface";
import { PermanentClassificationException } from "../exceptions/permanent-classification.exception";

/** Turns what the classifier answered into the result stored for the record. */
@Injectable()
export class AutomaticResultService {
  public constructor(
    private readonly categoryService: CategoryService,
    @Inject(APP_SETTINGS) private readonly settings: AppSettingsInterface,
    @Inject(CLASSIFIER) private readonly classifier: ClassifierInterface,
  ) {}

  /**
   * Validates the classifier's answer; an unknown category goes to review as `other`.
   *
   * Steps:
   * 1. Reject a confidence that is not a number from 0 to 1.
   * 2. Send an unknown category to review as the fallback category.
   * 3. Return the known category with its review flag.
   *
   * @param classifierAnswer - What the classifier returned.
   * @returns The result to store for the record.
   * @throws PermanentClassificationException when the confidence is invalid.
   */
  public async build(classifierAnswer: ClassifierResultInterface): Promise<AutomaticResultInterface> {
    // 1. Reject a confidence that is not a number from 0 to 1.
    const { confidence, categoryCode } = classifierAnswer;
    const rawOutput = classifierAnswer.raw ?? classifierAnswer;
    if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new PermanentClassificationException(
        `classifier returned an invalid confidence: ${JSON.stringify(rawOutput)}`,
      );
    }

    // 2. Send an unknown category to review as the fallback category.
    const isKnownCategory =
      typeof categoryCode === "string" && (await this.categoryService.getCodes()).has(categoryCode);
    if (!isKnownCategory) {
      return {
        categoryCode: FALLBACK_CATEGORY_CODE,
        confidence: 0,
        isReviewNeeded: true,
        classifier: this.classifier.name,
        rawOutput: { unknownCategory: categoryCode, answer: rawOutput },
      };
    }

    // 3. Return the known category with its review flag.
    return {
      categoryCode,
      confidence,
      isReviewNeeded: confidence < this.settings.classification.reviewThreshold,
      classifier: this.classifier.name,
      rawOutput,
    };
  }
}
