/**
 * @module adaptive-expressions
 */
/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ExpressionEvaluator, ValueWithError } from '../expressionEvaluator';
import { ExpressionType } from '../expressionType';
import { FunctionUtils } from '../functionUtils';
import { ReturnType } from '../returnType';
import { Expression } from '../expression';
import { Options } from '../options';
import { Extensions } from '../extensions';
import { MemoryInterface } from '../memory';

/**
 * Return a random integer from a specified range, which is inclusive only at the starting end.
 */
export class Rand extends ExpressionEvaluator {
    /**
     * Initializes a new instance of the [Rand](xref:adaptive-expressions.Rand) class.
     */
    public constructor() {
        super(ExpressionType.Rand, Rand.evaluator, ReturnType.Number, FunctionUtils.validateBinaryNumber);
    }

    private static evaluator(expression: Expression, state: MemoryInterface, options: Options): ValueWithError {
        let result: unknown;
        let minValue: unknown;
        let maxValue: unknown;
        let error: string;

        const [maybeMinValue, maybeMaxValue] = expression.children;

        ({ value: minValue, error } = maybeMinValue.tryEvaluate(state, options));
        if (error) {
            return { value: undefined, error };
        }
        if (!FunctionUtils.isInteger(minValue)) {
            return { value: undefined, error: `${minValue} is not an integer.` };
        }

        ({ value: maxValue, error } = maybeMaxValue.tryEvaluate(state, options));
        if (error) {
            return { value: undefined, error };
        }
        if (!FunctionUtils.isInteger(maxValue)) {
            return { value: undefined, error: `${maxValue} is not an integer.` };
        }

        if (minValue > maxValue) {
            error = `Min value ${minValue} cannot be greater than max value ${maxValue}.`;
        } else {
            result = Extensions.randomNext(state, minValue as number, maxValue as number);
        }

        return { value: result, error };
    }
}
