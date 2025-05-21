import * as path from 'path';
import * as Mocha from 'mocha';
import * as fs from 'fs';

export function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'bdd', // Use bdd for describe/it syntax
    color: true,
    timeout: 20000
  });

  const testsRoot = path.resolve(__dirname, '..'); // Compiled tests will be in out/test/ui/

  return new Promise((resolve, reject) => {
    fs.readdir(testsRoot, (err, files) => {
      if (err) {
        return reject(err);
      }

      files
        .filter(file => file.endsWith('.test.js'))
        .forEach(file => mocha.addFile(path.resolve(testsRoot, file)));

      try {
        mocha.run(failures => {
          if (failures > 0) {
            reject(new Error(`${failures} tests failed.`));
          } else {
            resolve();
          }
        });
      } catch (runErr) {
        console.error(runErr);
        reject(runErr);
      }
    });
  });
}
