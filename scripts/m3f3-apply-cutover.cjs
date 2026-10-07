const fs = require('fs');

const actionsPath = 'src/actions.js';
let source = fs.readFileSync(actionsPath, 'utf8');

const importAnchor = "import { hasLegacyAchievement, legacyAchievementRank } from './legacy/bridge/achievement-state-reader.mjs';\n";
const runtimeImport = "import { dispatchEvolutionDnaCommand } from './application/evolve/evolution-dna-command-runtime.mjs';\n";
const oldAction = `            action(args){\n                if (global['resource']['RNA'].amount >= 2 && global['resource']['DNA'].amount < global['resource']['DNA'].max){\n                    modRes('RNA',-2,true);\n                    modRes('DNA',1,true);\n                }\n                return false;\n            },`;
const newAction = `            action(args){\n                dispatchEvolutionDnaCommand();\n                return false;\n            },`;

if (!source.includes(runtimeImport)) {
    const importCount = source.split(importAnchor).length - 1;
    if (importCount !== 1) {
        throw new Error(`Expected exactly one actions.js import anchor, found ${importCount}.`);
    }
    source = source.replace(importAnchor, importAnchor + runtimeImport);
}

const oldActionCount = source.split(oldAction).length - 1;
if (oldActionCount !== 1) {
    throw new Error(`Expected exactly one legacy DNA action body, found ${oldActionCount}.`);
}
source = source.replace(oldAction, newAction);

if (!source.includes(runtimeImport) || !source.includes(newAction)) {
    throw new Error('M3F3 cutover postcondition failed.');
}

fs.writeFileSync(actionsPath, source);
fs.rmSync('scripts/m3f3-apply-cutover.cjs');
fs.rmSync('.github/workflows/m3f3-apply-cutover.yml');
