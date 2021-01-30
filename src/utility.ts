import { Extension, ExtensionApi, extensions, Thenable, Uri, window } from 'coc.nvim';
import { IMainClassOption, resolveMainClass } from './languageServerPlugin';
import * as path from 'path';

const JAVA_EXTENSION_ID = 'redhat.java';
const DEBUGGER_EXTENSION_ID = 'coc-java-vimspector';

export function getJavaExtension(): Extension<ExtensionApi> | undefined {
  return extensions.all.find((value) => value.id === JAVA_EXTENSION_ID);
}

export async function searchMainMethods(uri?: Uri): Promise<IMainClassOption[]> {
  try {
    window.showMessage('Searching main classes...');
    return resolveMainClass(uri);
  } catch (ex) {
    window.showMessage(String((ex && ex.message) || ex), 'error');
    throw ex;
  }
}

export function getLauncherScriptPath() {
  const ext = extensions.all.find((value) => {
    value.id === DEBUGGER_EXTENSION_ID;
  });
  return path.join(ext!.extensionPath, 'scripts', 'launcher.bat');
}

export async function getJavaHome(): Promise<string> {
  const extensionApi = await getJavaExtensionAPI();
  if (extensionApi && extensionApi.javaRequirement) {
    return extensionApi.javaRequirement.java_home;
  }

  return '';
}

export function getJavaExtensionAPI(): Promise<ExtensionApi> | undefined {
  const extension = extensions.all.find((value) => value.id === JAVA_EXTENSION_ID);
  if (!extension) {
    window.showErrorMessage('VS Code Java Extension is not enabled.');
  }
  return new Promise<any>(async (resolve) => {
    resolve(await extension?.activate());
  });
}
