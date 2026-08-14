import fs from 'fs';

class ScriptImporter {
    #label;
    #value = null;

    constructor(label) {
        if (typeof label !== 'string' || String(label).trim().length === 0) {
            throw new Error('Script importer label is blank.')
        }
        this.#label = String(label);
    }

    get value() {
        if (this.#value === null) {
            this.#value = fs.readFileSync(__join('@/src/modules/ssh/scripts', this.#label)).toString()
        }
        return this.#value
    }
}

export default ScriptImporter;