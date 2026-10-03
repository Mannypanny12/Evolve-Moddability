import { Registry } from '../registry.mjs';
import {
    assertDefinitionBoolean,
    assertDefinitionSchemaVersion,
    assertDefinitionString,
    assertDefinitionToken,
    freezeDefinitionRecord,
    readClosedDefinitionObject,
} from './common.mjs';

export const RESOURCE_DEFINITION_SCHEMA_VERSION = 1;

export function validateResourceDefinition(definition, context){
    assertDefinitionSchemaVersion(context.schemaVersion, RESOURCE_DEFINITION_SCHEMA_VERSION, 'resource');
    const root = readClosedDefinitionObject(definition, {
        path: 'resource',
        allowed: ['presentation', 'properties'],
    });
    const presentationFields = readClosedDefinitionObject(root.get('presentation'), {
        path: 'resource.presentation',
        allowed: ['nameKey', 'colorRole'],
    });
    const propertyFields = readClosedDefinitionObject(root.get('properties'), {
        path: 'resource.properties',
        allowed: ['tradable', 'stackable'],
    });

    const presentation = freezeDefinitionRecord({
        nameKey: assertDefinitionString(presentationFields.get('nameKey'), 'resource.presentation.nameKey'),
        colorRole: assertDefinitionToken(presentationFields.get('colorRole'), 'resource.presentation.colorRole'),
    });
    const properties = freezeDefinitionRecord({
        tradable: assertDefinitionBoolean(propertyFields.get('tradable'), 'resource.properties.tradable'),
        stackable: assertDefinitionBoolean(propertyFields.get('stackable'), 'resource.properties.stackable'),
    });

    return freezeDefinitionRecord({ presentation, properties });
}

export function createResourceRegistry(){
    return new Registry({ type: 'resource', definitionValidator: validateResourceDefinition });
}
