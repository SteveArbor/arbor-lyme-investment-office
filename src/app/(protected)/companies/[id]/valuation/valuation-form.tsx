"use client";

import { useActionState } from "react";

import {
  errorTextClasses,
  inputClasses,
  labelClasses,
  primaryButtonClasses,
  successTextClasses,
} from "@/components/ui/form-styles";
import type { Valuation, ValuationScenario } from "@/domain/valuation";

import { type ActionFormState, updateValuationAction } from "./actions";

const initialState: ActionFormState = { error: null, success: false };

function ScenarioFields({
  prefix,
  label,
  scenario,
  disabled,
}: {
  prefix: string;
  label: string;
  scenario: ValuationScenario;
  disabled: boolean;
}) {
  return (
    <fieldset className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <legend className="px-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
        {label} (fair value: {scenario.fairValue.toFixed(2)})
      </legend>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor={`${prefix}.epsAssumption`} className={labelClasses}>
            EPS assumption
          </label>
          <input
            id={`${prefix}.epsAssumption`}
            name={`${prefix}.epsAssumption`}
            type="number"
            step="0.01"
            defaultValue={scenario.epsAssumption}
            disabled={disabled}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor={`${prefix}.growthRateAssumption`} className={labelClasses}>
            Growth rate
          </label>
          <input
            id={`${prefix}.growthRateAssumption`}
            name={`${prefix}.growthRateAssumption`}
            type="number"
            step="0.01"
            defaultValue={scenario.growthRateAssumption}
            disabled={disabled}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor={`${prefix}.terminalMultiple`} className={labelClasses}>
            Terminal multiple
          </label>
          <input
            id={`${prefix}.terminalMultiple`}
            name={`${prefix}.terminalMultiple`}
            type="number"
            step="0.1"
            defaultValue={scenario.terminalMultiple}
            disabled={disabled}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor={`${prefix}.discountRate`} className={labelClasses}>
            Discount rate
          </label>
          <input
            id={`${prefix}.discountRate`}
            name={`${prefix}.discountRate`}
            type="number"
            step="0.01"
            defaultValue={scenario.discountRate}
            disabled={disabled}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor={`${prefix}.probability`} className={labelClasses}>
            Probability
          </label>
          <input
            id={`${prefix}.probability`}
            name={`${prefix}.probability`}
            type="number"
            step="0.01"
            min="0"
            max="1"
            defaultValue={scenario.probability}
            disabled={disabled}
            className={inputClasses}
          />
        </div>
      </div>
    </fieldset>
  );
}

export function ValuationForm({
  companyId,
  valuation,
}: {
  companyId: string;
  valuation: Valuation;
}) {
  const boundAction = updateValuationAction.bind(null, companyId);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} noValidate className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="projectionYears" className={labelClasses}>
            Projection years
          </label>
          <input
            id="projectionYears"
            name="projectionYears"
            type="number"
            min="1"
            max="30"
            defaultValue={valuation.projectionYears}
            disabled={isPending}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor="requiredReturn" className={labelClasses}>
            Required return
          </label>
          <input
            id="requiredReturn"
            name="requiredReturn"
            type="number"
            step="0.01"
            defaultValue={valuation.requiredReturn}
            disabled={isPending}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor="marginOfSafety" className={labelClasses}>
            Required margin of safety
          </label>
          <input
            id="marginOfSafety"
            name="marginOfSafety"
            type="number"
            step="0.01"
            min="0"
            max="1"
            defaultValue={valuation.marginOfSafety}
            disabled={isPending}
            className={inputClasses}
          />
        </div>
      </div>

      <p className="text-xs text-neutral-500 dark:text-neutral-500">
        Scenario probabilities (bear + base + bull) must sum to 1.
      </p>

      <div className="space-y-4">
        <ScenarioFields prefix="bear" label="Bear" scenario={valuation.bear} disabled={isPending} />
        <ScenarioFields prefix="base" label="Base" scenario={valuation.base} disabled={isPending} />
        <ScenarioFields prefix="bull" label="Bull" scenario={valuation.bull} disabled={isPending} />
      </div>

      {state.error ? (
        <p role="alert" className={errorTextClasses}>
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className={successTextClasses}>
          Valuation saved. Previous version preserved in history.
        </p>
      ) : null}

      <button type="submit" disabled={isPending} className={primaryButtonClasses}>
        {isPending ? "Saving…" : "Save valuation"}
      </button>
    </form>
  );
}
