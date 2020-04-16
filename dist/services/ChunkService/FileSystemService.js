"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const NotAuthorizedError_1 = __importDefault(require("../../utils/NotAuthorizedError"));
const NotFoundError_1 = __importDefault(require("../../utils/NotFoundError"));
const crypto_1 = __importDefault(require("crypto"));
const getBusboyData_1 = __importDefault(require("./utils/getBusboyData"));
const videoChecker_1 = __importDefault(require("../../utils/videoChecker"));
const fs_1 = __importDefault(require("fs"));
const uuid_1 = __importDefault(require("uuid"));
const awaitUploadStream_1 = __importDefault(require("./utils/awaitUploadStream"));
const file_1 = __importDefault(require("../../models/file"));
const getFileSize_1 = __importDefault(require("./utils/getFileSize"));
const index_1 = __importDefault(require("../../db/utils/fileUtils/index"));
const awaitStream_1 = __importDefault(require("./utils/awaitStream"));
const createThumbnailFS_1 = __importDefault(require("../FileService/utils/createThumbnailFS"));
const imageChecker_1 = __importDefault(require("../../utils/imageChecker"));
const thumbnail_1 = __importDefault(require("../../models/thumbnail"));
const streamToBuffer_1 = __importDefault(require("../../utils/streamToBuffer"));
const user_1 = __importDefault(require("../../models/user"));
const dbUtilsFile = new index_1.default();
// implements ChunkInterface
class FileSystemService {
    constructor() {
        this.uploadFile = (user, busboy, req) => __awaiter(this, void 0, void 0, function* () {
            const password = user.getEncryptionKey();
            if (!password)
                throw new NotAuthorizedError_1.default("Invalid Encryption Key");
            const initVect = crypto_1.default.randomBytes(16);
            const CIPHER_KEY = crypto_1.default.createHash('sha256').update(password).digest();
            const cipher = crypto_1.default.createCipheriv('aes256', CIPHER_KEY, initVect);
            const { file, filename, formData } = yield getBusboyData_1.default(busboy);
            const parent = formData.get("parent") || "/";
            const parentList = formData.get("parentList") || "/";
            const size = formData.get("size") || "";
            let hasThumbnail = false;
            let thumbnailID = "";
            const isVideo = videoChecker_1.default(filename);
            const systemFileName = uuid_1.default.v4();
            const metadata = {
                owner: user._id,
                parent,
                parentList,
                hasThumbnail,
                thumbnailID,
                isVideo,
                size,
                IV: initVect,
                filePath: `/Users/kylehoell/Documents/fstestdata/${systemFileName}`
            };
            const fileWriteStream = fs_1.default.createWriteStream(metadata.filePath);
            yield awaitUploadStream_1.default(file.pipe(cipher), fileWriteStream, req);
            const date = new Date();
            const encryptedFileSize = yield getFileSize_1.default(metadata.filePath);
            const currentFile = new file_1.default({
                filename,
                uploadDate: date.toISOString(),
                length: encryptedFileSize,
                metadata
            });
            yield currentFile.save();
            console.log(currentFile);
            const imageCheck = imageChecker_1.default(currentFile.filename);
            if (currentFile.length < 15728640 && imageCheck) {
                const updatedFile = yield createThumbnailFS_1.default(currentFile, filename, user);
                return updatedFile;
            }
            else {
                return currentFile;
            }
        });
        this.downloadFile = (user, fileID, res) => __awaiter(this, void 0, void 0, function* () {
            const currentFile = yield dbUtilsFile.getFileInfo(fileID, user._id);
            if (!currentFile)
                throw new NotFoundError_1.default("Download File Not Found");
            const password = user.getEncryptionKey();
            if (!password)
                throw new NotAuthorizedError_1.default("Invalid Encryption Key");
            const filePath = currentFile.metadata.filePath;
            const IV = currentFile.metadata.IV.buffer;
            const readStream = fs_1.default.createReadStream(filePath);
            const CIPHER_KEY = crypto_1.default.createHash('sha256').update(password).digest();
            const decipher = crypto_1.default.createDecipheriv('aes256', CIPHER_KEY, IV);
            res.set('Content-Type', 'binary/octet-stream');
            res.set('Content-Disposition', 'attachment; filename="' + currentFile.filename + '"');
            res.set('Content-Length', currentFile.metadata.size.toString());
            yield awaitStream_1.default(readStream.pipe(decipher), res);
        });
        this.getThumbnail = (user, id) => __awaiter(this, void 0, void 0, function* () {
            const password = user.getEncryptionKey();
            if (!password)
                throw new NotAuthorizedError_1.default("Invalid Encryption Key");
            const thumbnail = yield thumbnail_1.default.findById(id);
            if (thumbnail.owner !== user._id.toString()) {
                throw new NotAuthorizedError_1.default('Thumbnail Unauthorized Error');
            }
            const iv = thumbnail.IV;
            const CIPHER_KEY = crypto_1.default.createHash('sha256').update(password).digest();
            const decipher = crypto_1.default.createDecipheriv("aes256", CIPHER_KEY, iv);
            const readStream = fs_1.default.createReadStream(thumbnail.path);
            const bufferData = yield streamToBuffer_1.default(readStream.pipe(decipher));
            return bufferData;
        });
        this.getFullThumbnail = (user, fileID, res) => __awaiter(this, void 0, void 0, function* () {
            const userID = user._id;
            const file = yield dbUtilsFile.getFileInfo(fileID, userID);
            if (!file)
                throw new NotFoundError_1.default("File Thumbnail Not Found");
            const password = user.getEncryptionKey();
            const IV = file.metadata.IV.buffer;
            if (!password)
                throw new NotAuthorizedError_1.default("Invalid Encryption Key");
            const readStream = fs_1.default.createReadStream(file.metadata.filePath);
            const CIPHER_KEY = crypto_1.default.createHash('sha256').update(password).digest();
            const decipher = crypto_1.default.createDecipheriv('aes256', CIPHER_KEY, IV);
            res.set('Content-Type', 'binary/octet-stream');
            res.set('Content-Disposition', 'attachment; filename="' + file.filename + '"');
            res.set('Content-Length', file.metadata.size.toString());
            console.log("Sending Full Thumbnail...");
            yield awaitStream_1.default(readStream.pipe(decipher), res);
            console.log("Full thumbnail sent");
        });
        this.streamVideo = (user, fileID, headers, res) => __awaiter(this, void 0, void 0, function* () {
            const userID = user._id;
            const currentFile = yield dbUtilsFile.getFileInfo(fileID, userID);
            if (!currentFile)
                throw new NotFoundError_1.default("Video File Not Found");
            const password = user.getEncryptionKey();
            if (!password)
                throw new NotAuthorizedError_1.default("Invalid Encryption Key");
            const fileSize = currentFile.metadata.size;
            const range = headers.range;
            const parts = range.replace(/bytes=/, "").split("-");
            let start = parseInt(parts[0], 10);
            let end = parts[1]
                ? parseInt(parts[1], 10)
                : fileSize - 1;
            const chunksize = (end - start) + 1;
            const IV = currentFile.metadata.IV.buffer;
            let head = {
                'Content-Range': 'bytes ' + start + '-' + end + '/' + fileSize,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'video/mp4'
            };
            const readStream = fs_1.default.createReadStream(currentFile.metadata.filePath, { start: start,
                end: end });
            const CIPHER_KEY = crypto_1.default.createHash('sha256').update(password).digest();
            const decipher = crypto_1.default.createDecipheriv('aes256', CIPHER_KEY, IV);
            res.writeHead(206, head);
            yield awaitStream_1.default(readStream.pipe(decipher), res);
        });
        this.getPublicDownload = (fileID, tempToken, res) => __awaiter(this, void 0, void 0, function* () {
            const file = yield dbUtilsFile.getPublicFile(fileID);
            if (!file || !file.metadata.link || file.metadata.link !== tempToken) {
                throw new NotAuthorizedError_1.default("File Not Public");
            }
            const user = yield user_1.default.findById(file.metadata.owner);
            const password = user.getEncryptionKey();
            if (!password)
                throw new NotAuthorizedError_1.default("Invalid Encryption Key");
            const IV = file.metadata.IV.buffer;
            const readStream = fs_1.default.createReadStream(file.metadata.filePath);
            const CIPHER_KEY = crypto_1.default.createHash('sha256').update(password).digest();
            const decipher = crypto_1.default.createDecipheriv('aes256', CIPHER_KEY, IV);
            res.set('Content-Type', 'binary/octet-stream');
            res.set('Content-Disposition', 'attachment; filename="' + file.filename + '"');
            res.set('Content-Length', file.metadata.size.toString());
            yield awaitStream_1.default(readStream.pipe(decipher), res);
            if (file.metadata.linkType === "one") {
                console.log("removing public link");
                yield dbUtilsFile.removeOneTimePublicLink(fileID);
            }
        });
    }
}
exports.default = FileSystemService;
