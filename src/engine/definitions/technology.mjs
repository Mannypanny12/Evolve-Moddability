import { Registry } from '../registry.mjs';
import {
    assertDefinitionSchemaVersion,
    assertDefinitionString,
    assertDefinitionToken,
    freezeDefinitionRecord,
    readClosedDefinitionObject,
} from './common.mjs';

export const TECHNOLOGY_DEFINITION_SCHEMA_VERSION = 1;

export function validateTechnologyDefinition(definition, context){
    assertDefinitionSchemaVersion(context.schemaVersion, TECHNOLOGY_DEFINITION_SCHEMA_VERSION, 'technology');
    const root = readClosedDefinitionObject(definition, {
        path: 'technology',
        allowed: ['presentation', 'classification'],
    });
    const presentationFields = readClosedDefinitionObject(root.get('presentation'), {
        path: 'technology.presentation',
        allowed: ['nameKey', 'descriptionKey'],
    });
    const classificationFields = readClosedDefinitionObject(root.get('classification'), {
        path: 'technology.classification',
        allowed: ['category', 'era'],
    });

    const presentation = freezeDefinitionRecord({
        nameKey: assertDefinitionString(presentationFields.get('nameKey'), 'technology.presentation.nameKey'),
        descriptionKey: assertDefinitionString(presentationFields.get('descriptionKey'), 'technology.presentation.descriptionKey'),
    });
    const classification = freezeDefinitionRecord({
        category: assertDefinitionToken(classificationFields.get('category'), 'technology.classification.category'),
        era: assertDefinitionToken(classificationFields.get('era'), 'technology.classification.era'),
    });

    return freezeDefinitionRecord({ presentation, classification });
}

export function createTechnologyRegistry(){
    return new Registry({ type: 'technology', definitionValidator: validateTechnologyDefinition });
}
