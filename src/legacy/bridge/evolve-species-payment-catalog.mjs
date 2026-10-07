import { EngineContractError } from '../../engine/identity.mjs';

export const EVOLVE_SPECIES_PAYMENT_LOCAL_IDS = Object.freeze([
    'protoplasm',
    'human',
    'elven',
    'orc',
    'cath',
    'wolven',
    'vulpine',
    'centaur',
    'rhinotaur',
    'capybara',
    'kobold',
    'goblin',
    'gnome',
    'ogre',
    'cyclops',
    'troll',
    'tortoisan',
    'gecko',
    'slitheryn',
    'arraak',
    'pterodacti',
    'dracnid',
    'entish',
    'cacti',
    'pinguicula',
    'sporgar',
    'shroomi',
    'moldling',
    'mantis',
    'scorpid',
    'antid',
    'sharkin',
    'octigoran',
    'dryad',
    'satyr',
    'phoenix',
    'salamander',
    'yeti',
    'wendigo',
    'tuskin',
    'kamel',
    'balorg',
    'imp',
    'seraph',
    'unicorn',
    'synth',
    'nano',
    'ghast',
    'shoggoth',
    'dwarf',
    'raccoon',
    'lichen',
    'wyvern',
    'beholder',
    'djinn',
    'narwhal',
    'bombardier',
    'nephilim',
    'hellspawn',
    'junker',
    'sludge',
    'ultra_sludge',
    'custom',
    'hybrid',
]);

const SPECIES = new Set(EVOLVE_SPECIES_PAYMENT_LOCAL_IDS);

function fail(code, message, details){
    throw new EngineContractError(code, message, details);
}

export function evolveSpeciesPaymentResourceId(rawSpecies){
    if (typeof rawSpecies !== 'string' || !SPECIES.has(rawSpecies)){
        fail('UNSUPPORTED_EVOLVE_SPECIES_PAYMENT_ID', 'Active legacy species is not a reviewed first-party Evolve species identity.', {
            valueType: typeof rawSpecies,
            species: typeof rawSpecies === 'string' ? rawSpecies : undefined,
        });
    }
    return `evolve:resource/${rawSpecies}`;
}
