import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads', 'mockups');
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

const VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folderId = req.mockupUploadFolder || 'pending';
    const dir = path.join(UPLOAD_ROOT, folderId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '';
    const prefix = file.fieldname === 'video' ? 'video' : 'logo';
    cb(null, `${prefix}-${uuidv4()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'logo') {
    if (IMAGE_MIMES.has(file.mimetype)) return cb(null, true);
    return cb(
      new Error('Logo must be an image (JPEG, PNG, GIF, WebP, or SVG).'),
      false
    );
  }
  if (file.fieldname === 'video') {
    if (VIDEO_MIMES.has(file.mimetype)) return cb(null, true);
    return cb(
      new Error('Video must be MP4, WebM, MOV, AVI, or MKV.'),
      false
    );
  }
  return cb(new Error(`Unexpected upload field: ${file.fieldname}`), false);
};

/** Ensure each request gets an isolated upload folder before multer runs. */
export const prepareMockupUploadFolder = (req, _res, next) => {
  req.mockupUploadFolder = uuidv4();
  next();
};

const mockupUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 80 * 1024 * 1024,
    files: 2,
  },
});

export const mockupCreateUpload = mockupUpload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'video', maxCount: 1 },
]);

export { UPLOAD_ROOT };
export default mockupUpload;
