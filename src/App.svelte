<script
    module
    lang="ts"
>
    import { SvelteMap } from "svelte/reactivity";
    import GithubIcon from "./assets/github.svg";
    import DirectoryEditor, { type Directory } from "./DirectoryEditor.svelte";
    import {
        createISO,
        FileSystemNodeType,
        type InputFileSystemDirectoryNode,
        type IsoCreationParameters,
    } from "./iso9660";

    let downloadLink: HTMLAnchorElement;
    const params: IsoCreationParameters = {
        volumeName: "test 1234",
    };
</script>

<script lang="ts">
    let rootDirectory: Directory = $state({
        files: new SvelteMap(),
        subdirectories: new SvelteMap(),
        parent: null,
        collapsed: false,
        selected: false,
    });

    async function download() {
        if (rootDirectory.files.size === 0 && rootDirectory.subdirectories.size === 0) {
            return;
        }

        const inputRootDirectory: InputFileSystemDirectoryNode = {
            type: FileSystemNodeType.Directory,
            children: [],
            name: "root",
        };

        const visit = (inputDirectory: InputFileSystemDirectoryNode, directory: Directory) => {
            for (const [name, file] of directory.files) {
                inputDirectory.children.push({
                    type: FileSystemNodeType.File,
                    name,
                    contents: file,
                    date: new Date(file.lastModified),
                });
            }

            for (const [name, subdirectory] of directory.subdirectories) {
                const inputSubdirectory: InputFileSystemDirectoryNode = {
                    type: FileSystemNodeType.Directory,
                    name,
                    children: [],
                };

                inputDirectory.children.push(inputSubdirectory);
                visit(inputSubdirectory, subdirectory);
            }
        };

        visit(inputRootDirectory, rootDirectory);

        const result = createISO(inputRootDirectory, params);
        if (!result.success) {
            console.error(result.errors);
            return;
        }

        const blob = new Blob(result.result);
        const url = URL.createObjectURL(blob);

        downloadLink.href = url;
        downloadLink.download = "test.iso";
        downloadLink.click();

        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 2000);
    }
</script>

<div class="page">
    <a
        class="github-link"
        href="https://github.com/Kimbatt/iso-creator"
    >
        <img src={GithubIcon} />
    </a>

    <a
        bind:this={downloadLink}
        style="display: none"
    ></a>

    <div class="title">Create ISO files online</div>

    <DirectoryEditor bind:rootDirectory />

    <button
        onclick={download}
        disabled={rootDirectory.files.size === 0 && rootDirectory.subdirectories.size === 0}
    >
        Download
    </button>
</div>

<style lang="scss">
    @use "./Constants.scss" as c;

    :global {
        body {
            background: c.$color-background;
            color: c.$color-text;
            font-family: c.$default-font;
            font-size: c.$font-size-default;
            margin: 0px;
        }

        button,
        input,
        select {
            font-family: c.$default-font;
        }

        button {
            background-color: c.$color-primary;
            border: none;
            border-radius: c.$default-border-radius;
            color: c.$color-text;
            padding: 8px 16px;
            font-size: c.$font-size-default;
            cursor: pointer;
            transition:
                background-color c.$default-transition-linear,
                opacity 0.5s;
            outline: none;

            &:hover {
                background-color: c.$color-primary-hover;
                cursor: pointer;
            }

            &:disabled {
                background-color: c.$color-primary-disabled;
                cursor: not-allowed;
            }
        }

        input,
        select {
            color: c.$color-text;
            background-color: c.$color-input-background;
            border: c.$dark-border;
            border-radius: c.$default-border-radius;
            line-height: 30px;
            opacity: 1;

            transition:
                color c.$default-transition-linear,
                background-color c.$default-transition-linear,
                filter c.$default-transition-linear;

            &:disabled {
                color: c.$color-text-disabled;
                filter: brightness(0.8);
                background-color: c.$color-background-disabled;
                cursor: not-allowed;
            }
        }

        input[type="text"]::placeholder {
            color: c.$color-placeholder;
            font-style: italic;
        }

        a {
            color: #609dff;
        }

        select {
            font-size: c.$font-size-default;
            padding: 4px 2px;
            border-radius: c.$default-border-radius;
        }
    }

    .page {
        position: relative;
        padding: 20px;
        margin: auto;

        display: flex;
        flex-direction: column;
        gap: 20px;

        max-width: 1200px;
        max-height: 100vh;
        box-sizing: border-box;
    }

    .title {
        font-size: c.$font-size-title;
    }

    .github-link {
        position: absolute;
        width: 32px;
        height: 32px;
        top: 20px;
        right: 20px;
    }
</style>
