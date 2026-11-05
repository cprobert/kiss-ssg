/** @param {Buffer} buffer @returns {ByteReader} */
export function bufferReader(buffer: Buffer): ByteReader;
/**
 * The orientation and GPS presence in a TIFF structure (an EXIF payload,
 * starting at its `II`/`MM` byte-order mark).
 *
 * @param {Buffer} tiff
 * @returns {{ orientation: number, gps: boolean }}
 */
export function readTiff(tiff: Buffer): {
    orientation: number;
    gps: boolean;
};
/**
 * Parse an image's header.
 *
 * @param {ByteReader} reader
 * @returns {ImageHeader|null} `null` for a format it does not know, or a
 * file too damaged to say its size
 */
export function parseImageHeader(reader: ByteReader): ImageHeader | null;
/**
 * Read one file's header, memoised by path, modification time and size, so a
 * layout that asks for one image on every page reads it once.
 *
 * @param {string} file
 * @returns {ImageHeader|null} `null` when the file cannot be read or is not
 * an image this parser knows
 */
export function readImageHeader(file: string): ImageHeader | null;
/** The extensions `{{image}}` and the audit treat as raster images. */
export const RASTER_EXTENSION: RegExp;
export type ImageFormat = "jpeg" | "png" | "webp" | "avif" | "gif";
export type ImageHeader = {
    format: ImageFormat;
    /**
     * as displayed: swapped for EXIF orientations 5–8
     * and for an AVIF rotated by a quarter turn
     */
    width: number;
    /**
     * as displayed
     */
    height: number;
    /**
     * the EXIF orientation, 1–8; 1 when there is
     * none
     */
    orientation: number;
    /**
     * the EXIF GPS IFD names a latitude or longitude, or
     * the XMP packet names one
     */
    gps: boolean;
    /**
     * an APNG, an animated WebP, an AVIF image
     * sequence
     */
    animated: boolean;
};
/**
 * Positioned reads over a file or a buffer.
 */
export type ByteReader = {
    size: number;
    /**
     * may return
     * fewer bytes than asked for at the end of the data
     */
    read: (offset: number, length: number) => Buffer;
};
