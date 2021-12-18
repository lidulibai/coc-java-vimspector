import {commands, window, workspace, WorkspaceFolder} from 'coc.nvim';
import * as Commands from './commands';
import {DebugConfiguration} from './debugCodeLensProvider';
import * as configuration from './configurationProvider';

export async function startVimspector(
  folder: WorkspaceFolder | null,
  nameOrConfiguration: string | DebugConfiguration
): Promise<any> {
  let debugConfig: DebugConfiguration | undefined;
  if (typeof nameOrConfiguration === 'string') {
    debugConfig = workspace.getConfiguration('launch').configurations[nameOrConfiguration];
  } else if (typeof nameOrConfiguration !== 'string') {
    debugConfig = await configuration.resolveAndValidateDebugConfiguration(folder, nameOrConfiguration);
  }
  if (typeof debugConfig == 'undefined') {
    window.showMessage('debug configuration undefined');
    return;
  }
  const debugPort: string = await commands.executeCommand(
    Commands.EXECUTE_WORKSPACE_COMMAND,
    Commands.JAVA_START_DEBUG_SESSION
  );

  window.showMessage(`Java debug server started on port: ${debugPort}`);

  const settings = {
    DAPPort: debugPort,
    adapter: 'vscode-java',
    ...debugConfig,
  };

  const vimspectorSettings = JSON.stringify(settings);

  // See https://github.com/puremourning/vimspector#launch-with-options
  // window.showMessage(vimspectorSettings);
  return workspace.nvim.eval(`vimspector#LaunchWithSettings(${vimspectorSettings})`);
}


