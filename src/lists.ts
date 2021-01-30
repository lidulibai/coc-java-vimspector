import { BasicList, ListAction, ListItem, Neovim } from 'coc.nvim';
import { runJavaFile } from '.';
import { IMainClassOption } from './languageServerPlugin';
import { searchMainMethods } from './utility';

export default class DemoList extends BasicList {
  public readonly name = 'mainClassListRun';
  public readonly description = 'CocList for coc-java-vimspector';
  public readonly defaultAction = 'run';
  public actions: ListAction[] = [];

  constructor(nvim: Neovim) {
    super(nvim);

    this.addAction('run', (item: ListItem) => {
      runJavaFile(<string>item.location, true);
    });
  }

  public async loadItems(): Promise<ListItem[]> {
    const mainClasses: IMainClassOption[] = await searchMainMethods();
    const result: Array<ListItem> = [];
    mainClasses.forEach((value) => {
      result.push({
        label: `${value.mainClass} : ${value.filePath}`,
        location: value.filePath,
      });
    });
    return result;
  }
}
