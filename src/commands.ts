// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, extensions, workspace, Extension, ExtensionInfo, ExtensionState } from 'coc.nvim';
import * as utility from './utility';

export const VSCODE_STARTDEBUG = 'vscode.startDebug';

export const VSCODE_ADD_DEBUGCONFIGURATION = 'debug.addConfiguration';

export const JAVA_START_DEBUGSESSION = 'vscode.java.startDebugSession';

export const JAVA_RESOLVE_CLASSPATH = 'vscode.java.resolveClasspath';

export const JAVA_RESOLVE_MAINCLASS = 'vscode.java.resolveMainClass';

export const JAVA_VALIDATE_LAUNCHCONFIG = 'vscode.java.validateLaunchConfig';

export const JAVA_BUILD_WORKSPACE = 'java.workspace.compile';

export const JAVA_EXECUTE_WORKSPACE_COMMAND = 'java.execute.workspaceCommand';

export const JAVA_FETCH_USAGE_DATA = 'vscode.java.fetchUsageData';

export const JAVA_UPDATE_DEBUG_SETTINGS = 'vscode.java.updateDebugSettings';

export const JAVA_RESOLVE_MAINMETHOD = 'vscode.java.resolveMainMethod';

export const JAVA_INFER_LAUNCH_COMMAND_LENGTH = 'vscode.java.inferLaunchCommandLength';

export const JAVA_CHECK_PROJECT_SETTINGS = 'vscode.java.checkProjectSettings';

export const JAVA_RESOLVE_ELEMENT_AT_SELECTION = 'vscode.java.resolveElementAtSelection';

export const JAVA_RESOLVE_BUILD_FILES = 'vscode.java.resolveBuildFiles';

export const JAVA_IS_ON_CLASSPATH = 'vscode.java.isOnClasspath';

export const JAVA_RESOLVE_JAVAEXECUTABLE = 'vscode.java.resolveJavaExecutable';

export const JAVA_FETCH_PLATFORM_SETTINGS = 'vscode.java.fetchPlatformSettings';

export const JAVA_RESOLVE_CLASSFILTERS = 'vscode.java.resolveClassFilters';

export const JAVA_RESOLVE_SOURCE_URI = 'vscode.java.resolveSourceUri';

/**
 * vscode-java-debug command to start a debug session.
 */
export const JAVA_START_DEBUG_SESSION = 'vscode.java.startDebugSession';

/**
 * coc command to start a java debugger session and connect vimspector to it.
 */
export const JAVA_DEBUG_VIMSPECTOR_START = 'java.debug.vimspector.start1';

/**
 * Execute Workspace Command
 */
export const EXECUTE_WORKSPACE_COMMAND = 'java.execute.workspaceCommand';

export function executeJavaLanguageServerCommand(...rest) {
  return executeJavaExtensionCommand(JAVA_EXECUTE_WORKSPACE_COMMAND, ...rest);
}

export async function executeJavaExtensionCommand(commandName: string, ...rest) {
  // TODO: need to handle error and trace telemetry
  // const javaExtension = utility.getJavaExtension();
  // if (!javaExtension) {
  // workspace.showMessage(`Cannot execute command ${commandName}, VS Code Java Extension is not enabled.`);
  // }
  // if (!javaExtension.isActive) {
  // await javaExtension.activate();
  // }
  return commands.executeCommand(commandName, ...rest);
}
