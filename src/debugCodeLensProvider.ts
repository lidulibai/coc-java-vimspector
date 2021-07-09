import {commands, Uri, window, workspace as Workspace, WorkspaceFolder} from 'coc.nvim';
import _ from 'lodash';
import path from 'path';
import {isOnClasspath} from './languageServerPlugin';
import * as vimspector from './vimspectorPlugin';
import fs from 'fs';

export async function startDebugging(
  mainClass: string,
  projectName: string | undefined,
  uri: Uri,
  _noDebug: boolean
): Promise<boolean> {
  const workspaceFolder: WorkspaceFolder | null = Workspace.getWorkspaceFolder(uri.toString());
  const workspaceUri = workspaceFolder ? Uri.parse(workspaceFolder.uri) : undefined;
  const onClasspath = await isOnClasspath(uri.toString());
  if (workspaceUri && onClasspath === false && !(await addToClasspath(uri))) {
    return false;
  }

  const debugConfig: DebugConfiguration = await constructDebugConfig(mainClass, projectName, workspaceUri);
  debugConfig.projectName = projectName;
  // debugConfig.noDebug = noDebug;
  // debugConfig.__progressId = progressReporter?.getId();

  return vimspector.startVimspector(workspaceFolder, debugConfig);
}

async function addToClasspath(uri: Uri): Promise<boolean> {
  const fileName = path.basename(uri.fsPath || '');
  const parentFsPath = path.dirname(uri.fsPath || '');
  if (!parentFsPath) {
    return true;
  }

  const parentUri = Uri.file(parentFsPath);
  console.log(parentUri.toString());
  let parentPath = parentUri.path;
  if (parentPath === parentUri.fsPath) {
    parentPath = path.basename(parentFsPath);
  }
  const message =
    `The file ${fileName} isn't on the classpath, the runtime may throw class not found error. ` +
    `Do you want to add the parent folder "${parentPath}" to Java source path?`;
  const ans = await window.showWarningMessage(message);
  if (!ans) {
    return true;
  } else {
    commands.executeCommand('java.project.addToSourcePath', parentUri);
  }

  return false;
}

/**
 * Configuration for a debug session.
 */
export interface DebugConfiguration {
  /**
   * The type of the debug session.
   */
  type: string;

  /**
   * The name of the debug session.
   */
  name: string;

  /**
   * The request type of the debug session.
   */
  request: string;

  /**
   * Additional debug type specific properties.
   */
  [key: string]: any;
}

/**
 * The configuration target
 */
export enum ConfigurationTarget {
  /**
   * Global configuration
   */
  Global = 1,

  /**
   * Workspace configuration
   */
  Workspace = 2,

  /**
   * Workspace folder configuration
   */
  WorkspaceFolder = 3,
}

async function constructDebugConfig(
  mainClass: string,
  projectName: string | undefined,
  workspace: Uri | undefined
): Promise<DebugConfiguration> {
  const launchConfigurations = Workspace.getConfiguration('launch', workspace?.toString());
  const rawConfigs: DebugConfiguration[] = launchConfigurations.configurations;

  let debugConfig: DebugConfiguration | undefined = _.find(rawConfigs, (config) => {
    return config.mainClass === mainClass && _.toString(config.projectName) === _.toString(projectName);
  });

  if (!debugConfig) {
    debugConfig = _.find(rawConfigs, (config) => {
      return config.mainClass === mainClass && !config.projectName;
    });
  }

  if (!debugConfig) {
    debugConfig = {
      type: 'java',
      name: `CodeLens (Launch) - ${mainClass.substr(mainClass.lastIndexOf('.') + 1)}`,
      request: 'launch',
      console: 'externalTerminal',
      mainClass,
      projectName,
    };

    // Persist the configuration into launch.json only if the launch.json file already exists in the workspace.
    if ((rawConfigs && rawConfigs.length) || (await launchJsonExists(workspace))) {
      try {
        // Insert the default debug configuration to the beginning of launch.json.
        const rawConfigsCopy = _.cloneDeep(rawConfigs);
        rawConfigsCopy.splice(0, 0, debugConfig);
        launchConfigurations.update('configurations', rawConfigsCopy);
        fs.writeFileSync(Workspace.root + '/.vimspector.json', buildVimspectorConfig(rawConfigsCopy));
      } catch (error) {
        window.showErrorMessage(error);
        // When launch.json has unsaved changes before invoking the update api, it will throw the error below:
        // 'Unable to write into launch configuration file because the file is dirty. Please save it first and then try again.'
        // It's safe to ignore it because the only impact is the configuration is not saved, but you can continue to start the debugger.
      }
    }
  }

  return _.cloneDeep(debugConfig);
}

function buildVimspectorConfig(rawConfigs : DebugConfiguration[]): string {
    let vimspectorJson = {};
    let configurations = {};
    rawConfigs.forEach(config => {
        configurations[config.name] = {
            "adapter": "vscode-java",
            "default": true,
            "breakpoints": {
                "exception": {
                    "caught": "N",
                    "uncaught": "N"
                }
            },
            "configuration": {
            "classPaths": ["*${classPathString}"],
                ...config
            }
        };
    })
    vimspectorJson["configurations"] = configurations;
    return JSON.stringify(vimspectorJson, null, '\t');
}

async function launchJsonExists(workspace: Uri | undefined): Promise<boolean> {
  if (!workspace) {
    return false;
  }

  const workspaceFolder = Workspace.getWorkspaceFolder(workspace.toString());
  const result: string = path.resolve(Workspace.root, '.vimspector.json');
  return Workspace.getWorkspaceFolder(result) === workspaceFolder;
}
