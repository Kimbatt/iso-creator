export const enum FileSystemNodeType {
    File,
    Directory,
}

interface InputFileSystemNodeBase {
    name: string;
}

export type InputFileSystemFileNode = InputFileSystemNodeBase & {
    type: FileSystemNodeType.File;
    contents: Blob;

    date?: Date;
};

export type InputFileSystemDirectoryNode = InputFileSystemNodeBase & {
    type: FileSystemNodeType.Directory;
    children: InputFileSystemNode[];
};

export type InputFileSystemNode = InputFileSystemFileNode | InputFileSystemDirectoryNode;

export interface IsoCreationParameters {
    // TODO: add more parameters

    volumeName: string;
}

const sectorSize = 2048;
const sectorSizeMask = sectorSize - 1;
const maxFileSize = 0x100000000 - sectorSize;
const appIdentifier = "kimbatt.github.io/iso-creator";

interface FileOrDirectoryEntryBase {
    pvdNameBytes: Uint8Array;
    pvdName: string;
    jolietNameBytes: Uint8Array;
    jolietName: string;
}

type DirectoryEntry = FileOrDirectoryEntryBase & {
    type: FileSystemNodeType.Directory;

    id: number;
    parent: DirectoryEntry;

    children: FileOrDirectoryEntry[];
    pvdLba: number;
    pvdSectorCount: number;
    pvdUsedNames: Set<string>;
    jolietLba: number;
    jolietSectorCount: number;
    jolietUsedNames: Set<string>;

    originalName: string; // Just for error reporting
};

interface FileChunk {
    file: InputFileSystemFileNode;
    offset: number;
    size: number;
    lba: number;
    isLast: boolean;
}

type FileEntry = FileOrDirectoryEntryBase & {
    type: FileSystemNodeType.File;
    chunks: FileChunk[];
};

type FileOrDirectoryEntry = FileEntry | DirectoryEntry;

const enum VolumeDescriptorType {
    Primary = 1,
    Supplementary = 2,
    SetTerminator = 255,
}

const enum RecordFlags {
    None = 0b0,
    Directory = 0b10,
    Continuation = 0b10000000,
}

export const enum IsoCreationErrorCode {
    NameTooLong,
    NameAlreadyExists,
    TooManyDirectories,
    InvalidVolumeName,
}

export type IsoCreationError =
    | {
          type: IsoCreationErrorCode.TooManyDirectories;
      }
    | {
          type: IsoCreationErrorCode.NameTooLong;
          isDirectory: boolean;
          path: string[];
      }
    | {
          type: IsoCreationErrorCode.NameAlreadyExists;
          path: string[];
      }
    | {
          type: IsoCreationErrorCode.InvalidVolumeName;
          validationResult: VolumeNameValidationResult;
      };

export type IsoCreationResult =
    | {
          success: true;
          result: BlobPart[];
      }
    | {
          success: false;
          errors: IsoCreationError[];
      };

export const enum VolumeNameValidationResult {
    Ok,
    Empty,
    InvalidCharacter,
    TooLong,
}

export function validateVolumeName(name: string): VolumeNameValidationResult {
    if (name.length === 0) {
        // Name must not be empty
        return VolumeNameValidationResult.Empty;
    } else if (name.length > 16) {
        // Name cannot be longer than 16 characters
        // The limit is 32 bytes, but since the joliet version uses two bytes per character, the length limit is 16
        return VolumeNameValidationResult.TooLong;
    }

    // Name can only contain ascii characters
    for (let i = 0; i < name.length; ++i) {
        // No need to handle "multi-character" characters with `codePointAt`, those are outside the valid range anyways
        const ch = name.charCodeAt(i);

        if (ch < 0x20 || ch >= 0x7f) {
            return VolumeNameValidationResult.InvalidCharacter;
        }
    }

    return VolumeNameValidationResult.Ok;
}

// According to the standard, the length limit is 64 characters, but practically every reader supports length up to 110 characters
export const maxFileOrDirectoryNameLength = 64;

// Since the path table stores the parent directory number as 16-bit numbers, 65535 is the largest possible id that can be stored
export const maxNumDirectories = 65535;

const textEncoder = new TextEncoder();

const charCode0Bytes = new Uint8Array([0]); // "\0"
const charCode1Bytes = new Uint8Array([1]); // "\x01"

// Reused array for padding/empty regions
// 32 kilobytes is the maximum size ever used
const emptyArray = new Uint8Array(0x8000);

export function createISO(
    inputRootDirectory: InputFileSystemDirectoryNode,
    params: IsoCreationParameters,
): IsoCreationResult {
    const volumeNameValidationResult = validateVolumeName(params.volumeName);
    if (volumeNameValidationResult !== VolumeNameValidationResult.Ok) {
        return {
            success: false,
            errors: [
                {
                    type: IsoCreationErrorCode.InvalidVolumeName,
                    validationResult: volumeNameValidationResult,
                },
            ],
        };
    }

    const errors: IsoCreationError[] = [];

    const allDirectories: DirectoryEntry[] = [];
    const allChunks: FileChunk[] = [];
    const allFiles: InputFileSystemFileNode[] = [];
    let directoryId = 1;

    const rootDir: DirectoryEntry = {
        type: FileSystemNodeType.Directory,

        id: 1,

        // The parent id of the root directory is also 1, so for simplicity, use a self-reference here
        // (but that can only be set after creation)
        parent: null!,

        children: [],

        // Path table root is always 1 byte length, with a single zero byte
        pvdNameBytes: charCode0Bytes,
        pvdName: "\0",
        jolietNameBytes: charCode0Bytes,
        jolietName: "\0",

        pvdLba: 0,
        pvdSectorCount: 0,
        pvdUsedNames: new Set(),
        jolietLba: 0,
        jolietSectorCount: 0,
        jolietUsedNames: new Set(),

        originalName: "",
    };
    rootDir.parent = rootDir;

    allDirectories.push(rootDir);

    // Need to add directories in breadth-first order
    const queue: { inputDirectory: InputFileSystemDirectoryNode; isoDirectory: DirectoryEntry }[] = [
        {
            inputDirectory: inputRootDirectory,
            isoDirectory: rootDir,
        },
    ];

    while (queue.length !== 0) {
        const { inputDirectory: node, isoDirectory: parent } = queue.shift()!;

        for (const child of node.children) {
            const isDirectory = child.type === FileSystemNodeType.Directory;

            const jolietName = child.name;

            const nameTooLong = jolietName.length > maxFileOrDirectoryNameLength;
            if (nameTooLong || parent.jolietUsedNames.has(jolietName)) {
                // Name is too long or already exists, collect directory hierarchy for error reporting

                const path: string[] = [];
                let currentParent = parent;

                while (currentParent.id !== 1) {
                    path.unshift(currentParent.originalName);
                    currentParent = currentParent.parent;
                }

                path.push(child.name);

                if (nameTooLong) {
                    errors.push({
                        type: IsoCreationErrorCode.NameTooLong,
                        isDirectory,
                        path,
                    });
                } else {
                    errors.push({
                        type: IsoCreationErrorCode.NameAlreadyExists,
                        path,
                    });
                }
                continue;
            }

            parent.jolietUsedNames.add(jolietName);

            const pvdName = ensureValidPVD(child.name, isDirectory, parent.pvdUsedNames);

            // Since the input is ASCII, encoding as utf-8 will give the same result
            const pvdNameBytes = textEncoder.encode(pvdName);
            const jolietNameBytes = stringToBytesUCS2(jolietName);

            if (isDirectory) {
                const childDirectoryEntry: DirectoryEntry = {
                    type: FileSystemNodeType.Directory,
                    id: ++directoryId,
                    parent: parent,
                    children: [],

                    pvdNameBytes,
                    pvdName,
                    pvdUsedNames: new Set(),
                    jolietNameBytes,
                    jolietName,
                    jolietUsedNames: new Set(),

                    // These will be updated later
                    pvdLba: 0,
                    pvdSectorCount: 0,
                    jolietLba: 0,
                    jolietSectorCount: 0,

                    originalName: child.name,
                };

                allDirectories.push(childDirectoryEntry);
                parent.children.push(childDirectoryEntry);

                queue.push({
                    inputDirectory: child,
                    isoDirectory: childDirectoryEntry,
                });
            } else {
                const chunks: FileChunk[] = [];
                const totalSize = child.contents.size;

                // LBA values will be updated later

                if (totalSize === 0) {
                    // Empty file
                    chunks.push({
                        file: child,
                        offset: 0,
                        size: 0,
                        isLast: true,
                        lba: 0,
                    });

                    // Don't add empty files to the list of result files, since they have no content
                } else {
                    let offset = 0;

                    while (offset < totalSize) {
                        const size = Math.min(totalSize - offset, maxFileSize);
                        chunks.push({
                            file: child,
                            offset,
                            size,
                            lba: 0,
                            isLast: offset + size === totalSize,
                        });

                        offset += size;
                    }

                    allFiles.push(child);
                }

                allChunks.push(...chunks);

                parent.children.push({
                    type: FileSystemNodeType.File,
                    chunks,
                    pvdNameBytes,
                    pvdName,
                    jolietNameBytes,
                    jolietName,
                });
            }
        }
    }

    if (errors.length !== 0) {
        return {
            success: false,
            errors,
        };
    }

    if (directoryId > maxNumDirectories) {
        return {
            success: false,
            errors: [{ type: IsoCreationErrorCode.TooManyDirectories }],
        };
    }

    // Calculate sizes

    for (const dir of allDirectories) {
        dir.pvdSectorCount = getDirectorySectorCount(dir, false);
        dir.jolietSectorCount = getDirectorySectorCount(dir, true);
    }

    let pvdPathTableSize = 0;
    let jolietPathTableSize = 0;

    const getDirSizeForPathTable = (bytes: Uint8Array) => 8 + bytes.length + (bytes.length & 1);
    for (const dir of allDirectories) {
        pvdPathTableSize += getDirSizeForPathTable(dir.pvdNameBytes);
        jolietPathTableSize += getDirSizeForPathTable(dir.jolietNameBytes);
    }

    // Calculate LBAs (logical block addresses)

    let lba = 16;
    lba++; // Primary volume descriptor
    lba++; // Supplementary volume descriptor
    lba++; // Set terminator

    const pvdPathTableSectorCount = getSectorCount(pvdPathTableSize);
    const jolietPathTableSectorCount = getSectorCount(jolietPathTableSize);

    const pvdPathTableLbaL = lba;
    lba += pvdPathTableSectorCount;
    const pvdPathTableLbaM = lba;
    lba += pvdPathTableSectorCount;

    const jolietPathTableLbaL = lba;
    lba += jolietPathTableSectorCount;
    const jolietPathTableLbaM = lba;
    lba += jolietPathTableSectorCount;

    // For empty files/directories, keep the lba at zero

    for (const dir of allDirectories) {
        if (dir.pvdSectorCount !== 0) {
            dir.pvdLba = lba;
            lba += dir.pvdSectorCount;
        }
    }
    for (const dir of allDirectories) {
        if (dir.jolietSectorCount !== 0) {
            dir.jolietLba = lba;
            lba += dir.jolietSectorCount;
        }
    }
    for (const chunk of allChunks) {
        const sectorCount = getSectorCount(chunk.size);

        if (sectorCount !== 0) {
            chunk.lba = lba;
            lba += sectorCount;
        }
    }

    const totalNumSectors = lba;

    const creationDate = new Date();

    const resultParts: BlobPart[] = [
        // The first 32 kilobytes are not used
        emptyArray,

        // Primary volume descriptor
        buildVolumeDescriptor(
            VolumeDescriptorType.Primary,
            params.volumeName,
            totalNumSectors,
            pvdPathTableSize,
            pvdPathTableLbaL,
            pvdPathTableLbaM,
            rootDir.pvdLba,
            rootDir.pvdSectorCount,
            creationDate,
            false,
        ),

        // Supplementary volume descriptor for joliet
        buildVolumeDescriptor(
            VolumeDescriptorType.Supplementary,
            params.volumeName,
            totalNumSectors,
            jolietPathTableSize,
            jolietPathTableLbaL,
            jolietPathTableLbaM,
            rootDir.jolietLba,
            rootDir.jolietSectorCount,
            creationDate,
            true,
        ),

        // Volume descriptor end
        initializeVolumeDescriptor(VolumeDescriptorType.SetTerminator)[0],

        // Path tables
        buildPathTable(false, true, pvdPathTableSize, allDirectories),
        buildPathTable(false, false, pvdPathTableSize, allDirectories),
        buildPathTable(true, true, jolietPathTableSize, allDirectories),
        buildPathTable(true, false, jolietPathTableSize, allDirectories),
    ];

    // Directory data
    for (const dir of allDirectories) {
        resultParts.push(buildDirectoryData(dir, false, creationDate));
    }
    for (const dir of allDirectories) {
        resultParts.push(buildDirectoryData(dir, true, creationDate));
    }

    // File contents
    for (const { contents } of allFiles) {
        if (contents.size === 0) {
            // No need to add anything for empty files
            continue;
        }

        resultParts.push(contents);

        // If the size is not a multiple of the sector size, then add padding so that the total size becomes a multiple of the sector size

        const padding = (sectorSize - (contents.size & sectorSizeMask)) & sectorSizeMask;
        if (padding !== 0) {
            resultParts.push(emptyArray.subarray(0, padding));
        }
    }

    return {
        success: true,
        result: resultParts,
    };
}

function ensureValidPVD(name: string, isDirectory: boolean, usedNames: Set<string>): string {
    // It seems like other programs don't really care about these limitations, they allow names up to 220 characters
    // They also don't always add ;1 at the end
    // But just to be sure, follow the spec here, the joliet names can be longer anyways

    // File and directory names must have only A-Z, 0-9, or underscore characters
    // File names can additionally have one dot for the extension, plus a semicolon and a version number at the end (which is always just ;1)
    // To be safe, names lengths are limited to 30 characters

    const maxLength = 30;

    let suffix = "";

    let newName = name.toUpperCase().replace(/[^A-Z0-9_.]/g, "_");
    if (isDirectory) {
        newName = newName.substring(0, maxLength).replaceAll(".", "_");
    } else {
        const dotIndex = newName.lastIndexOf(".");

        if (dotIndex < 0) {
            // No extension
            newName = newName.substring(0, maxLength);
        } else {
            if (dotIndex + 1 >= newName.length) {
                // Dot is the last character
                newName = newName.substring(0, Math.min(maxLength, dotIndex));
            } else {
                // Has extension, replace dots except the last one

                let nameWithoutExtension = newName.substring(0, dotIndex);
                let extension = newName.substring(dotIndex + 1);

                // Arbitrary limit to extension length
                extension = extension.substring(0, 8);
                extension = "." + extension;

                const maxNameLengthWithoutExtension = maxLength - extension.length;
                nameWithoutExtension = nameWithoutExtension.substring(0, maxNameLengthWithoutExtension);

                newName = nameWithoutExtension.replaceAll(".", "_");
                suffix = extension;
            }
        }

        suffix += ";1";
    }

    let counter = 0;
    const nameLength = newName.length;

    // Check if the name already exists, rename to "newname~0.ext" or similar if needed
    while (true) {
        const fullname = newName + suffix;
        if (!usedNames.has(fullname)) {
            usedNames.add(fullname);
            return fullname;
        }

        const counterStr = (counter++).toString();
        newName = newName.substring(0, nameLength - 1 - counterStr.length) + "~" + counterStr;
    }
}

function stringToBytesUCS2(str: string): Uint8Array {
    const bytes = new Uint8Array(str.length * 2);
    writeStringUCS2(new DataView(bytes.buffer), 0, str, bytes.length);
    return bytes;
}

function getSectorCount(size: number) {
    return Math.ceil(size / sectorSize);
}

function roundUpToSectorSize(size: number) {
    return getSectorCount(size) * sectorSize;
}

function getDirectoryRecordSize(offset: number, nameLength: number) {
    // 1-byte padding if the name length is even
    const length = 34 + nameLength - (nameLength & 1);

    // If the name would go through a sector boundary, then move the offset to the start of a new sector
    if ((offset & sectorSizeMask) + length > sectorSize) {
        offset = roundUpToSectorSize(offset);
    }

    return { offset, length };
}

function getDirectorySectorCount(dir: DirectoryEntry, isJoliet: boolean): number {
    let totalOffset = 0;

    const addRecordLength = (nameLength: number) => {
        const { offset, length } = getDirectoryRecordSize(totalOffset, nameLength);
        totalOffset = offset + length;
    };

    // All directories start with the "." and ".." special entries
    addRecordLength(charCode0Bytes.length);
    addRecordLength(charCode1Bytes.length);

    for (const child of dir.children) {
        const nameLength = isJoliet ? child.jolietNameBytes.length : child.pvdNameBytes.length;

        if (child.type === FileSystemNodeType.Directory) {
            addRecordLength(nameLength);
        } else {
            for (let i = 0; i < child.chunks.length; ++i) {
                addRecordLength(nameLength);
            }
        }
    }

    return getSectorCount(totalOffset);
}

function write16BothEndian(view: DataView, offset: number, value: number) {
    view.setUint16(offset + 0, value, true);
    view.setUint16(offset + 2, value, false);
}

function write32BothEndian(view: DataView, offset: number, value: number) {
    view.setUint32(offset + 0, value, true);
    view.setUint32(offset + 4, value, false);
}

function writeStringASCII(view: DataView, offset: number, str: string, maxByteLength: number) {
    // This function is only called with strings that only contain ASCII characters

    const strLength = Math.min(str.length, maxByteLength);

    let i = 0;
    for (; i < strLength; ++i) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }

    for (; i < maxByteLength; ++i) {
        view.setUint8(offset + i, 0x20);
    }
}

function writeStringUCS2(view: DataView, offset: number, str: string, maxByteLength: number) {
    // Since javascript strings are already utf-16, just write the character code as-is (big endian)

    const maxStrLength = maxByteLength / 2;
    const strLength = Math.min(str.length, maxStrLength);

    let i = 0;
    for (; i < strLength; ++i) {
        view.setUint16(offset + i * 2, str.charCodeAt(i), false);
    }

    for (; i < maxStrLength; ++i) {
        view.setUint16(offset + i * 2, 0x20, false);
    }
}

function writeDirectoryDate(view: DataView, offset: number, date: Date | null) {
    if (date === null) {
        // Don't write anything, keep zero values
        return;
    }

    view.setUint8(offset + 0, Math.min(date.getUTCFullYear() - 1900, 255));
    view.setUint8(offset + 1, date.getUTCMonth() + 1);
    view.setUint8(offset + 2, date.getUTCDate());
    view.setUint8(offset + 3, date.getUTCHours());
    view.setUint8(offset + 4, date.getUTCMinutes());
    view.setUint8(offset + 5, date.getUTCSeconds());
}

const emptyVolumeDate = "0000000000000000\0";

function writeVolumeDate(view: DataView, offset: number, date: Date | null) {
    if (date === null) {
        writeStringASCII(view, offset, emptyVolumeDate, 17);
    } else {
        const padStart = (n: number) => n.toString().padStart(2, "0");

        const dateString =
            "" +
            Math.min(date.getUTCFullYear(), 9999) +
            padStart(date.getUTCMonth() + 1) +
            padStart(date.getUTCDate()) +
            padStart(date.getUTCHours()) +
            padStart(date.getUTCMinutes()) +
            padStart(date.getUTCSeconds()) +
            "00"; // Hundredths of the second

        writeStringASCII(view, offset, dateString, 17);
    }
}

function initializeVolumeDescriptor(type: VolumeDescriptorType): [Uint8Array<ArrayBuffer>, DataView] {
    const bytes = new Uint8Array(sectorSize);
    const view = new DataView(bytes.buffer);

    // Byte 0: volume descriptor type
    view.setUint8(0, type);

    // Bytes 1-5: standard identifier (always "CD001")
    writeStringASCII(view, 1, "CD001", 5);

    // Byte 6: version (always 1)
    view.setUint8(6, 1);

    // Byte 7: unused (always 0)

    return [bytes, view];
}

function buildVolumeDescriptor(
    type: VolumeDescriptorType,
    volumeName: string,
    numSectors: number,
    pathTableSize: number,
    pathTableLocationL: number,
    pathTableLocationM: number,
    rootLBA: number,
    rootSectorCount: number,
    creationDate: Date,
    isJoliet: boolean,
): Uint8Array<ArrayBuffer> {
    const [bytes, view] = initializeVolumeDescriptor(type);

    const stringWriterFunc = isJoliet ? writeStringUCS2 : writeStringASCII;

    // Bytes 8-39: system identifier
    stringWriterFunc(view, 8, "", 32);

    // Bytes 40-71: volume identifier
    stringWriterFunc(view, 40, volumeName, 32);

    // Bytes 72-79: unused (always 0)

    // Bytes 80-87: number of logical blocks
    write32BothEndian(view, 80, numSectors);

    // Bytes 88-119 are unused unless the joliet extension is used

    if (isJoliet) {
        // Bytes 88-90: level 3 escape sequence
        view.setUint8(88, 0x25);
        view.setUint8(89, 0x2f);
        view.setUint8(90, 0x45);
    }

    // Bytes 120-123: volume set size
    write16BothEndian(view, 120, 1);

    // Bytes 124-127: volume sequence number
    write16BothEndian(view, 124, 1);

    // Bytes 128-131: logical block size
    write16BothEndian(view, 128, sectorSize);

    // Bytes 132-139: path table size
    write32BothEndian(view, 132, pathTableSize);

    // Bytes 140-143: type L path table location
    view.setUint32(140, pathTableLocationL, true);

    // Btyes 144-147: type L optional path table location (not used)

    // Bytes 148-151: type M path table location
    view.setUint32(148, pathTableLocationM, false);

    // Bytes 152-155: type M optional path table location (not used)

    // Bytes 156-189: directory record for the root directory
    // This is always 34 bytes long
    writeDirectoryRecord(
        bytes,
        view,
        156,
        charCode0Bytes,
        rootLBA,
        rootSectorCount * sectorSize,
        RecordFlags.Directory,
        creationDate,
    );

    // Bytes 190-317: volume set identifier
    stringWriterFunc(view, 190, "", 128);

    // Bytes 318-445: publisher identifier
    stringWriterFunc(view, 318, "", 128);

    // Bytes 446-573: data preparer identifier
    stringWriterFunc(view, 446, "", 128);

    // Bytes 574-701: application identifier
    stringWriterFunc(view, 574, appIdentifier, 128);

    // Bytes 702-738: copyright file identifier
    stringWriterFunc(view, 702, "", 37);

    // Bytes 739-775: abstract file identifier
    stringWriterFunc(view, 739, "", 37);

    // Bytes 776-812: bibliographic file identifier
    stringWriterFunc(view, 776, "", 37);

    // Bytes 813-829: volume creation date
    writeVolumeDate(view, 813, creationDate);

    // Bytes 830-846: volume modification date
    writeVolumeDate(view, 830, creationDate);

    // Bytes 847-863: volume expiration date (never expires)
    writeVolumeDate(view, 847, null);

    // Bytes 864-880: volume effective date (always effective)
    writeVolumeDate(view, 864, null);

    // Byte 881: file structure version (always 1)
    view.setUint8(881, 1);

    // Rest of the bytes are all zeros

    return bytes;
}

function buildPathTable(
    isJoliet: boolean,
    isLittleEndian: boolean,
    size: number,
    directories: DirectoryEntry[],
): Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(roundUpToSectorSize(size));
    const view = new DataView(bytes.buffer);

    let offset = 0;

    for (const dir of directories) {
        const nameBytes = isJoliet ? dir.jolietNameBytes : dir.pvdNameBytes;

        // Byte 0: length of directory identifier
        view.setUint8(offset + 0, nameBytes.length);

        // Byte 1: extended attribute record length (not used)

        // Bytes 2-5: location of extent (big endian for type M path tables)
        view.setUint32(offset + 2, isJoliet ? dir.jolietLba : dir.pvdLba, isLittleEndian);

        // Bytes 6-7: parent directory number (big endian for type M path tables)
        view.setUint16(offset + 6, dir.parent.id, isLittleEndian);

        // Bytes 8 to end: directory name
        bytes.set(nameBytes, offset + 8);

        // 1 byte padding if the name length is odd
        offset += 8 + nameBytes.length + (nameBytes.length & 1);
    }

    return bytes;
}

function writeDirectoryRecord(
    bytes: Uint8Array,
    view: DataView,
    totalOffset: number,
    nameBytes: Uint8Array,
    targetLba: number,
    dataSize: number,
    flags: RecordFlags,
    creationDate: Date | null,
) {
    const { offset, length } = getDirectoryRecordSize(totalOffset, nameBytes.length);

    // Byte 0: length of directory record
    view.setUint8(offset + 0, length);

    // Byte 1: extended attribute record length (not used)

    // Bytes 2-9: location of extent
    write32BothEndian(view, offset + 2, targetLba);

    // Bytes 10-17: size of extent
    write32BothEndian(view, offset + 10, dataSize);

    // Bytes 18-24: date
    writeDirectoryDate(view, offset + 18, creationDate);

    // Byte 25: flags
    view.setUint8(offset + 25, flags);

    // Byte 26: interleaved mode file unit size (not used)
    // Byte 27: interleaved mode gap size (not used)

    // Bytes 28-31: volume sequence number (always 1 here)
    write16BothEndian(view, offset + 28, 1);

    // Byte 32: file name length
    view.setUint8(offset + 32, nameBytes.length);

    // Bytes 33 to end: file name
    bytes.set(nameBytes, offset + 33);

    // Optionally one byte of padding is added here, which is already part of `length`

    return offset + length;
}

function buildDirectoryData(dir: DirectoryEntry, isJoliet: boolean, creationDate: Date): Uint8Array<ArrayBuffer> {
    const getDirectorySize = (directory: DirectoryEntry) =>
        (isJoliet ? directory.jolietSectorCount : directory.pvdSectorCount) * sectorSize;

    const size = getDirectorySize(dir);
    const bytes = new Uint8Array(size);
    const view = new DataView(bytes.buffer);

    let totalOffset = 0;
    const writeRecord = (
        nameBytes: Uint8Array,
        targetLba: number,
        dataSize: number,
        flags: RecordFlags,
        date?: Date,
    ) => {
        totalOffset = writeDirectoryRecord(
            bytes,
            view,
            totalOffset,
            nameBytes,
            targetLba,
            dataSize,
            flags,
            date ?? creationDate,
        );
    };

    // Current directory ("." entry)
    writeRecord(charCode0Bytes, isJoliet ? dir.jolietLba : dir.pvdLba, size, RecordFlags.Directory);

    // Parent directory (".." entry)
    const parent = dir.parent;
    writeRecord(
        charCode1Bytes,
        isJoliet ? parent.jolietLba : parent.pvdLba,
        getDirectorySize(parent),
        RecordFlags.Directory,
    );

    for (const child of dir.children) {
        const nameBytes = isJoliet ? child.jolietNameBytes : child.pvdNameBytes;

        if (child.type === FileSystemNodeType.Directory) {
            writeRecord(
                nameBytes,
                isJoliet ? child.jolietLba : child.pvdLba,
                getDirectorySize(child),
                RecordFlags.Directory,
            );
        } else {
            for (const chunk of child.chunks) {
                writeRecord(
                    nameBytes,
                    chunk.lba,
                    chunk.size,
                    chunk.isLast ? RecordFlags.None : RecordFlags.Continuation,
                    chunk.file.date,
                );
            }
        }
    }

    return bytes;
}
