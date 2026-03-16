<script
    module
    lang="ts"
>
    import ArrowRight from "./assets/chevron-right.svg";
    import EditIcon from "./assets/edit.svg";
    import DeleteIcon from "./assets/trash-x.svg";
    import IconFolder from "./assets/folder.svg";
    import IconFile from "./assets/file.svg";

    import Icon3D from "./assets/3d.svg";
    import IconBinary from "./assets/assembly.svg";
    import IconAudio from "./assets/audio.svg";
    import IconConsole from "./assets/console.svg";
    import IconDisc from "./assets/disc.svg";
    import IconDll from "./assets/dll.svg";
    import IconDocument from "./assets/document.svg";
    import IconExe from "./assets/exe.svg";
    import IconFont from "./assets/font.svg";
    import IconWeb from "./assets/http.svg";
    import IconImage from "./assets/image.svg";
    import IconText from "./assets/log.svg";
    import IconPDF from "./assets/pdf.svg";
    import IconSpreadsheet from "./assets/table.svg";
    import IconCode from "./assets/templ.svg";
    import IconVideo from "./assets/video.svg";
    import IconCompressed from "./assets/zip.svg";

    import { onMount, untrack } from "svelte";
    import { maxVolumeNameLength } from "./iso9660";
    import { showDialog } from "./FullscreenDialog.svelte";
    import { LinkedList } from "./LinkedList.svelte";

    const fileIconMap = new Map<string, string>();
    function setupIcons(icon: string, ...extensions: string[]) {
        for (const ext of extensions) {
            fileIconMap.set(ext, icon);
        }
    }

    setupIcons(Icon3D, "stl", "obj", "glb", "gltf", "fbx", "ply", "3mf", "blend", "dae", "usd", "usda", "usdc", "usdz");
    setupIcons(IconBinary, "bin");
    setupIcons(IconAudio, "mp3", "wav", "wma", "ogg", "opus", "flac", "aac", "amr", "mid");
    setupIcons(IconConsole, "bat", "cmd", "sh");
    setupIcons(IconDisc, "iso", "img", "cue", "vhd", "vhdx");
    setupIcons(IconDll, "dll", "lib", "so", "dylib", "a");
    setupIcons(IconDocument, "doc", "docx", "ppt", "pptx", "pps", "ppsx", "odf");
    setupIcons(IconExe, "exe", "msi");
    setupIcons(IconFont, "ttf", "otf", "woff", "woff2");
    setupIcons(IconWeb, "html", "htm", "xml", "php");
    setupIcons(
        IconImage,
        "jpg",
        "jpeg",
        "png",
        "bmp",
        "tga",
        "tiff",
        "webp",
        "gif",
        "ico",
        "dds",
        "svg",
        "psd",
        "ai",
        "xcf",
    );
    setupIcons(IconText, "txt", "log");
    setupIcons(IconPDF, "pdf");
    setupIcons(IconSpreadsheet, "xls", "xlsx", "csv");
    setupIcons(
        IconCode,
        "asm",
        "c",
        "cc",
        "cpp",
        "cs",
        "css",
        "cxx",
        "go",
        "h",
        "hs",
        "hpp",
        "java",
        "js",
        "kt",
        "lua",
        "m",
        "mm",
        "py",
        "rs",
        "swift",
        "ts",
    );
    setupIcons(IconVideo, "mp4", "mov", "mpg", "mpeg", "mkv", "avi", "webm", "flv");
    setupIcons(IconCompressed, "zip", "rar", "gz", "xz", "br", "lzma", "tar");

    export interface Directory {
        subdirectories: LinkedList<Directory>;
        files: LinkedList<File>;
    }

    interface DirectoryInternal {
        name: string;
        subdirectories: LinkedList<DirectoryInternal>;
        files: LinkedList<File>;

        parent: DirectoryInternal | null;
        collapsed: boolean;
        selected: boolean;
    }

    let rootDirectory = $state<DirectoryInternal>({
        name: "",
        files: new LinkedList(),
        subdirectories: new LinkedList(),
        parent: null,
        collapsed: false,
        selected: false,
    });

    let rootDirectoryName: string | null = $state(null);

    export function getRootDirectory() {
        return untrack(
            (): Directory => ({
                files: rootDirectory.files,
                subdirectories: rootDirectory.subdirectories,
            }),
        );
    }

    export function isRootDirectoryEmpty() {
        return rootDirectory.files.isEmpty() && rootDirectory.subdirectories.isEmpty();
    }

    export function getRootDirectoryName() {
        return rootDirectoryName;
    }

    const stringComparer = new Intl.Collator().compare;

    async function rename(
        nameRef: { name: string },
        isDirectory: boolean,
        parentDirectory: DirectoryInternal,
        renameNewFile: boolean,
        acceptOriginalName: boolean,
    ): Promise<boolean> {
        let dialogMessage: string | null = null;
        let editingName = nameRef.name;
        const originalName = nameRef.name;

        while (true) {
            const dialogResult = await showDialog(
                "Enter a new name:",
                dialogMessage,
                ["Cancel", "OK"] as const,
                editingName,
                "OK",
            );

            if (dialogResult.button === "Cancel") {
                return false;
            }

            const newName = dialogResult.resultText;
            if (newName === undefined) {
                // Shouldn't happen
                continue;
            }

            if (acceptOriginalName && newName === originalName) {
                return false;
            }

            if (newName.length === 0) {
                dialogMessage = "Name cannot be empty";
                continue;
            }

            const target = isDirectory ? parentDirectory.subdirectories : parentDirectory.files;

            let renamed = false;
            if (renameNewFile) {
                renamed = target.get(newName) === undefined;
            } else {
                renamed = target.changeKey(originalName, newName);
                if (renamed) {
                    target.sortByKey(stringComparer);
                }
            }

            if (renamed) {
                nameRef.name = newName;
                return true;
            }

            editingName = newName;
            dialogMessage = `A ${isDirectory ? "folder" : "file"} with this name already exists`;
        }
    }
</script>

<script lang="ts">
    let currentDirectory = $state(rootDirectory); // The file list of this directory is displayed

    let isEmpty = $derived.by(isRootDirectoryEmpty);

    let folderSelector: HTMLInputElement;
    let folderAdder: HTMLInputElement;
    let fileAdder: HTMLInputElement;

    async function openPicker(input: HTMLInputElement, showConfirmation: boolean) {
        if (showConfirmation && !isEmpty) {
            const dialogResult = await showDialog(
                "Selecting a new folder will clear all files and folders.\nDo you want to continue?",
                null,
                ["Cancel", "Yes"] as const,
            );
            if (dialogResult.button === "Cancel") {
                return;
            }
        }

        input.value = "";
        input.click();
    }

    async function selectFolder() {
        rootDirectory.files.clear();
        rootDirectory.subdirectories.clear();

        selectDirectory(rootDirectory, false);

        await addFiles(folderSelector, false);

        // Always set to null first to trigger change
        rootDirectoryName = null;

        if (folderSelector.files !== null && folderSelector.files.length !== 0) {
            rootDirectoryName = folderSelector.files[0].webkitRelativePath
                .split("/")[0]
                .substring(0, maxVolumeNameLength);
        }
    }
    async function addFolder() {
        await addFiles(folderAdder, true);
    }
    async function addFile() {
        await addFiles(fileAdder, false);
    }

    const affectedDirectories = new Set<DirectoryInternal>();

    async function addFiles(input: HTMLInputElement, includeRootFolder: boolean) {
        if (input.files === null || input.files.length === 0) {
            return;
        }

        affectedDirectories.clear();

        let skipAll = false;
        let overwriteAll = false;

        let newFileName: string | null = null; // For renaming files that are being added

        const segmentStartIndex = includeRootFolder ? 0 : 1;
        for (let i = 0; i < input.files.length; ++i) {
            const file = input.files[i];

            let targetFolder = currentDirectory;

            if (file.webkitRelativePath !== "") {
                const segments = file.webkitRelativePath.split("/");

                // First segment is the root folder, last segment is the file name
                for (let i = segmentStartIndex; i < segments.length - 1; ++i) {
                    const segment = segments[i];

                    let childFolder = targetFolder.subdirectories.get(segment);
                    if (childFolder === undefined) {
                        const childFolder_ = $state<DirectoryInternal>({
                            name: segment,
                            subdirectories: new LinkedList<DirectoryInternal>(),
                            files: new LinkedList<File>(),
                            parent: targetFolder,
                            collapsed: true,
                            selected: false,
                        });

                        childFolder = targetFolder.subdirectories.pushBack(segment, childFolder_);
                        affectedDirectories.add(targetFolder);
                    }

                    targetFolder = childFolder.value;
                }
            }

            newFileName ??= file.name;
            const existingFile = targetFolder.files.get(newFileName);
            let cancel = false;

            let skipCurrent = false;
            let overwriteCurrent = false;

            if (existingFile !== undefined) {
                if (skipAll) {
                    skipCurrent = true;
                } else if (overwriteAll) {
                    overwriteCurrent = true;
                } else {
                    const segments = [newFileName];
                    let parent: DirectoryInternal | null = targetFolder;
                    while (true) {
                        const dir = parent;
                        parent = parent.parent;
                        if (parent === null) {
                            break;
                        }

                        segments.push(dir.name);
                    }

                    segments.reverse();

                    const dialogResult = await showDialog(
                        "A file with the same name already exists:",
                        segments.join("/\n"),
                        [
                            "Overwrite all",
                            "Overwrite",
                            "Skip all",
                            "Skip",
                            "Rename new file",
                            "Rename existing file",
                            "Cancel",
                        ] as const,
                    );

                    switch (dialogResult.button) {
                        case "Overwrite all":
                            overwriteAll = true;
                        // Fallthrough

                        case "Overwrite":
                            overwriteCurrent = true;
                            break;

                        case "Skip all":
                            skipAll = true;
                        // Fallthrough

                        case "Skip":
                            skipCurrent = true;
                            break;

                        case "Rename existing file": {
                            await rename({ name: file.name }, false, targetFolder, false, false);
                            // Check again
                            --i;
                            continue;
                        }

                        case "Rename new file": {
                            const nameRef: { name: string } = { name: newFileName };
                            const renamed = await rename(nameRef, false, targetFolder, true, false);
                            if (renamed) {
                                newFileName = nameRef.name;
                            }

                            --i;
                            continue;
                        }

                        case "Cancel":
                            cancel = true;
                            break;
                    }
                }

                if (overwriteCurrent) {
                    targetFolder.files.remove(existingFile);
                    targetFolder.files.pushBack(newFileName, file);
                } else if (skipCurrent) {
                    // Nothing
                }
            } else {
                targetFolder.files.pushBack(newFileName, file);
            }

            affectedDirectories.add(targetFolder);
            newFileName = null;

            if (cancel) {
                break;
            }
        }

        for (const dir of affectedDirectories) {
            dir.files.sortByKey(stringComparer);
            dir.subdirectories.sortByKey(stringComparer);
        }
    }

    function selectDirectory(dir: DirectoryInternal, toggleCollapsedIfNeeded: boolean) {
        const wasSelected = dir.selected;

        currentDirectory.selected = false;
        currentDirectory = dir;
        currentDirectory.selected = true;

        if (wasSelected) {
            if (toggleCollapsedIfNeeded) {
                dir.collapsed = !dir.collapsed;
            }
        } else {
            let parent: DirectoryInternal | null = dir;
            while (parent !== null) {
                parent.collapsed = false;
                parent = parent.parent;
            }
        }
    }

    function getFileIcon(name: string) {
        const dotIndex = name.lastIndexOf(".");
        if (dotIndex < 0) {
            return IconFile;
        }

        const ext = name.substring(dotIndex + 1).toLowerCase();
        return fileIconMap.get(ext) ?? IconFile;
    }

    function removeFromCurrentDirectory(name: string, isDirectory: boolean) {
        if (isDirectory) {
            const node = currentDirectory.subdirectories.get(name);
            if (node !== undefined) {
                currentDirectory.subdirectories.remove(node);
            }
        } else {
            const node = currentDirectory.files.get(name);
            if (node !== undefined) {
                currentDirectory.files.remove(node);
            }
        }
    }

    onMount(() => {
        selectDirectory(rootDirectory, false);
    });
</script>

<div class="container">
    <input
        type="file"
        style="display: none;"
        webkitdirectory
        onchange={selectFolder}
        bind:this={folderSelector}
    />

    <input
        type="file"
        style="display: none;"
        webkitdirectory
        multiple
        onchange={addFolder}
        bind:this={folderAdder}
    />

    <input
        type="file"
        style="display: none;"
        multiple
        onchange={addFile}
        bind:this={fileAdder}
    />

    <div class="import-buttons">
        <button onclick={() => openPicker(folderSelector, true)}>Select folder</button>
        <button onclick={() => openPicker(folderAdder, false)}>Add folder</button>
        <button onclick={() => openPicker(fileAdder, false)}>Add files</button>
    </div>

    <div class="list-container">
        {#if isEmpty}
            <div class="empty-text">Load some files to begin</div>
        {:else}
            <div class="directory-list">
                {#snippet renderDirectory(name: string, dir: DirectoryInternal, depth: number)}
                    {@const hasSubdirectories = dir.subdirectories.length !== 0}

                    <div
                        style:margin-left={`${depth * 10}px`}
                        class:selected={dir.selected}
                    >
                        <label style:visibility={hasSubdirectories ? null : "hidden"}>
                            <input
                                type="checkbox"
                                bind:checked={dir.collapsed}
                            />
                            <img
                                class="arrow"
                                src={ArrowRight}
                            />
                        </label>

                        <button onclick={() => selectDirectory(dir, true)}>{name}</button>
                    </div>

                    {#if !dir.collapsed}
                        {#each dir.subdirectories as node (node.key)}
                            {@render renderDirectory(node.key, node.value, depth + 1)}
                        {/each}
                    {/if}
                {/snippet}

                {@render renderDirectory("Root directory", rootDirectory, 0)}
            </div>

            <div class="separator"></div>

            <div class="file-list">
                {#snippet renderEditButtons(name: string, isDirectory: boolean)}
                    <div class="edit-buttons">
                        <button onclick={() => removeFromCurrentDirectory(name, isDirectory)}>
                            <img src={DeleteIcon} />
                        </button>

                        <button onclick={() => rename({ name }, isDirectory, currentDirectory, false, true)}>
                            <img src={EditIcon} />
                        </button>
                    </div>
                {/snippet}

                {#if currentDirectory.subdirectories.isEmpty() && currentDirectory.files.isEmpty()}
                    <div class="empty-text">Folder is empty</div>
                {:else}
                    {#each currentDirectory.subdirectories as node (node.key)}
                        <div class="row-container">
                            <button
                                class="row directory-row"
                                onclick={() => selectDirectory(node.value, false)}
                            >
                                <img
                                    class="icon"
                                    src={IconFolder}
                                />
                                <div class="name">
                                    {node.key}
                                </div>
                            </button>

                            {@render renderEditButtons(node.key, true)}
                        </div>
                    {/each}

                    {#each currentDirectory.files as node (node.key)}
                        <div class="row-container">
                            <div class="row file-row">
                                <img
                                    class="icon"
                                    src={getFileIcon(node.key)}
                                />
                                <div class="name">{node.key}</div>
                            </div>

                            {@render renderEditButtons(node.key, false)}
                        </div>
                    {/each}
                {/if}
            </div>
        {/if}
    </div>
</div>

<style lang="scss">
    @use "./Constants.scss" as c;

    $border-highlight-color: #a0a0a0;

    .container {
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex-grow: 5;
        flex-basis: 0px;
        min-height: 250px;
        overflow-y: auto;
    }

    .import-buttons {
        display: flex;
        flex-direction: row;
        gap: 8px;
    }

    .list-container {
        display: flex;
        flex-direction: row;
        justify-content: center;
        flex-grow: 1;
        overflow-y: auto;

        border: 2px solid c.$color-border;
        border-radius: c.$default-border-radius;

        > .separator {
            background-color: c.$color-border;
            width: 2px;
            flex-grow: 0;
            flex-shrink: 0;

            border-radius: 2px;
            margin: 8px 0px;
        }
    }

    .directory-list {
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
        width: calc(min(300px, 35%));
        min-width: 100px;
        overflow: auto;
        padding: 8px;
        padding-left: 4px;
        user-select: none;

        > div {
            display: flex;
            flex-direction: row;
            align-items: center;

            &.selected > button {
                background-color: c.$color-primary;
            }
        }

        label {
            > .arrow {
                width: 20px;
                height: 20px;

                pointer-events: none;
            }

            &:hover > .arrow {
                filter: brightness(0.7);
            }

            cursor: pointer;
            display: flex;
            justify-content: center;
            align-items: center;
            width: 16px;
            height: 16px;
        }

        input[type="checkbox"] {
            &:not(:checked) + .arrow {
                transform: rotate(90deg);
            }

            display: none;
        }

        button {
            padding: 0px 2px;
            margin-left: 2px;
            flex: 1 1 0px;
            text-align: start;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 16px;
            background-color: transparent;
            transition: none;
            border-radius: 4px;
            overflow: hidden;

            border: 2px solid transparent;

            &:hover {
                border-color: $border-highlight-color;
            }
        }
    }

    .file-list {
        display: flex;
        flex-direction: column;
        flex-grow: 1;
        overflow-y: auto;

        padding: 8px 4px;

        > .row-container {
            display: flex;
            flex-direction: row;
            align-items: center;
            flex-grow: 0;
            flex-shrink: 0;
            position: relative;

            height: 24px;
            box-sizing: border-box;
            border-radius: 4px;

            border: 2px solid transparent;

            &:hover {
                border-color: $border-highlight-color;
            }
            &:hover > .edit-buttons {
                visibility: visible;
            }

            > .row {
                display: flex;
                flex-direction: row;
                align-items: center;
                flex-grow: 1;

                background-color: transparent;
                transition: none;

                overflow: hidden;

                padding: 4px 2px;
                margin: 0px;

                user-select: none;

                > .icon {
                    pointer-events: none;

                    width: 20px;
                    height: 20px;
                }

                > .name {
                    padding: 0px 4px;
                    flex: 1 1 0px;
                    text-align: start;
                    font-size: 16px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
            }

            > .edit-buttons {
                display: flex;
                flex-direction: row;
                align-items: center;
                gap: 4px;

                visibility: hidden;

                position: absolute;
                right: 4px;

                > button {
                    padding: 0px;
                    display: flex;
                    justify-content: center;
                    align-items: center;

                    > img {
                        pointer-events: none;

                        padding: 4px;
                        width: 24px;
                        height: 24px;
                    }
                }
            }
        }
    }

    .empty-text {
        align-self: center;
        color: c.$color-placeholder;
        font-style: italic;
        user-select: none;
    }
</style>
