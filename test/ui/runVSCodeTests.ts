import * as path from 'path';
import { runTests } from '@vscode/test-electron';
import * as fs from 'fs';

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../'); // Path to the extension root
    const extensionTestsPath = path.resolve(__dirname, '../../out/test/ui/suite'); // Path to compiled test suite
    const testWorkspace = path.resolve(__dirname, '../../test.code-workspace'); // Path to the test workspace

    // Ensure the report directory exists
    const reportDir = path.resolve(__dirname, '../../test-results/mochawesome');
    console.log(`Mochawesome report directory target: ${reportDir}`);
    if (!fs.existsSync(reportDir)) {
      console.log('Report directory does not exist, creating it...');
      fs.mkdirSync(reportDir, { recursive: true });
      console.log('Report directory created.');
    } else {
      console.log('Report directory already exists.');
    }

    const mochaReporterEnv = {
      MOCHA_REPORTER: 'mochawesome',
      MOCHAWESOME_REPORTDIR: reportDir,
      MOCHAWESOME_REPORTFILENAME: 'report',
      MOCHAWESOME_QUIET: 'false', // Keep this false for verbose output
      MOCHAWESOME_JSON: 'true',
      MOCHAWESOME_HTML: 'true',
      // Add any other MOCHAWESOME env vars if needed, but start simple
    };

    console.log('Using the following environment variables for Mochawesome:');
    console.log(JSON.stringify(mochaReporterEnv, null, 2));

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        testWorkspace, // Open the test workspace
        '--disable-extensions', // Disable other extensions
        // '--verbose' // You can try adding this for more VS Code launch verbosity if needed
      ],
      // Pass environment variables directly to the test extension host process
      extensionTestsEnv: mochaReporterEnv,
    });
    console.log('runTests completed.');
  } catch (err) {
    console.error('Failed to run tests or an error occurred during test execution:', err);
    process.exit(1);
  }
}

// Clear process.env settings here as they are now passed via extensionTestsEnv
// process.env.MOCHA_REPORTER = undefined;
// process.env.MOCHAWESOME_REPORTDIR = undefined;
// ... etc. for other vars if they were previously set directly on process.env

main().then(() => {
  console.log('Test run script finished.');
}).catch(e => {
  console.error('Test run script failed:', e);
  process.exit(1);
});
