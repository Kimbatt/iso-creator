<script
    module
    lang="ts"
>
    import { SvelteMap } from "svelte/reactivity";
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
    import { onMount } from "svelte";

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
        subdirectories: SvelteMap<string, Directory>;
        files: SvelteMap<string, File>;

        // For display only

        parent: Directory | null;
        collapsed: boolean;
        selected: boolean;
    }
</script>

<script lang="ts">
    interface Props {
        rootDirectory: Directory;
    }

    let { rootDirectory = $bindable() }: Props = $props();

    let currentDirectory = $state(rootDirectory); // The file list of this directory is displayed

    let isEmpty = $derived(rootDirectory.files.size === 0 && rootDirectory.subdirectories.size === 0);

    let folderSelector: HTMLInputElement;
    let folderAdder: HTMLInputElement;
    let fileAdder: HTMLInputElement;

    function openPicker(input: HTMLInputElement) {
        input.value = "";
        input.click();
    }

    function selectFolder() {
        // TODO: show warning if the the file list is not empty

        rootDirectory.files.clear();
        rootDirectory.subdirectories.clear();

        selectDirectory(rootDirectory, false);

        addFiles(folderSelector);
    }
    function addFolder() {
        addFiles(folderAdder);
    }
    function addFile() {
        addFiles(fileAdder);
    }

    function addFiles(input: HTMLInputElement) {
        if (input.files === null || input.files.length === 0) {
            return;
        }

        for (const file of input.files) {
            let targetFolder = currentDirectory;

            if (file.webkitRelativePath !== "") {
                const segments = file.webkitRelativePath.split("/");

                // First segment is the root folder, last segment is the file name
                for (let i = 1; i < segments.length - 1; ++i) {
                    const segment = segments[i];

                    let childFolder = targetFolder.subdirectories.get(segment);
                    if (childFolder === undefined) {
                        const childFolder_: Directory = $state({
                            subdirectories: new SvelteMap(),
                            files: new SvelteMap(),
                            parent: targetFolder,
                            collapsed: true,
                            selected: false,
                        });

                        childFolder = childFolder_;

                        targetFolder.subdirectories.set(segment, childFolder);
                    }

                    targetFolder = childFolder;
                }
            }

            targetFolder.files.set(file.name, file);
        }
    }

    function selectDirectory(dir: Directory, toggleCollapsedIfNeeded: boolean) {
        const wasSelected = dir.selected;

        currentDirectory.selected = false;
        currentDirectory = dir;
        currentDirectory.selected = true;

        if (wasSelected) {
            if (toggleCollapsedIfNeeded) {
                dir.collapsed = !dir.collapsed;
            }
        } else {
            let parent: Directory | null = dir;
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
        const target = isDirectory ? currentDirectory.subdirectories : currentDirectory.files;
        target.delete(name);
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
        <button onclick={() => openPicker(folderSelector)}>Select folder</button>
        <button onclick={() => openPicker(folderAdder)}>Add folder</button>
        <button onclick={() => openPicker(fileAdder)}>Add files</button>
    </div>

    <div class="list-container">
        {#if isEmpty}
            <div class="empty-text">Load some files to begin</div>
        {:else}
            <div class="directory-list">
                {#snippet renderDirectory(name: string, dir: Directory, depth: number)}
                    {@const hasSubdirectories = dir.subdirectories.size !== 0}

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
                        {#each dir.subdirectories as [name, child]}
                            {@render renderDirectory(name, child, depth + 1)}
                        {/each}
                    {/if}
                {/snippet}

                {@render renderDirectory("Root directory", rootDirectory, 0)}
            </div>

            <div class="file-list">
                {#snippet renderEditButtons(name: string, isDirectory: boolean)}
                    <div class="edit-buttons">
                        <button onclick={() => removeFromCurrentDirectory(name, isDirectory)}>
                            <img src={DeleteIcon} />
                        </button>

                        <button>
                            <img src={EditIcon} />
                        </button>
                    </div>
                {/snippet}

                {#each currentDirectory.subdirectories as [name, dir]}
                    <button class="row directory-row">
                        <img
                            class="icon"
                            src={IconFolder}
                        />
                        <div
                            class="name"
                            onclick={() => selectDirectory(dir, false)}
                        >
                            {name}
                        </div>

                        {@render renderEditButtons(name, true)}
                    </button>
                {/each}

                {#each currentDirectory.files as [name]}
                    <div class="row file-row">
                        <img
                            class="icon"
                            src={getFileIcon(name)}
                        />
                        <div class="name">{name}</div>

                        {@render renderEditButtons(name, false)}
                    </div>
                {/each}
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
        flex-grow: 1;
        background-color: darkblue; // TEMP
        min-height: 20vh;
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

        > .empty-text {
            align-self: center;
            color: c.$color-placeholder;
            font-style: italic;
            user-select: none;
        }
    }

    .directory-list {
        display: flex;
        flex-direction: column;
        width: calc(min(300px, 40%));
        min-width: 100px;
        overflow: auto;
        padding: 8px;

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
            user-select: none;
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

        padding: 8px;

        > .row {
            display: flex;
            flex-direction: row;
            align-items: center;

            height: 24px;
            padding: 4px 2px;
            box-sizing: border-box;
            border: 2px solid transparent;
            border-radius: 4px;
            margin: 0px;

            background-color: transparent;
            transition: none;

            overflow: visible;
            position: relative;

            > .icon {
                pointer-events: none;
                user-select: none;

                width: 24px;
                height: 24px;
            }

            > .name {
                padding: 0px 4px;
                flex: 1 1 0px;
                text-align: start;
                font-size: 16px;
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
                        padding: 4px;
                        width: 24px;
                        height: 24px;
                    }
                }
            }

            &:hover {
                border-color: $border-highlight-color;
            }
            &:hover > .edit-buttons {
                visibility: visible;
            }
        }
    }
</style>
