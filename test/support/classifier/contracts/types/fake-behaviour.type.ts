import {
  ClassifierInputInterface,
  ClassifierResultInterface,
} from "../../../../../src/modules/classification/contracts/interfaces/worker/classifier.interface";

/** What a test scripts the fake classifier to do for one input: return a result, or throw to fail. */
export type FakeBehaviourType = (
  input: ClassifierInputInterface,
) => ClassifierResultInterface | Promise<ClassifierResultInterface>;
