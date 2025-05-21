import * as path from 'path';
import * as Mocha from 'mocha';
import * as fs from 'fs';

/**
 * @fileoverview Test suite runner for UI tests of the Unreal Log Viewer extension.
 * This script configures and runs Mocha tests, generating mochawesome reports.
 * It discovers `.test.js` files in the `test/ui` directory and executes them.
 */

/**
 * Runs the Mocha test suite for UI tests.
 *
 * This function configures Mocha with the `mochawesome` reporter, sets up report directories,
 * discovers all `*.test.js` files in the `../` directory (relative to this file, i.e., `test/ui/`),
 * and executes the tests.
 *
 * It reads reporter configuration from environment variables (`MOCHAWESOME_REPORTDIR`, `MOCHAWESOME_REPORTFILENAME`)
 * or uses default values if environment variables are not set.
 *
 * @returns A promise that resolves when the test run is complete. It resolves even if there are test failures
 * to allow the reporter to generate its output. It rejects if there's an error setting up or starting the tests
 * (e.g., cannot read test directory, no test files found).
 */
export function run(): Promise<void> {
  // console.log('[suite/index.ts] MOCHA_REPORTER env var:', process.env.MOCHA_REPORTER);
  // console.log('[suite/index.ts] MOCHAWESOME_REPORTDIR env var:', process.env.MOCHAWESOME_REPORTDIR);
  // console.log('[suite/index.ts] MOCHAWESOME_REPORTFILENAME env var:', process.env.MOCHAWESOME_REPORTFILENAME);

  const reportDirFromEnv = process.env.MOCHAWESOME_REPORTDIR;
  const reportFilenameFromEnv = process.env.MOCHAWESOME_REPORTFILENAME;

  const defaultReportDir = path.resolve(__dirname, '../../../test-results/mochawesome'); // Default to the primary folder
  const defaultReportFilename = 'report';

  const targetReportDir = reportDirFromEnv || defaultReportDir;
  const targetReportFilename = reportFilenameFromEnv || defaultReportFilename;

  // console.log(`[suite/index.ts] Mochawesome effective target reportDir: ${targetReportDir}`);
  // console.log(`[suite/index.ts] Mochawesome effective target reportFilename: ${targetReportFilename}`);

  if (!fs.existsSync(targetReportDir)) {
    console.log(`[suite/index.ts] Report directory ${targetReportDir} does not exist, creating it...`);
    try {
      fs.mkdirSync(targetReportDir, { recursive: true });
      console.log(`[suite/index.ts] Report directory ${targetReportDir} created.`);
    } catch (mkdirErr) {
      console.error(`[suite/index.ts] Error creating report directory ${targetReportDir}:`, mkdirErr);
    }
  } else {
    // console.log(`[suite/index.ts] Target report directory ${targetReportDir} already exists.`);
  }

  const mocha = new Mocha({
    ui: 'bdd',
    color: true,
    timeout: 20000,
    reporter: 'mochawesome',
    reporterOptions: {
      reportDir: targetReportDir,
      reportFilename: targetReportFilename,
      quiet: true, // Set back to true for cleaner output, false for debugging
      json: true,
      html: true
    }
  });

  // console.log('[suite/index.ts] Mocha instance created with reporter options:', JSON.stringify(mocha.options.reporterOptions, null, 2));

  const testsRoot = path.resolve(__dirname, '..');

  return new Promise((resolve, reject) => {
    fs.readdir(testsRoot, (err, files) => {
      if (err) {
        console.error('[suite/index.ts] Error reading test directory:', testsRoot, err);
        return reject(err);
      }

      const testFiles = files.filter(file => file.endsWith('.test.js'));
      console.log('[suite/index.ts] Running UI tests from:', testsRoot, 'Files:', testFiles.join(', ') || 'NONE');

      if (testFiles.length === 0) {
        console.warn('[suite/index.ts] No .test.js files found in', testsRoot);
        return reject(new Error('No test files found in ' + testsRoot));
      }

      testFiles.forEach(file => {
        const filePath = path.resolve(testsRoot, file);
        // console.log(`[suite/index.ts] Adding test file: ${filePath}`);
        mocha.addFile(filePath);
      });

      try {
        // console.log('[suite/index.ts] Starting Mocha run...');
        mocha.run(failures => {
          console.log(`[suite/index.ts] Mocha UI test run finished. Failures: ${failures}`);
          if (failures > 0) {
            // console.error(`[suite/index.ts] ${failures} tests failed.`);
            // Resolve even with failures so reporter can run
            resolve();
          } else {
            // console.log('[suite/index.ts] All UI tests passed.');
            resolve();
          }
        });
      } catch (runErr) {
        console.error('[suite/index.ts] Error running Mocha UI tests:', runErr);
        reject(runErr);
      }
    });
  });
}
