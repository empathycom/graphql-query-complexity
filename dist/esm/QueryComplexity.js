/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-use-before-define */
/**
 * Created by Ivo Meißner on 28.07.17.
 */
import { getArgumentValues, getDirectiveValues, getVariableValues, } from 'graphql/execution/values.js';
import { ValidationContext, isCompositeType, TypeInfo, visit, visitWithTypeInfo, isAbstractType, GraphQLObjectType, GraphQLInterfaceType, Kind, getNamedType, GraphQLError, SchemaMetaFieldDef, TypeMetaFieldDef, TypeNameMetaFieldDef, } from 'graphql';
function queryComplexityMessage(max, actual) {
    return (`The query exceeds the maximum complexity of ${max}. ` +
        `Actual complexity is ${actual}`);
}
export function getComplexity(options) {
    const typeInfo = new TypeInfo(options.schema);
    const errors = [];
    const context = new ValidationContext(options.schema, options.query, typeInfo, (error) => errors.push(error));
    const visitor = new QueryComplexity(context, {
        // Maximum complexity does not matter since we're only interested in the calculated complexity.
        maximumComplexity: Infinity,
        estimators: options.estimators,
        variables: options.variables,
        operationName: options.operationName,
        context: options.context,
    });
    visit(options.query, visitWithTypeInfo(typeInfo, visitor));
    // Throw first error if any
    if (errors.length) {
        throw errors.pop();
    }
    return visitor.complexity;
}
export default class QueryComplexity {
    constructor(context, options) {
        if (!(typeof options.maximumComplexity === 'number' &&
            options.maximumComplexity > 0)) {
            throw new Error('Maximum query complexity must be a positive number');
        }
        this.context = context;
        this.complexity = 0;
        this.options = options;
        this.includeDirectiveDef = this.context.getSchema().getDirective('include');
        this.skipDirectiveDef = this.context.getSchema().getDirective('skip');
        this.estimators = options.estimators;
        this.variableValues = {};
        this.requestContext = options.context;
        this.OperationDefinition = {
            enter: this.onOperationDefinitionEnter,
            leave: this.onOperationDefinitionLeave,
        };
    }
    onOperationDefinitionEnter(operation) {
        var _a;
        if (typeof this.options.operationName === 'string' &&
            this.options.operationName !== operation.name.value) {
            return;
        }
        // Get variable values from variables that are passed from options, merged
        // with default values defined in the operation
        const { coerced, errors } = getVariableValues(this.context.getSchema(), 
        // We have to create a new array here because input argument is not readonly in graphql ~14.6.0
        operation.variableDefinitions ? [...operation.variableDefinitions] : [], (_a = this.options.variables) !== null && _a !== void 0 ? _a : {});
        if (errors && errors.length) {
            // We have input validation errors, report errors and abort
            errors.forEach((error) => this.context.reportError(error));
            return;
        }
        this.variableValues = coerced;
        switch (operation.operation) {
            case 'query':
                this.complexity += this.nodeComplexity(operation, this.context.getSchema().getQueryType());
                break;
            case 'mutation':
                this.complexity += this.nodeComplexity(operation, this.context.getSchema().getMutationType());
                break;
            case 'subscription':
                this.complexity += this.nodeComplexity(operation, this.context.getSchema().getSubscriptionType());
                break;
            default:
                throw new Error(`Query complexity could not be calculated for operation of type ${operation.operation}`);
        }
    }
    onOperationDefinitionLeave(operation) {
        if (typeof this.options.operationName === 'string' &&
            this.options.operationName !== operation.name.value) {
            return;
        }
        if (this.options.onComplete) {
            this.options.onComplete(this.complexity);
        }
        if (this.complexity > this.options.maximumComplexity) {
            return this.context.reportError(this.createError());
        }
    }
    nodeComplexity(node, typeDef) {
        if (node.selectionSet && typeDef) {
            let fields = {};
            if (typeDef instanceof GraphQLObjectType ||
                typeDef instanceof GraphQLInterfaceType) {
                fields = typeDef.getFields();
            }
            // Determine all possible types of the current node
            let possibleTypeNames;
            if (isAbstractType(typeDef)) {
                possibleTypeNames = this.context
                    .getSchema()
                    .getPossibleTypes(typeDef)
                    .map((t) => t.name);
            }
            else {
                possibleTypeNames = [typeDef.name];
            }
            // Collect complexities for all possible types individually
            const selectionSetComplexities = node.selectionSet.selections.reduce((complexities, childNode) => {
                var _a;
                // let nodeComplexity = 0;
                let innerComplexities = complexities;
                let includeNode = true;
                let skipNode = false;
                for (const directive of (_a = childNode.directives) !== null && _a !== void 0 ? _a : []) {
                    const directiveName = directive.name.value;
                    switch (directiveName) {
                        case 'include': {
                            const values = getDirectiveValues(this.includeDirectiveDef, childNode, this.variableValues || {});
                            if (typeof values.if === 'boolean') {
                                includeNode = values.if;
                            }
                            break;
                        }
                        case 'skip': {
                            const values = getDirectiveValues(this.skipDirectiveDef, childNode, this.variableValues || {});
                            if (typeof values.if === 'boolean') {
                                skipNode = values.if;
                            }
                            break;
                        }
                    }
                }
                if (!includeNode || skipNode) {
                    return complexities;
                }
                switch (childNode.kind) {
                    case Kind.FIELD: {
                        let field = null;
                        switch (childNode.name.value) {
                            case SchemaMetaFieldDef.name:
                                field = SchemaMetaFieldDef;
                                break;
                            case TypeMetaFieldDef.name:
                                field = TypeMetaFieldDef;
                                break;
                            case TypeNameMetaFieldDef.name:
                                field = TypeNameMetaFieldDef;
                                break;
                            default:
                                field = fields[childNode.name.value];
                                break;
                        }
                        // Invalid field, should be caught by other validation rules
                        if (!field) {
                            break;
                        }
                        const fieldType = getNamedType(field.type);
                        // Get arguments
                        let args;
                        try {
                            args = getArgumentValues(field, childNode, this.variableValues || {});
                        }
                        catch (e) {
                            this.context.reportError(e);
                            return complexities;
                        }
                        // Check if we have child complexity
                        let childComplexity = 0;
                        if (isCompositeType(fieldType)) {
                            childComplexity = this.nodeComplexity(childNode, fieldType);
                        }
                        // Run estimators one after another and return first valid complexity
                        // score
                        const estimatorArgs = {
                            childComplexity,
                            args,
                            field,
                            node: childNode,
                            type: typeDef,
                            context: this.requestContext,
                        };
                        const validScore = this.estimators.find((estimator) => {
                            const tmpComplexity = estimator(estimatorArgs);
                            if (typeof tmpComplexity === 'number' &&
                                !isNaN(tmpComplexity)) {
                                innerComplexities = addComplexities(tmpComplexity, complexities, possibleTypeNames);
                                return true;
                            }
                            return false;
                        });
                        if (!validScore) {
                            this.context.reportError(new GraphQLError(`No complexity could be calculated for field ${typeDef.name}.${field.name}. ` +
                                'At least one complexity estimator has to return a complexity score.'));
                            return complexities;
                        }
                        break;
                    }
                    case Kind.FRAGMENT_SPREAD: {
                        const fragment = this.context.getFragment(childNode.name.value);
                        // Unknown fragment, should be caught by other validation rules
                        if (!fragment) {
                            break;
                        }
                        const fragmentType = this.context
                            .getSchema()
                            .getType(fragment.typeCondition.name.value);
                        // Invalid fragment type, ignore. Should be caught by other validation rules
                        if (!isCompositeType(fragmentType)) {
                            break;
                        }
                        const nodeComplexity = this.nodeComplexity(fragment, fragmentType);
                        if (isAbstractType(fragmentType)) {
                            // Add fragment complexity for all possible types
                            innerComplexities = addComplexities(nodeComplexity, complexities, this.context
                                .getSchema()
                                .getPossibleTypes(fragmentType)
                                .map((t) => t.name));
                        }
                        else {
                            // Add complexity for object type
                            innerComplexities = addComplexities(nodeComplexity, complexities, [fragmentType.name]);
                        }
                        break;
                    }
                    case Kind.INLINE_FRAGMENT: {
                        let inlineFragmentType = typeDef;
                        if (childNode.typeCondition && childNode.typeCondition.name) {
                            inlineFragmentType = this.context
                                .getSchema()
                                .getType(childNode.typeCondition.name.value);
                            if (!isCompositeType(inlineFragmentType)) {
                                break;
                            }
                        }
                        const nodeComplexity = this.nodeComplexity(childNode, inlineFragmentType);
                        if (isAbstractType(inlineFragmentType)) {
                            // Add fragment complexity for all possible types
                            innerComplexities = addComplexities(nodeComplexity, complexities, this.context
                                .getSchema()
                                .getPossibleTypes(inlineFragmentType)
                                .map((t) => t.name));
                        }
                        else {
                            // Add complexity for object type
                            innerComplexities = addComplexities(nodeComplexity, complexities, [inlineFragmentType.name]);
                        }
                        break;
                    }
                    default: {
                        innerComplexities = addComplexities(this.nodeComplexity(childNode, typeDef), complexities, possibleTypeNames);
                        break;
                    }
                }
                return innerComplexities;
            }, {});
            // Only return max complexity of all possible types
            if (!selectionSetComplexities) {
                return NaN;
            }
            return Math.max(...Object.values(selectionSetComplexities), 0);
        }
        return 0;
    }
    createError() {
        if (typeof this.options.createError === 'function') {
            return this.options.createError(this.options.maximumComplexity, this.complexity);
        }
        return new GraphQLError(queryComplexityMessage(this.options.maximumComplexity, this.complexity));
    }
}
/**
 * Adds a complexity to the complexity map for all possible types
 * @param complexity
 * @param complexityMap
 * @param possibleTypes
 */
function addComplexities(complexity, complexityMap, possibleTypes) {
    for (const type of possibleTypes) {
        if (Object.prototype.hasOwnProperty.call(complexityMap, type)) {
            complexityMap[type] += complexity;
        }
        else {
            complexityMap[type] = complexity;
        }
    }
    return complexityMap;
}
