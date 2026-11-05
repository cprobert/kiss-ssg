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
 * Whether an image's bytes run to the end its own structure declares, read
 * from a few bytes and never decoded: a JPEG ends with its EOI marker, a PNG
 * with an `IEND` chunk, a WebP's RIFF length is the file's, and an AVIF's
 * top-level boxes add up to exactly the file. A file cut short fails, and so
 * does a Git LFS pointer or anything else standing in for the image.
 *
 * @param {ByteReader} reader
 * @param {string} format `jpeg`, `png`, `webp` or `avif`
 * @returns {boolean}
 */
export function isCompleteImage(reader: ByteReader, format: string): boolean;
/**
 * Whether a file holds a whole image of the given format and width: what a
 * cache entry must be before a build copies it rather than encoding again.
 *
 * @param {string} file
 * @param {{ format: string, width: number }} expected
 * @returns {boolean}
 */
export function isWholeImageFile(file: string, expected: {
    format: string;
    width: number;
}): boolean;
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
