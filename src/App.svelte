<script
    module
    lang="ts"
>
    import {
        createISO,
        FileSystemNodeType,
        type InputFileSystemDirectoryNode,
        type IsoCreationParameters,
    } from "./iso9660";

    let a: HTMLAnchorElement;
    let folderSelector: HTMLInputElement;

    const params: IsoCreationParameters = {
        volumeName: "test 1234",
    };

    async function download() {
        if (folderSelector.files === null || folderSelector.files.length === 0) {
            return;
        }

        const files = folderSelector.files;

        type FolderWithChildFolderMap = InputFileSystemDirectoryNode & {
            folders: Map<string, FolderWithChildFolderMap>;
        };

        const rootFolder: FolderWithChildFolderMap = {
            type: FileSystemNodeType.Directory,
            children: [],
            folders: new Map(),
            name: "<root>",
        };

        for (const file of files) {
            let targetFolder = rootFolder;

            if (file.webkitRelativePath !== "") {
                const segments = file.webkitRelativePath.split("/");

                // First segment is the root folder, last segment is the file name
                for (let i = 1; i < segments.length - 1; ++i) {
                    const segment = segments[i];

                    let childFolder = targetFolder.folders.get(segment);
                    if (childFolder === undefined) {
                        childFolder = {
                            type: FileSystemNodeType.Directory,
                            children: [],
                            folders: new Map(),
                            name: segment,
                        };

                        targetFolder.folders.set(segment, childFolder);
                        targetFolder.children.push(childFolder);
                    }

                    targetFolder = childFolder;
                }
            }

            targetFolder.children.push({
                type: FileSystemNodeType.File,
                date: new Date(file.lastModified),
                contents: file,
                name: file.name,
            });
        }

        const result = createISO(rootFolder, params);
        if (!result.success) {
            console.error(result.errors);
            return;
        }

        const blob = new Blob(result.result);
        const url = URL.createObjectURL(blob);

        a.href = url;
        a.download = "test.iso";
        a.click();

        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 2000);
    }
</script>

<button onclick={download}>Download</button>

<a
    style="display: none;"
    bind:this={a}
></a>

<input
    type="file"
    webkitdirectory
    bind:this={folderSelector}
/>

<style lang="scss">
    :global(html) {
        background-color: black;
    }
</style>
