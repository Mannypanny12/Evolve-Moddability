import { Registry } from '../registry.mjs';
import {
    assertDefinitionSchemaVersion,
    assertDefinitionString,
    assertDefinitionToken,
    freezeDefinitionRecord,
    readClosedDefinitionObject,
} from './common.mjs';

export const ACHIEVEMENT_DEFINITION_SCHEMA_VERSION = 1;

export function validateAchievementDefinition(definition, context){
    assertDefinitionSchemaVersion(context.schemaVersion, ACHIEVEMENT_DEFINITION_SCHEMA_VERSION, 'achievement');
    const root = readClosedDefinitionObject(definition, {
        path: 'achievement',
        allowed: ['presentation', 'classification'],
    });
    const presentationFields = readClosedDefinitionObject(root.get('presentation'), {
        path: 'achievement.presentation',
        allowed: ['nameKey', 'descriptionKey', 'flairKey'],
    });
    const classificationFields = readClosedDefinitionObject(root.get('classification'), {
        path: 'achievement.classification',
        allowed: ['category'],
    });

    const presentation = freezeDefinitionRecord({
        nameKey: assertDefinitionString(presentationFields.get('nameKey'), 'achievement.presentation.nameKey'),
        descriptionKey: assertDefinitionString(presentationFields.get('descriptionKey'), 'achievement.presentation.descriptionKey'),
        flairKey: assertDefinitionString(presentationFields.get('flairKey'), 'achievement.presentation.flairKey'),
    });
    const classification = freezeDefinitionRecord({
        category: assertDefinitionToken(classificationFields.get('category'), 'achievement.classification.category'),
    });

    return freezeDefinitionRecord({ presentation, classification });
}

export function createAchievementRegistry(){
    return new Registry({ type: 'achievement', definitionValidator: validateAchievementDefinition });
}
