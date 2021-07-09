import { Uri, window, workspace, WorkspaceConfiguration, WorkspaceFolder } from 'coc.nvim';
import _ from 'lodash';
import { buildWorkspace } from './build';
import { populateStepFilters } from './classFilter';
import { DebugConfiguration } from './debugCodeLensProvider';
import * as lsPlugin from './languageServerPlugin';
import {
  addMoreHelpfulVMArgs,
  getJavaVersion,
  getShortenApproachForCLI,
  validateRuntimeCompatibility,
} from './launchCommand';
import { resolveJavaProcess } from './processPicker';
import * as utility from './utility';
import fs from 'fs';
import { mainClassPicker } from './mainClassPicker';
import path from 'path';
import * as os from 'os';

export async function resolveAndValidateDebugConfiguration(folder: WorkspaceFolder | null, config: DebugConfiguration) {
  // If no debug configuration is provided, then generate one in memory.
  if (isEmptyConfig(config)) {
    config.type = 'java';
    config.name = 'Java Debug';
    config.request = 'launch';
  }

  if (config.request === 'launch') {
    // If the user doesn't specify 'vmArgs' in launch.json, use the global setting to get the default vmArgs.
    if (config.vmArgs === undefined) {
      const debugSettings: WorkspaceConfiguration = workspace.getConfiguration('java.debug.settings');
      config.vmArgs = debugSettings.vmArgs;
    }
    // If the user doesn't specify 'console' in launch.json, use the global setting to get the launch console.
    if (!config.console) {
      const debugSettings: WorkspaceConfiguration = workspace.getConfiguration('java.debug.settings');
      config.console = debugSettings.console;
    }
    // If the console is integratedTerminal, don't auto switch the focus to DEBUG CONSOLE.
    if (config.console === 'integratedTerminal' && !config.internalConsoleOptions) {
      config.internalConsoleOptions = 'neverOpen';
    }

    if (needsBuildWorkspace()) {
      window.showMessage('Compiling...');
      const proceed = await buildWorkspace();
      window.showMessage('== proceed: ' + proceed);
      if (!proceed) {
        return undefined;
      }
    }

    if (!config.mainClass) {
      window.showMessage('Resolving main class...');
    } else {
      window.showMessage('Resolving launch configuration...');
    }
    const mainClassOption = await resolveAndValidateMainClass(folder && Uri.parse(folder.uri), config);
    if (!mainClassOption || !mainClassOption.mainClass) {
      // Exit silently if the user cancels the prompt fix by ESC.
      // Exit the debug session.
      return undefined;
    }

    config.mainClass = mainClassOption.mainClass;
    config.projectName = mainClassOption.projectName;

    if (_.isEmpty(config.classPaths) && _.isEmpty(config.modulePaths)) {
      const result = <any[]>await lsPlugin.resolveClasspath(config.mainClass, config.projectName);
      config.modulePaths = result[0];
      config.classPaths = result[1];
      config.classPathString = result[1].toString().replace(/,/g, ' ');
    }
    if (_.isEmpty(config.classPaths) && _.isEmpty(config.modulePaths)) {
      window.showErrorMessage(
        'Cannot resolve the modulepaths/classpaths automatically, please specify the value in the launch.json.'
      );
      return undefined;
    }

    config.javaExec = await lsPlugin.resolveJavaExecutable(config.mainClass, config.projectName);
    // Add the default launch options to the config.
    config.cwd = config.cwd || _.get(folder, 'uri.fsPath');
    if (Array.isArray(config.args)) {
      config.args = concatArgs(config.args);
    }

    if (Array.isArray(config.vmArgs)) {
      config.vmArgs = concatArgs(config.vmArgs);
    }

    // Populate the class filters to the debug configuration.
    await populateStepFilters(config);

    const targetJavaVersion: number = await getJavaVersion(config.javaExec);
    // Auto add '--enable-preview' vmArgs if the java project enables COMPILER_PB_ENABLE_PREVIEW_FEATURES flag.
    if (await lsPlugin.detectPreviewFlag(config.mainClass, config.projectName)) {
      config.vmArgs = (config.vmArgs || '') + ' --enable-preview';
      validateRuntimeCompatibility(targetJavaVersion);
    }

    // Add more helpful vmArgs.
    await addMoreHelpfulVMArgs(config, targetJavaVersion);

    if (!config.shortenCommandLine || config.shortenCommandLine === 'auto') {
      config.shortenCommandLine = await getShortenApproachForCLI(config, targetJavaVersion);
    }

    if (process.platform === 'win32' && config.console !== 'internalConsole') {
      config.launcherScript = utility.getLauncherScriptPath();
    }
  } else if (config.request === 'attach') {
    if (config.hostName && config.port) {
      config.processId = undefined;
      // Continue if the hostName and port are configured.
    } else if (config.processId !== undefined) {
      // tslint:disable-next-line
      if (config.processId === '${command:PickJavaProcess}') {
        return undefined;
      }

      const pid = Number(config.processId);
      if (Number.isNaN(pid)) {
        window.showErrorMessage(`The processId config '${config.processId}' is not a valid process id.`);
        return undefined;
      }

      const javaProcess = await resolveJavaProcess(pid);
      if (!javaProcess) {
        window.showErrorMessage(
          `Attach to process: pid '${config.processId}' is not a debuggable Java process. ` +
            `Please make sure the process has turned on debug mode using vmArgs like ` +
            `'-agentlib:jdwp=transport=dt_socket,server=y,address=5005.'`
        );
        return undefined;
      }

      config.processId = undefined;
      config.hostName = javaProcess.hostName;
      config.port = javaProcess.debugPort;
    } else {
      window.showErrorMessage(
        'Please specify the hostName/port directly, or provide the processId of the remote debuggee in the launch.json.'
      );
    }

    // Populate the class filters to the debug configuration.
    await populateStepFilters(config);
  } else {
    window.showErrorMessage(
      `Request type "${config.request}" is not supported. Only "launch" and "attach" are supported.`
    );
    return undefined;
  }

  delete config.__progressId;
  return config;
}

/**
 * When VS Code cannot find any available DebugConfiguration, it passes a { noDebug?: boolean } to resolve.
 * This function judges whether a DebugConfiguration is empty by filtering out the field "noDebug".
 */
function isEmptyConfig(config: DebugConfiguration): boolean {
  return Object.keys(config).filter((key: string) => key !== 'noDebug').length === 0;
}

function needsBuildWorkspace(): boolean {
  const debugSettingsRoot: WorkspaceConfiguration = workspace.getConfiguration('java.debug.settings');
  return debugSettingsRoot ? debugSettingsRoot.forceBuildBeforeLaunch : true;
}

/**
 * Converts an array of arguments to a string as the args and vmArgs.
 */
function concatArgs(args: any[]): string {
  return _.join(
    _.map(args, (arg: any): string => {
      const str = String(arg);
      // if it has quotes or spaces, use double quotes to wrap it
      if (/["\s]/.test(str)) {
        return '"' + str.replace(/(["\\])/g, '\\$1') + '"';
      }
      return str;

      // if it has only single quotes
    }),
    ' '
  );
}

async function resolveAndValidateMainClass(
  folder: Uri | null,
  config: DebugConfiguration
): Promise<lsPlugin.IMainClassOption | undefined> {
  if (!config.mainClass || isFile(config.mainClass)) {
    const currentFile = config.mainClass || workspace.nvim.eval("expand('%:p')");
    window.showMessage(currentFile);
    if (currentFile) {
      const mainEntries = await lsPlugin.resolveMainMethod(Uri.file(currentFile));
      if (mainEntries.length) {
        return mainClassPicker.showQuickPick(mainEntries, 'Please select a main class you want to run.');
      }
    }

    const hintMessage = currentFile
      ? `The file '${path.basename(currentFile)}' is not executable, please select a main class you want to run.`
      : 'Please select a main class you want to run.';
    return promptMainClass(folder, hintMessage);
  }

  const containsExternalClasspaths = !_.isEmpty(config.classPaths) || !_.isEmpty(config.modulePaths);
  const validationResponse = await lsPlugin.validateLaunchConfig(
    config.mainClass,
    config.projectName,
    containsExternalClasspaths,
    folder
  );
  if (!validationResponse.mainClass.isValid || !validationResponse.projectName.isValid) {
    return fixMainClass(folder, config, validationResponse);
  }

  return {
    mainClass: config.mainClass,
    projectName: config.projectName,
  };
}

function isFile(filePath: string): boolean {
  try {
    return fs.lstatSync(filePath).isFile();
  } catch (error) {
    // do nothing
    return false;
  }
}

async function promptMainClass(
  folder: Uri | null,
  hintMessage?: string
): Promise<lsPlugin.IMainClassOption | undefined> {
  const res = await lsPlugin.resolveMainClass(folder);
  if (res.length === 0) {
    const workspaceFolder = folder ? workspace.getWorkspaceFolder(folder.toString()) : undefined;
    window.showErrorMessage(
      `Cannot find a class with the main method${
        workspaceFolder ? " in the folder '" + workspaceFolder.name + "'" : ''
      }.`
    );
  }
  return mainClassPicker.showQuickPickWithRecentlyUsed(res, hintMessage || 'Select main class<project name>');
}

async function fixMainClass(
  folder: Uri | null,
  config: DebugConfiguration,
  validationResponse: lsPlugin.ILaunchValidationResponse
): Promise<lsPlugin.IMainClassOption | undefined> {
  const errors: string[] = [];
  if (!validationResponse.mainClass.isValid) {
    errors.push(String(validationResponse.mainClass.message));
  }

  if (!validationResponse.projectName.isValid) {
    errors.push(String(validationResponse.projectName.message));
  }

  if (validationResponse.proposals && validationResponse.proposals.length) {
    window.showErrorMessage(errors.join(os.EOL));
    const selectedFix = await mainClassPicker.showQuickPick(
      validationResponse.proposals,
      'Please select main class<project name>.',
      false
    );
    if (selectedFix) {
      await persistMainClassOption(folder, config, selectedFix);
    }
    return selectedFix;
  }
}

async function persistMainClassOption(
  folder: Uri | null,
  oldConfig: DebugConfiguration,
  change: lsPlugin.IMainClassOption
): Promise<void> {
  const newConfig: DebugConfiguration = _.cloneDeep(oldConfig);
  newConfig.mainClass = change.mainClass;
  newConfig.projectName = change.projectName;

  return persistLaunchConfig(folder, oldConfig, newConfig);
}

async function persistLaunchConfig(
  folder: Uri | null,
  oldConfig: DebugConfiguration,
  newConfig: DebugConfiguration
): Promise<void> {
  const launchConfigurations: WorkspaceConfiguration = workspace.getConfiguration('launch', folder?.toString());
  const rawConfigs: DebugConfiguration[] = launchConfigurations.configurations;
  const targetIndex: number = _.findIndex(rawConfigs, (config) => _.isEqual(config, oldConfig));
  if (targetIndex >= 0) {
    rawConfigs[targetIndex] = newConfig;
    launchConfigurations.update('configurations', rawConfigs);
  }
}
