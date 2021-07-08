import {
  commands,
  ExtensionContext,
  listManager,
  Uri,
  window,
  workspace,
  WorkspaceConfiguration,
  WorkspaceFolder,
  Document
} from 'coc.nvim';
import _ from 'lodash';
import * as path from 'path';
import { DebugConfiguration, startDebugging } from './debugCodeLensProvider';
import { IMainClassOption, resolveMainMethod } from './languageServerPlugin';
import DemoList from './lists';
import * as utility from './utility';
import * as vimspector from './vimspectorPlugin';

export async function activate(context: ExtensionContext): Promise<void> {
  window.showMessage(`coc-java-vimspector works!`);

  context.subscriptions.push(
    commands.registerCommand('java.debug.runJavaFile', async (uri: string) => {
      await runJavaFile(uri, true);
    })
  );
  context.subscriptions.push(
    commands.registerCommand('java.debug.debugJavaFile', async (uri: string) => {
      await runJavaFile(uri, false);
    })
  );
  context.subscriptions.push(
    commands.registerCommand('java.debug.runFromProjectView', async (node: any) => {
      await runJavaProject(node, true);
    })
  );
  context.subscriptions.push(
    commands.registerCommand('java.debug.debugFromProjectView', async (node: any) => {
      await runJavaProject(node, false);
    })
  );

  context.subscriptions.push(
    listManager.registerList(new DemoList(workspace.nvim)),

    workspace.registerKeymap(
      ['n'],
      'java-vimspector-keymap',
      async () => {
        window.showMessage(`registerKeymap`);
      },
      { sync: false }
    )
  );
}

export async function runJavaFile(uri: string, noDebug: boolean) {
  // TODO: check extentions is activated
  // check current file is java file
  let currentFile = await workspace.nvim.eval('expand("%:p")');
  if (!uri && _.endsWith(path.basename(currentFile.toString()), '.java')) {
    uri = currentFile.toString();
  }
  console.info(uri);

  if (!uri) {
    window.showErrorMessage(`${noDebug ? 'Run' : 'Debug'} failed. Please open a Java file with main method first.`);
  }
  const mainClasses: IMainClassOption[] = await resolveMainMethod(Uri.file(uri));
  const placeHolder = `The file '${path.basename(uri)}' is not executable, please select a main class you want to run.`;
  await launchMain(mainClasses, Uri.parse(uri), noDebug, placeHolder);
}

async function runJavaProject(node: any, noDebug: boolean) {
  if (!node || !node.name || !node.uri) {
    window.showErrorMessage(
      `Failed to ${noDebug ? 'run' : 'debug'} the project because of invalid project node. ` +
        'This command only applies to Project Explorer view.'
    );
    return;
  }

  window.showMessage('Resolving main class...');
  const mainClassesOptions: IMainClassOption[] = await utility.searchMainMethods(Uri.parse(node.uri));

  if (!mainClassesOptions || !mainClassesOptions.length) {
    window.showErrorMessage(
      `Failed to ${noDebug ? 'run' : 'debug'} this project '${node._nodeData.displayName || node.name}' ` +
        'because it does not contain any main class.'
    );
    return;
  }

  const classes: string[] = [];
  for (let index = 0; index < mainClassesOptions.length; index++) {
    classes.push(mainClassesOptions[index].mainClass);
  }
  const pick = await window.showQuickpick(classes, 'Select the main class to run.');
  if (!pick || pick === -1) {
    return;
  }

  window.showMessage('Launching main class...');
  const projectName: string | undefined = mainClassesOptions[pick].projectName;
  const mainClass: string = mainClassesOptions[pick].mainClass;
  const filePath: string | undefined = mainClassesOptions[pick].filePath;
  const workspaceFolder: WorkspaceFolder | null = filePath ? workspace.workspaceFolder : null;
  const launchConfigurations: WorkspaceConfiguration = workspace.getConfiguration('launch', workspaceFolder?.uri);
  const existingConfigs: DebugConfiguration[] = launchConfigurations.configurations;
  const existConfig: DebugConfiguration | undefined = _.find(existingConfigs, (config) => {
    return config.mainClass === mainClass && _.toString(config.projectName) === _.toString(projectName);
  });
  const debugConfig = existConfig || {
    type: 'java',
    name: `Launch ${mainClass.substr(mainClass.lastIndexOf('.') + 1)}`,
    request: 'launch',
    mainClass,
    projectName,
  };
  debugConfig.noDebug = noDebug;
  // debugConfig.__progressId = progressReporter.getId();
  vimspector.startVimspector(workspaceFolder, debugConfig);
}

async function launchMain(
  mainMethods: IMainClassOption[],
  uri: Uri,
  noDebug: boolean,
  placeHolder: string
): Promise<void> {
  if (!mainMethods || !mainMethods.length) {
    window.showMessage(
      'Error: Main method not found in the file, please define the main method as: public static void main(String[] args)',
      'error'
    );
    return;
  }
  if (mainMethods.length === 1) {
    startDebugging(mainMethods[0].mainClass, mainMethods[0].projectName || '', uri, noDebug);
    return;
  }

  const pickList: string[] = [];
  mainMethods.forEach((value) => {
    pickList.push(value.mainClass);
  });
  window.showQuickpick(pickList, placeHolder).then((idx) => {
    if (idx == -1) {
      return;
    }
    window.showMessage('Launching main class...');
    startDebugging(mainMethods[idx].mainClass, mainMethods[idx].projectName || '', uri, noDebug);
  });
}
