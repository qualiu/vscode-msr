import * as path from 'path';
import * as fs from 'fs';
import * as Mocha from 'mocha';

function findTestFiles(dir: string): string[] {
    const results: string[] = [];
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
            results.push(...findTestFiles(fullPath));
        } else if (item.isFile() && item.name.endsWith('.test.js')) {
            results.push(fullPath);
        }
    }
    return results;
}

export function run(): Promise<void> {
    // Create the mocha test
    const mocha = new Mocha({
        ui: 'tdd',
    });
    // mocha.useColors(true);

    const testsRoot = path.resolve(__dirname, '..');

    return new Promise((c, e) => {
        try {
            // Find all test files recursively
            const files = findTestFiles(testsRoot);

            // Add files to the test suite
            files.forEach(f => mocha.addFile(f));

            // Run the mocha test
            mocha.run(failures => {
                if (failures > 0) {
                    e(new Error(`${failures} tests failed.`));
                } else {
                    c();
                }
            });
        } catch (err) {
            e(err);
        }
    });
}
