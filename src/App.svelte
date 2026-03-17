<script lang="ts">
    import GithubIcon from "./assets/github.svg";
    import DirectoryEditor, {
        getRootDirectory,
        getRootDirectoryName,
        isRootDirectoryEmpty,
        type Directory,
    } from "./DirectoryEditor.svelte";
    import FullscreenDialog from "./FullscreenDialog.svelte";
    import {
        createISO,
        FileOrDirectoryNameValidationResult,
        FileSystemNodeType,
        IsoCreationErrorCode,
        maxFileOrDirectoryNameLength,
        maxVolumeNameLength,
        validateVolumeName,
        VolumeNameValidationResult,
        type InputFileSystemDirectoryNode,
        type IsoCreationError,
    } from "./iso9660";

    let downloadLink: HTMLAnchorElement;

    let isEmpty = $derived.by(isRootDirectoryEmpty);
    let volumeName = $state(
        (() => {
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth() + 1;
            const day = now.getDate();

            const pad = (value: number) => value.toString().padStart(2, "0");

            return `${year}_${pad(month)}_${pad(day)}`;
        })(),
    );

    let volumeNameValidationResult = $derived(validateVolumeName(volumeName));

    let creationErrors: IsoCreationError[] = $state([]); // These errors don't disable the download button, because they are not known in advance
    let canDownload = $derived(
        !isEmpty && volumeName.length > 0 && volumeNameValidationResult === VolumeNameValidationResult.Ok,
    );
    let hasErrors = $derived(
        (volumeNameValidationResult !== VolumeNameValidationResult.Ok &&
            volumeNameValidationResult !== VolumeNameValidationResult.Empty) ||
            creationErrors.length > 0,
    );

    $effect(() => {
        const rootDirectoryName = getRootDirectoryName();
        if (rootDirectoryName !== null) {
            volumeName = rootDirectoryName;
        }

        creationErrors = [];
    });

    const errorTextNameTooLong = `Disk image name must not be longer than ${maxVolumeNameLength} characters`;
    const errorTextNameInvalidCharacters =
        "Disk image name can only contain english characters, numbers, and symbols (character codes 32 to 126)";

    async function download() {
        const inputRootDirectory: InputFileSystemDirectoryNode = {
            type: FileSystemNodeType.Directory,
            children: [],
            name: "root",
        };

        const visit = (inputDirectory: InputFileSystemDirectoryNode, directory: Directory) => {
            for (const node of directory.files) {
                inputDirectory.children.push({
                    type: FileSystemNodeType.File,
                    name: node.key,
                    contents: node.value,
                    date: new Date(node.value.lastModified),
                });
            }

            for (const node of directory.subdirectories) {
                const inputSubdirectory: InputFileSystemDirectoryNode = {
                    type: FileSystemNodeType.Directory,
                    name: node.key,
                    children: [],
                };

                inputDirectory.children.push(inputSubdirectory);
                visit(inputSubdirectory, node.value);
            }
        };

        visit(inputRootDirectory, getRootDirectory());

        const result = createISO(inputRootDirectory, {
            volumeName,
        });

        if (!result.success) {
            creationErrors = result.errors;
            return;
        }

        creationErrors = [];

        const blob = new Blob(result.result);
        const url = URL.createObjectURL(blob);

        downloadLink.href = url;
        downloadLink.download = `${volumeName}.iso`;
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

    <DirectoryEditor />

    <div class="input-container">
        <div>Disk image name</div>
        <input
            type="text"
            placeholder="Name is empty"
            bind:value={volumeName}
        />
    </div>

    <div
        class="error-text-container"
        style:visibility={hasErrors ? null : "hidden"}
    >
        {#if volumeNameValidationResult === VolumeNameValidationResult.InvalidCharacter}
            <div>{errorTextNameInvalidCharacters}</div>
        {:else if volumeNameValidationResult === VolumeNameValidationResult.TooLong}
            <div>{errorTextNameTooLong}</div>
        {/if}

        {#if creationErrors.length === 1}
            <div>An error occurred during disk image creation:</div>
        {:else if creationErrors.length > 1}
            <div>Errors occurred during disk image creation:</div>
        {/if}
        {#each creationErrors as error}
            {@const errorText = ((): string => {
                switch (error.type) {
                    case IsoCreationErrorCode.InvalidFileOrDirectoryName: {
                        const prefix = error.isDirectory ? "Folder" : "File";

                        switch (error.validationResult) {
                            case FileOrDirectoryNameValidationResult.Ok:
                                // Shouldn't happen
                                return "";

                            case FileOrDirectoryNameValidationResult.Empty:
                                return `${prefix} name must not be empty`;

                            case FileOrDirectoryNameValidationResult.InvalidCharacter:
                                return `${prefix} name cannot contain any of the following characters: < > : \\ / | ? *`;

                            case FileOrDirectoryNameValidationResult.TooLong:
                                return `${prefix} name is too long (maximum length is ${maxFileOrDirectoryNameLength} characters)`;
                        }
                    }

                    case IsoCreationErrorCode.NameAlreadyExists:
                        return `A file and a folder has the same name - this is not allowed`;

                    case IsoCreationErrorCode.TooManyDirectories:
                        return `The ISO file format doesn't allow more than 65535 total folders in a single disk image file`;

                    case IsoCreationErrorCode.InvalidVolumeName: {
                        // We shouldn't get this error, since the UI only allows the creation if the volume name is valid

                        switch (error.validationResult) {
                            case VolumeNameValidationResult.Ok:
                            case VolumeNameValidationResult.Empty:
                                return ""; // Shouldn't happen

                            case VolumeNameValidationResult.InvalidCharacter:
                                return errorTextNameInvalidCharacters;
                            case VolumeNameValidationResult.TooLong:
                                return errorTextNameTooLong;
                        }
                    }
                }
            })()}

            {#if error.type === IsoCreationErrorCode.InvalidFileOrDirectoryName || error.type === IsoCreationErrorCode.NameAlreadyExists}
                <div class="error-with-path">
                    <div>{errorText}</div>
                    <span>Path:</span>
                    <code>{error.path.join("\n")}</code>
                </div>
            {:else}
                <div>{errorText}</div>
            {/if}
        {/each}
    </div>

    <button
        onclick={download}
        disabled={!canDownload}
    >
        Download
    </button>
</div>

<FullscreenDialog />

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

        input[type="text"] {
            font-size: c.$font-size-default;
            padding: 5px;

            &::placeholder {
                color: c.$color-placeholder;
                font-style: italic;
            }
        }

        a {
            color: #609dff;
        }

        select {
            font-size: c.$font-size-default;
            padding: 4px 2px;
            border-radius: c.$default-border-radius;
        }

        #app {
            position: relative;
        }
    }

    .page {
        padding: 20px;
        margin: auto;

        display: flex;
        flex-direction: column;
        gap: 20px;

        max-width: 1200px;
        min-height: 100vh;
        box-sizing: border-box;
    }

    .input-container {
        display: flex;
        flex-direction: column;
        gap: 8px;

        > div {
            user-select: none;
        }
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

    .error-text-container {
        font-size: c.$font-size-default;
        color: #ff4040;
        white-space: pre-line;

        display: flex;
        flex-direction: column;
        gap: 16px;

        flex-grow: 1;
        overflow-y: auto;
        max-height: 200px;

        > .error-with-path {
            display: flex;
            flex-direction: column;
            gap: 2px;
            color: c.$color-text;

            background-color: #7b1e1e;
            border-radius: c.$default-border-radius;
            padding: 8px;

            > * {
                margin: 0px;
            }

            code {
                background-color: #361010;
                padding: 2px 4px;
                border-radius: 4px;
                overflow: auto;
            }
        }
    }
</style>
