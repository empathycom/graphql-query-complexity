/**
 * Created by Ivo Meißner on 28.07.17.
 */
import { ValidationContext, FragmentDefinitionNode, OperationDefinitionNode, FieldNode, InlineFragmentNode, GraphQLField, GraphQLCompositeType, GraphQLSchema, DocumentNode, GraphQLDirective, GraphQLUnionType, GraphQLObjectType, GraphQLInterfaceType, GraphQLError } from 'graphql';
export declare type ComplexityEstimatorArgs = {
    type: GraphQLCompositeType;
    field: GraphQLField<any, any>;
    node: FieldNode;
    args: {
        [key: string]: any;
    };
    childComplexity: number;
    context?: Record<string, any>;
};
export declare type ComplexityEstimator = (options: ComplexityEstimatorArgs) => number | void;
export declare type Complexity = any;
export interface QueryComplexityOptions {
    maximumComplexity: number;
    variables?: Record<string, any>;
    operationName?: string;
    onComplete?: (complexity: number) => void;
    createError?: (max: number, actual: number) => GraphQLError;
    estimators: Array<ComplexityEstimator>;
    context?: Record<string, any>;
}
export declare function getComplexity(options: {
    estimators: ComplexityEstimator[];
    schema: GraphQLSchema;
    query: DocumentNode;
    variables?: Record<string, any>;
    operationName?: string;
    context?: Record<string, any>;
}): number;
export default class QueryComplexity {
    context: ValidationContext;
    complexity: number;
    options: QueryComplexityOptions;
    OperationDefinition: Record<string, any>;
    estimators: Array<ComplexityEstimator>;
    includeDirectiveDef: GraphQLDirective;
    skipDirectiveDef: GraphQLDirective;
    variableValues: Record<string, any>;
    requestContext?: Record<string, any>;
    constructor(context: ValidationContext, options: QueryComplexityOptions);
    onOperationDefinitionEnter(operation: OperationDefinitionNode): void;
    onOperationDefinitionLeave(operation: OperationDefinitionNode): GraphQLError | void;
    nodeComplexity(node: FieldNode | FragmentDefinitionNode | InlineFragmentNode | OperationDefinitionNode, typeDef: GraphQLObjectType | GraphQLInterfaceType | GraphQLUnionType | undefined): number;
    createError(): GraphQLError;
}
