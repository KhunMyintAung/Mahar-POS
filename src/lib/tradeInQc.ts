/** Trade-in QC: the grade a checked phone is given, and how its body looks. Shared by the QC
 *  form and the API, so both offer the same choices. */

export const QC_GRADES = ["A", "B", "C", "D"] as const;
export type QcGrade = (typeof QC_GRADES)[number];

export const QC_GRADE_TEXT: Record<QcGrade, string> = {
  A: "Like new, fully working",
  B: "Good, small signs of use",
  C: "Fair, clear wear or a minor fault",
  D: "Poor, heavy wear or faults",
};

export const BODY_CONDITIONS = ["Like new", "Light scratches", "Scratches and dents", "Cracked or damaged"] as const;
export type BodyCondition = (typeof BODY_CONDITIONS)[number];
