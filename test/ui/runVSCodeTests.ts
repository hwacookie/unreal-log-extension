import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../..'); // Path to the extension root
    const extensionTestsPath = path.resolve(__dirname, '../../out/test/ui/suite'); // Path to compiled test suite
    const testWorkspace = path.resolve(__dirname, '../../test.code-workspace'); // Path to the test workspace

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        testWorkspace, // Open the test workspace
        '--disable-extensions' // Disable other extensions
      ]
    });
  } catch (err) {
    console.error('Failed to run tests', err);
    process.exit(1);
  }
}

main();
