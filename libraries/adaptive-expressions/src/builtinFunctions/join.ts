/**
 * @module adaptive-expressions
 */
/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Expression } from '../expression';
import { ExpressionEvaluator, ValueWithError } from '../expressionEvaluator';
import { ExpressionType } from '../expressionType';
import { FunctionUtils } from '../functionUtils';
import { MemoryInterface } from '../memory/memoryInterface';
import { Options } from '../options';
import { ReturnType } from '../returnType';

/**
 * Return a string that has all the items from an array, with each character separated by a delimiter.
 */
export class Join extends ExpressionEvaluator {
    /**
     * Initializes a new instance of the Join class.
     */
    public constructor() {
        super(ExpressionType.Join, Join.evaluator, ReturnType.String, Join.validator);
    }

    /**
     * @private
     */
    private static evaluator(expression: Expression, state: MemoryInterface, options: Options): ValueWithError {
        let value: unknown;
        const { args, error: childrenError } = FunctionUtils.evaluateChildren(expression, state, options);
        let error = childrenError;
        if (!error) {
            if (!Array.isArray(args[0])) {
                error = `${expression.children[0]} evaluates to ${args[0]} which is not a list.`;
            } else {
                const array = args[0] as unknown[];
                if (args.length === 2) {
                    value = array.join(args[1] as string);
                } else {
                    if (array.length < 3) {
                        value = array.join(args[2] as string);
                    } else {
                        const firstPart: string = array.slice(0, array.length - 1).join(args[1] as string);
                        value = firstPart.concat(args[2] as string, array[array.length - 1] as string);
                    }
                }
            }
        }

        return { value, error };
    }

    /**
     * @private
     */
    private static validator(expression: Expression): void {
        FunctionUtils.validateOrder(expression, [ReturnType.String], ReturnType.Array, ReturnType.String);
    }
}
