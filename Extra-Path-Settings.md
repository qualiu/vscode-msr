# Specific Extra Search Paths Settings

If you want to set extra search paths for **a specific project**, use below format to set extra `paths` or `path-list-files`:

- Value format: `[Global-Paths]`; `[Project1-Folder-Name = Path1, Path2, Path3]`; `[Project2-Folder-Name=Path5,Path6]`;
- Use **semicolon** '**;**' to separate `groups`. A `[group]` is either `global-paths` or a `name=paths` pair.
- Use **comma** '**,**' to separate paths in a `[group]`.
- You can omit `global-paths` or `name=paths` pairs. Just set what you want, like one or more paths (global).

**For example**, if you have 2 projects: `d:\git\`**project1** + `d:\git\`**project2** + a common/global path = `D:\myLibs\boost`

You can set values for the projects like below, and their `extra search paths` will be below:

- `msr.default.extraSearchPaths`
  - Set value like: `D:\myLibs\boost; project1 = D:\git\baseLib,D:\git\teamLib; project2=d:\git\project1;`
  - Then paths will be:
    - **project1** extra search paths = `D:\myLibs\boost,D:\git\baseLib,D:\git\teamLib`
    - **project2** extra search paths = `D:\myLibs\boost,d:\git\project1`
- `msr.default.extraSearchPathListFiles`
  - Set value like: `project1=d:\paths1.txt,D:\paths2.txt; project2 = d:\paths3.txt`
  - Then paths will be:
    - **project1** extra search path list files = `d:\paths1.txt,D:\paths2.txt`
    - **project2** extra search path list files = `d:\paths3.txt`

**Since 1.0.7** : Much easier to set in [your personal settings file](https://code.visualstudio.com/docs/getstarted/settings#_settings-file-locations) like `%APPDATA%\Code\User\settings.json` on Windows:

- `msr.project1.extraSearchPaths` : `"D:\myLibs\boost,D:\git\baseLib,D:\git\teamLib"`
- `msr.project2.extraSearchPaths` : `"D:\myLibs\boost,d:\git\project1"`

- Same to `msr.xxx.extraSearchPathListFiles` settings.

- You can also use `msr.default.extraSearchPathGroups` + `msr.default.extraSearchPathListFileGroups` which should use **array** values like:

```json
"msr.default.extraSearchPathGroups": [
    "D:\\myLibs\\boost, d:\\myLibs\\common",
    "Project1 = D:\\git\\baseLib, D:\\git\\teamLib",
    "Project2 = D:\\git\\Project1 , D:\\git\\baseLib , D:\\git\\teamLib"
]
```

You can also set extra search paths for each type of coding language.
