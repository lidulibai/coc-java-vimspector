import * as path from 'path';
import { commands as Commands, diagnosticManager, DiagnosticSeverity, window, workspace } from 'coc.nvim';

import * as commands from './commands';
import * as lsPlugin from './languageServerPlugin';

const JAVA_DEBUG_CONFIGURATION = 'java.debug.settings';
const ON_BUILD_FAILURE_PROCEED = 'onBuildFailureProceed';

export async function buildWorkspace(): Promise<boolean> {
  await commands.executeJavaExtensionCommand(commands.JAVA_BUILD_WORKSPACE, false);

  return true;
  // return handleBuildFailure(buildResult.operationId, buildResult.error);
}

async function handleBuildFailure(operationId: string, err: any): Promise<boolean> {
  const configuration = workspace.getConfiguration(JAVA_DEBUG_CONFIGURATION);
  const onBuildFailureProceed = configuration.get<boolean>(ON_BUILD_FAILURE_PROCEED);

  window.showErrorMessage('Build failed');
  if (
    !onBuildFailureProceed &&
    (err === lsPlugin.CompileWorkspaceStatus.WITHERROR || err === lsPlugin.CompileWorkspaceStatus.FAILED)
  ) {
    if (checkErrorsReportedByJavaExtension()) {
      Commands.executeCommand('workbench.actions.view.problems');
    }

    const ans = await window.showErrorMessage('Build failed, do you want to continue?', 'Proceed', 'Fix...', 'Cancel');
    if (ans === 'Proceed') {
      return true;
    } else if (ans === 'Fix...') {
      // showFixSuggestions(operationId);
    }

    return false;
  }

  return true;
}

function checkErrorsReportedByJavaExtension(): boolean {
  const problems = diagnosticManager.getDiagnostics(workspace.root) || [];
  for (const problem of problems) {
    const fileName = path.basename(problem[0].fsPath || '');
    if (fileName.endsWith('.java') || fileName === 'pom.xml' || fileName.endsWith('.gradle')) {
      if (problem[1].filter((diagnostic) => diagnostic.severity === DiagnosticSeverity.Error).length) {
        return true;
      }
    }
  }

  return false;
}
