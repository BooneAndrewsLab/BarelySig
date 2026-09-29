/**
 * The dose-response models (item 37, #95). All are one curve,
 *   Y = Bottom + (Top − Bottom) / (1 + 10^((LogEC50 − X) × HillSlope)),
 * fitted by the one core; a model only says which parameters it holds and
 * what the potency is called. So a model's parameters are read off the
 * curve exactly as Prism reports them: an inhibitor curve is a falling
 * one (negative HillSlope), a standard slope is HillSlope = +1 (agonist)
 * or −1 (inhibitor), a normalized response is Bottom = 0 and Top = 100.
 */
import type {
  DoseResponseModelId,
  NonlinearRegressionOptions,
  ParameterConstraint,
} from '@/model/project';

export interface DoseResponseModel {
  readonly id: DoseResponseModelId;
  /** Prism's name for the model, as it appears in the Analyze dialog. */
  readonly label: string;
  /** What the dose giving a half-way response is called. */
  readonly potency: 'EC50' | 'IC50';
  readonly inhibitor: boolean;
  /** Parameters the model holds (null = estimated unless the user holds it). */
  readonly bottom: number | null;
  readonly top: number | null;
  readonly hillSlope: number | null;
}

function model(
  inhibitor: boolean,
  normalized: boolean,
  standard: boolean,
  label: string,
): DoseResponseModel {
  const kind = inhibitor ? 'inhibitor' : 'agonist';
  const id = `log-${kind}-${normalized ? 'normalized-' : ''}${standard ? 'standard' : 'variable'}-slope`;
  return {
    id: id as DoseResponseModelId,
    label,
    potency: inhibitor ? 'IC50' : 'EC50',
    inhibitor,
    bottom: normalized ? 0 : null,
    top: normalized ? 100 : null,
    hillSlope: standard ? (inhibitor ? -1 : 1) : null,
  };
}

/** In the order the Analyze dialog lists them. */
export const DOSE_RESPONSE_MODELS: readonly DoseResponseModel[] = [
  model(false, false, false, 'log(agonist) vs. response — variable slope (four parameters)'),
  model(false, false, true, 'log(agonist) vs. response (three parameters, HillSlope = 1)'),
  model(false, true, false, 'log(agonist) vs. normalized response — variable slope'),
  model(false, true, true, 'log(agonist) vs. normalized response (HillSlope = 1)'),
  model(true, false, false, 'log(inhibitor) vs. response — variable slope (four parameters)'),
  model(true, false, true, 'log(inhibitor) vs. response (three parameters, HillSlope = −1)'),
  model(true, true, false, 'log(inhibitor) vs. normalized response — variable slope'),
  model(true, true, true, 'log(inhibitor) vs. normalized response (HillSlope = −1)'),
];

export function doseResponseModel(id: DoseResponseModelId): DoseResponseModel {
  const m = DOSE_RESPONSE_MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`unknown dose-response model ${id}`);
  return m;
}

type Held = 'bottom' | 'top' | 'hillSlope';

/**
 * The constraints the fit really uses: a parameter the model holds is fixed
 * at its value whatever was chosen for it, the rest are the user's.
 */
export function effectiveConstraints(
  o: Pick<NonlinearRegressionOptions, 'model' | Held>,
): Record<Held, ParameterConstraint> {
  const m = doseResponseModel(o.model);
  const of = (k: Held): ParameterConstraint => {
    const v = m[k];
    return v === null ? o[k] : { kind: 'fixed', value: v };
  };
  return { bottom: of('bottom'), top: of('top'), hillSlope: of('hillSlope') };
}

/** Whether the model itself holds this parameter (so the dialog shows it as held, not editable). */
export function heldByModel(id: DoseResponseModelId, k: Held): number | null {
  return doseResponseModel(id)[k];
}
